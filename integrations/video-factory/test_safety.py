"""Test a reviewed VideoFactory snapshot in a throwaway copy, not the user's PC.

VF_SOURCE must point to a local source checkout of VideoFactory; never use a
production directory as the test destination. This script copies it, applies
safety.patch inside the temporary copy, and uses dummy keys. Requires FastAPI,
httpx, uvicorn and python-multipart in the test environment.
"""
import asyncio
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
SOURCE = os.environ.get('VF_SOURCE')

@unittest.skipUnless(SOURCE, 'Set VF_SOURCE to the VideoFactory source snapshot')
class SafetyPatchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_cwd = os.getcwd()
        cls.tmp = tempfile.TemporaryDirectory(prefix='vf-safety-test-')
        cls.root = Path(cls.tmp.name) / 'app'
        shutil.copytree(SOURCE, cls.root, ignore=shutil.ignore_patterns('.git', '.env', 'venv', '.venv', 'node_modules', '__pycache__'))
        subprocess.run(['git', 'apply', '--check', str(ROOT / 'safety.patch')], cwd=cls.root, check=True)
        subprocess.run(['git', 'apply', str(ROOT / 'safety.patch')], cwd=cls.root, check=True)
        (cls.root / '.env').write_text('GROQ_API_KEY=local-test-value\n', encoding='utf-8')
        os.environ.pop('VIDEOFACTORY_ENABLE_AUTO_UPLOAD', None)
        sys.path.insert(0, str(cls.root))
        spec = importlib.util.spec_from_file_location('vf_test_server', cls.root / 'src/web/server.py')
        cls.server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.server)
        from fastapi.testclient import TestClient
        cls.client = TestClient(cls.server.app, base_url='http://localhost:8000', client=('127.0.0.1', 43210))
        cls.remote = TestClient(cls.server.app, base_url='http://localhost:8000', client=('192.0.2.1', 43210))

    @classmethod
    def tearDownClass(cls):
        cls.client.close(); cls.remote.close()
        os.chdir(cls.old_cwd)
        cls.tmp.cleanup()

    def test_admin_shell_removed_and_network_guard(self):
        self.assertEqual(self.client.get('/api/admin/run_command', params={'cmd': 'echo test'}).status_code, 404)
        self.assertEqual(self.remote.get('/api/config').status_code, 403)
        self.assertEqual(self.client.get('/api/config', headers={'Host': 'attacker.invalid'}).status_code, 403)
        self.assertEqual(self.client.get('/api/config', headers={'Origin': 'https://attacker.invalid'}).status_code, 403)
        self.assertEqual(self.client.get('/api/config', headers={'Sec-Fetch-Site': 'cross-site'}).status_code, 403)

    def test_settings_redact_and_preserve_empty_inputs(self):
        response = self.client.get('/api/settings')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('local-test-value', response.text)
        self.assertTrue(response.json()['api_keys_configured']['GROQ_API_KEY'])
        saved = self.client.post('/api/settings/save', json={'settings': {}, 'api_keys': {'GROQ_API_KEY': ''}})
        self.assertEqual(saved.status_code, 200)
        self.assertIn('GROQ_API_KEY=local-test-value', (self.root / '.env').read_text())

    def test_corrupt_queue_is_not_overwritten(self):
        queue = self.root / 'output/upload_queue.json'
        original = 'corrupt queue content'
        queue.write_text(original)
        self.assertEqual(self.client.get('/api/queue/list').status_code, 500)
        self.assertEqual(queue.read_text(), original)

    def test_scheduler_manager_constructed_before_use(self):
        import ast
        tree = ast.parse((self.root / 'src/scripts/scheduler.py').read_text(encoding='utf-8'))
        func = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'run_daily_pipeline')
        assignments = [n.lineno for n in ast.walk(func) if isinstance(n, ast.Assign)
                       and any(isinstance(t, ast.Name) and t.id == 'manager' for t in n.targets)]
        uses = [n.lineno for n in ast.walk(func) if isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute) and isinstance(n.func.value, ast.Name)
                and n.func.value.id == 'manager' and n.func.attr == 'pick_media_for_reel']
        self.assertTrue(assignments and uses and min(assignments) < min(uses))

    def test_automatic_upload_disabled_by_default(self):
        async def unexpected():
            raise AssertionError('automatic upload started unexpectedly')
        original = self.server.check_upload_queue_loop
        try:
            self.server.check_upload_queue_loop = unexpected
            asyncio.run(self.server.startup_event())
        finally:
            self.server.check_upload_queue_loop = original

if __name__ == '__main__':
    unittest.main(verbosity=2)
