import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectVideoFactory } from './video-factory-check.mjs';

test('recognises unsafe code and malformed local queue without executing it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vf-check-'));
  try {
    await mkdir(path.join(root, 'src/web'), { recursive: true });
    await mkdir(path.join(root, 'src/scripts'), { recursive: true });
    await mkdir(path.join(root, 'output'));
    await writeFile(path.join(root, 'src/web/server.py'), 'route="/api/admin/run_command"\nsubprocess.run(cmd, shell=True)\nuvicorn.run(app, host="0.0.0.0")\n"api_keys": env_data');
    await writeFile(path.join(root, 'src/mcp_server.py'), 'method == "tools/call"\n"Reel render task sent to background worker"');
    await writeFile(path.join(root, 'src/scripts/scheduler.py'), 'manager.pick_media_for_reel()');
    await writeFile(path.join(root, 'src/scripts/render_worker.py'), '# exists');
    await writeFile(path.join(root, 'output/upload_queue.json'), '[]broken');
    const out = await inspectVideoFactory(root);
    assert.equal(out.queueJson, 'invalid');
    assert.equal(out.unsafeAdminRouteDetected, true);
    assert.equal(out.allInterfacesDetected, true);
    assert.equal(out.settingsMayExposeKeys, true);
    assert.equal(out.mcpInitializeDetected, false);
    assert.equal(out.mcpRenderStubDetected, true);
    assert.equal(out.schedulerUninitialisedManagerDetected, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects unrelated directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vf-empty-'));
  try { await assert.rejects(inspectVideoFactory(root), /Not a recognised/); }
  finally { await rm(root, { recursive: true, force: true }); }
});
