#!/usr/bin/env node
/**
 * Local-only VideoFactory music-to-short bridge. No queue or web server.
 * This does not upload or schedule. Run explicitly on the PC by its owner.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.flac', '.aac', '.ogg']);
const NICHES = new Set(['gospel', 'prayer', 'praise', 'motivational', 'swahili', 'tech']);
const ASPECTS = new Set(['9:16', '16:9', '1:1', '4:5']);

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

export async function prepareLocalRender({ root, audio, niche = 'gospel', aspect = '9:16' }) {
  if (!root || !audio) throw new Error('Provide both the VideoFactory folder and an audio file.');
  if (!NICHES.has(niche)) throw new Error('Unsupported niche.');
  if (!ASPECTS.has(aspect)) throw new Error('Unsupported aspect ratio.');
  const project = await realpath(root);
  const script = await realpath(path.join(project, 'src', 'scripts', 'render_worker.py'));
  if (!inside(project, script)) throw new Error('Renderer must be inside the VideoFactory folder.');
  const file = await realpath(path.resolve(audio));
  if (!(await stat(file)).isFile() || !AUDIO_EXTENSIONS.has(path.extname(file).toLowerCase())) {
    throw new Error('Audio must be a supported local audio file.');
  }
  const approved = [];
  for (const subdir of ['music', 'songs']) {
    try {
      const dir = await realpath(path.join(project, 'assets', subdir));
      if (inside(project, dir)) approved.push(dir);
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  if (!approved.some((dir) => inside(dir, file))) {
    throw new Error('Audio must be inside VideoFactory assets/music or assets/songs.');
  }
  // The renderer generates output locally; the identifier never comes from a job.
  const name = `timbre-${randomUUID()}.mp4`;
  const output = path.join(project, 'output', 'videos', name);
  return {
    project, script, output,
    payload: {
      script: {}, niche, mood: 'peaceful', music_only: true, music_path: file,
      output_name: name, aspect_ratio: aspect,
    },
  };
}

function spawnRenderer(python, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { cwd, stdio: 'inherit', windowsHide: true, shell: false });
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
}

export async function runLocalRender(options, runProcess = spawnRenderer) {
  const plan = await prepareLocalRender(options);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'timbre-vf-'));
  const payloadFile = path.join(temp, 'payload.json');
  try {
    await writeFile(payloadFile, JSON.stringify(plan.payload), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    const python = options.python || (process.platform === 'win32' ? 'python' : 'python3');
    const code = await runProcess(python, [plan.script, '--payload', payloadFile], plan.project);
    if (code !== 0) throw new Error(`VideoFactory render failed (exit ${code ?? 'unknown'}).`);
    let info;
    try { info = await stat(plan.output); } catch { throw new Error('Renderer finished but the expected output file was not found. Check the VideoFactory output configuration.'); }
    if (!info.isFile() || info.size === 0) throw new Error('Renderer output is missing or empty.');
    return { output: plan.output, bytes: info.size };
  } finally { await rm(temp, { recursive: true, force: true }); }
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--run') options.run = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (['--root', '--audio', '--python', '--niche', '--aspect'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      options[arg.slice(2)] = args[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Local only: node video-factory-local.mjs --root <VideoFactory folder> --audio <file> [--python <executable>] [--niche gospel] [--aspect 9:16] [--run]');
    console.log('Without --run, only checks the inputs. With --run, VideoFactory renders a music-only clip (up to 60 seconds); it does not upload.');
    return;
  }
  if (!options.run) {
    await prepareLocalRender(options);
    console.log('Inputs OK. Nothing rendered; add --run to explicitly start the local render.');
    return;
  }
  const result = await runLocalRender(options);
  console.log(`Local render complete: ${result.output} (${result.bytes} bytes). No upload was started.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
