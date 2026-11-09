#!/usr/bin/env node
// Read-only VideoFactory diagnostic. Never reads .env, credentials or media.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function optionalText(root, relative) {
  try { return await readFile(path.join(root, relative), 'utf8'); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}

export async function inspectVideoFactory(root) {
  const [server, mcp, scheduler, render, queue] = await Promise.all([
    optionalText(root, 'src/web/server.py'),
    optionalText(root, 'src/mcp_server.py'),
    optionalText(root, 'src/scripts/scheduler.py'),
    optionalText(root, 'src/scripts/render_worker.py'),
    optionalText(root, 'output/upload_queue.json'),
  ]);
  if (!server && !mcp && !render) throw new Error('Not a recognised VideoFactory folder. Point to the project root.');
  let queueJson = 'missing';
  if (queue !== null) {
    try { queueJson = Array.isArray(JSON.parse(queue)) ? 'valid' : 'not-array'; }
    catch { queueJson = 'invalid'; }
  }
  return {
    rendererPresent: render !== null,
    schedulerPresent: scheduler !== null,
    mcpPresent: mcp !== null,
    mcpInitializeDetected: mcp !== null && /method\s*==\s*['"]initialize['"]/.test(mcp),
    mcpRenderStubDetected: mcp !== null && /Reel render task sent to background worker/.test(mcp),
    unsafeAdminRouteDetected: server !== null && /\/api\/admin\/run_command/.test(server) && /shell\s*=\s*True/.test(server),
    allInterfacesDetected: server !== null && /uvicorn\.run\([^\n]*host\s*=\s*['"]0\.0\.0\.0['"]/.test(server),
    settingsMayExposeKeys: server !== null && /["']api_keys["']\s*:\s*env_data/.test(server),
    queueJson,
    schedulerUninitialisedManagerDetected: scheduler !== null && /manager\.pick_media_for_reel/.test(scheduler) && !/manager\s*=\s*MediaManager\s*\(/.test(scheduler),
  };
}

async function main() {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: node video-factory-check.mjs <VideoFactory folder>');
  const result = await inspectVideoFactory(path.resolve(root));
  console.log('VideoFactory read-only check (no secrets or media read):');
  console.log(`Renderer: ${result.rendererPresent ? 'present' : 'not found'}; scheduler: ${result.schedulerPresent ? 'present' : 'not found'}`);
  console.log(`MCP: ${result.mcpPresent ? 'present' : 'not found'}; initialize handler: ${result.mcpInitializeDetected ? 'detected' : 'not detected'}`);
  console.log(`MCP render placeholder: ${result.mcpRenderStubDetected ? 'detected' : 'not detected'}`);
  console.log(`Shell command route: ${result.unsafeAdminRouteDetected ? 'WARNING: detected' : 'not detected'}`);
  console.log(`Web server binds all interfaces: ${result.allInterfacesDetected ? 'WARNING: detected' : 'not detected'}`);
  console.log(`Settings return API keys: ${result.settingsMayExposeKeys ? 'WARNING: detected' : 'not detected'}`);
  console.log(`Local upload queue JSON: ${result.queueJson}`);
  console.log(`Scheduler manager missing: ${result.schedulerUninitialisedManagerDetected ? 'WARNING: detected' : 'not detected'}`);
  console.log('Static checks only; this does not run the server or prove the project is secure.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
