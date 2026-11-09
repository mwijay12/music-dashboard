import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareLocalRender, runLocalRender } from './video-factory-local.mjs';

async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), 'timbre-local-vf-test-'));
  const root = path.join(base, 'factory');
  await mkdir(path.join(root, 'src', 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'assets', 'music'), { recursive: true });
  await mkdir(path.join(root, 'output', 'videos'), { recursive: true });
  await writeFile(path.join(root, 'src', 'scripts', 'render_worker.py'), '# fixture, never executed');
  const audio = path.join(root, 'assets', 'music', 'song.mp3');
  await writeFile(audio, 'dummy');
  return { base, root, audio };
}

test('builds a local-only music payload without a webhook or user-supplied output path', async () => {
  const f = await fixture();
  try {
    const plan = await prepareLocalRender({ root: f.root, audio: f.audio, niche: 'swahili', aspect: '9:16' });
    assert.equal(plan.payload.music_only, true);
    assert.equal(plan.payload.music_path, f.audio);
    assert.match(plan.payload.output_name, /^timbre-[0-9a-f-]+\.mp4$/);
    assert.equal('webhook_url' in plan.payload, false);
    assert.equal(plan.output, path.join(f.root, 'output', 'videos', plan.payload.output_name));
  } finally { await rm(f.base, { recursive: true, force: true }); }
});

test('refuses audio outside the approved folders, unsupported options, and symlink escapes', async () => {
  const f = await fixture();
  try {
    const outside = path.join(f.base, 'outside.mp3'); await writeFile(outside, 'dummy');
    await assert.rejects(prepareLocalRender({ root: f.root, audio: outside }), /must be inside/);
    await assert.rejects(prepareLocalRender({ root: f.root, audio: f.audio, niche: '../x' }), /Unsupported niche/);
    await assert.rejects(prepareLocalRender({ root: f.root, audio: f.audio, aspect: 'unsafe' }), /Unsupported aspect/);
    if (process.platform !== 'win32') {
      const link = path.join(f.root, 'assets', 'music', 'linked.mp3');
      await symlink(outside, link);
      await assert.rejects(prepareLocalRender({ root: f.root, audio: link }), /must be inside/);
    }
  } finally { await rm(f.base, { recursive: true, force: true }); }
});

test('spawns the fixed render worker with argv and checks output before success', async () => {
  const f = await fixture();
  let tempPayload;
  try {
    const result = await runLocalRender({ root: f.root, audio: f.audio, python: 'python-test' }, async (cmd, args, cwd) => {
      assert.equal(cmd, 'python-test');
      assert.equal(cwd, f.root);
      assert.equal(args[0], path.join(f.root, 'src', 'scripts', 'render_worker.py'));
      assert.equal(args[1], '--payload');
      tempPayload = args[2];
      const payload = JSON.parse(await readFile(tempPayload, 'utf8'));
      assert.equal(payload.music_only, true);
      assert.equal(payload.webhook_url, undefined);
      await writeFile(path.join(f.root, 'output', 'videos', payload.output_name), 'fake video');
      return 0;
    });
    assert.equal(result.bytes, 10);
    await assert.rejects(stat(tempPayload), { code: 'ENOENT' });
  } finally { await rm(f.base, { recursive: true, force: true }); }
});

test('never claims success for failed renderer or missing output', async () => {
  const f = await fixture();
  try {
    await assert.rejects(runLocalRender({ root: f.root, audio: f.audio }, async () => 1), /render failed/);
    await assert.rejects(runLocalRender({ root: f.root, audio: f.audio }, async () => 0), /expected output file was not found/);
  } finally { await rm(f.base, { recursive: true, force: true }); }
});

test('CLI dry-run and real subprocess use the fixed entry point without an upload', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const f = await fixture();
  try {
    // An executable fixture, not VideoFactory: proves the subprocess contract.
    await writeFile(path.join(f.root, 'src', 'scripts', 'render_worker.py'), `
      const fs = require('fs'); const path = require('path');
      const payload = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
      if (payload.webhook_url || !payload.music_only) process.exit(9);
      fs.writeFileSync(path.join(process.cwd(), 'output', 'videos', payload.output_name), 'fixture-video');
    `);
    const cli = path.join(process.cwd(), 'worker', 'video-factory-local.mjs');
    const args = [cli, '--root', f.root, '--audio', f.audio, '--python', process.execPath];
    const dry = await run(process.execPath, args);
    assert.match(dry.stdout, /Nothing rendered/);
    const rendered = await run(process.execPath, [...args, '--run']);
    assert.match(rendered.stdout, /Local render complete/);
    assert.match(rendered.stdout, /No upload was started/);
  } finally { await rm(f.base, { recursive: true, force: true }); }
});
