#!/usr/bin/env node
/**
 * Timbre worker — the agent that runs on Mwijay's PC.
 *
 * Why a PC agent at all: the box is idle 20 hours a day, it has a 16 GB ceiling
 * and no usable GPU, which rules out local video diffusion — but it is perfect
 * for the boring half of publishing: ffmpeg assembly, loudness checks, file
 * naming, thumbnails, and getting things into the queue. n8n on the VPS stays
 * the brain; this is the pair of hands.
 *
 * Design rules, deliberately boring:
 *   1. **Outbound only.** The PC never opens a port. It polls n8n and posts
 *      back, so there is nothing to expose, no port forwarding, no TLS cert on
 *      Windows. If the PC is asleep the job simply waits.
 *   2. **No shell strings.** Every external command is spawned with an argv
 *      array, so a job payload can never inject a command.
 *   3. **Allowlisted handlers.** A job can only name a handler that exists in
 *      this file. Unknown types are rejected, not guessed at.
 *   4. **Result always reported.** Success and failure both go back to n8n, so
 *      the queue never quietly stalls.
 *
 * Usage:
 *   node worker/agent.mjs --url https://n8n.example.com/webhook/timbre/jobs \
 *        --token "$TIMBRE_WORKER_TOKEN" --once
 *   node worker/agent.mjs --url … --token … --loop --sleep 30
 *   node worker/agent.mjs --self-test          # no network, checks ffmpeg only
 *   node worker/agent.mjs --help
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, stat } from "node:fs/promises";

const VERSION = "0.1.0";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/* Handlers: the only things a job is allowed to ask for              */
/* ------------------------------------------------------------------ */

export async function run(cmd, args, options = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: options.cwd, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      resolve({ ok: false, code: -1, stdout, stderr: String(error.message), ms: Date.now() - started });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, code, stdout, stderr, ms: Date.now() - started });
    });
    if (options.timeoutMs) {
      setTimeout(() => child.kill("SIGKILL"), options.timeoutMs).unref?.();
    }
  });
}

const HANDLERS = {
  /** Phase-1 handshake: proves the PC can be reached and can answer. */
  async echo(payload) {
    return {
      ok: true,
      output: {
        echoed: payload,
        host: os.hostname(),
        platform: `${process.platform}-${process.arch}`,
        cpus: os.cpus().length,
        memoryGb: Math.round(os.totalmem() / 1024 ** 3),
        node: process.version,
      },
    };
  },

  /** Optional, read-only inventory. The PC owner chooses the folder locally;
   * no job-supplied path, process execution, credentials or media are read. */
  async videofactory_check(_payload, options) {
    const root = options.videoFactoryRoot;
    if (!root) return { ok: false, error: "VideoFactory check is not enabled on this PC" };
    try {
      const { inspectVideoFactory } = await import("./video-factory-check.mjs");
      return { ok: true, output: await inspectVideoFactory(root) };
    } catch {
      return { ok: false, error: "VideoFactory check failed; confirm the local folder and diagnostic module are available" };
    }
  },

  /** Duration/codec facts for any media file — cheap, and catches bad renders. */
  async probe(payload) {
    if (!payload?.file) return { ok: false, error: "probe needs { file }" };
    const result = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration,size:stream=codec_name,width,height",
      "-of",
      "json",
      payload.file,
    ]);
    if (!result.ok) return { ok: false, error: `ffprobe failed: ${result.stderr.slice(0, 400)}` };
    return { ok: true, output: JSON.parse(result.stdout || "{}") };
  },

  /**
   * The workhorse: a still image looped over an audio file, which is what 90%
   * of a music channel's uploads actually are. 1080p on a Ryzen 5 is roughly
   * real time, so a 5-minute track renders in ~5 minutes with the PC idle.
   */
  async render(payload) {
    if (!payload?.audio || !payload?.image || !payload?.out) {
      return { ok: false, error: "render needs { audio, image, out }" };
    }
    const seconds = Number(payload.seconds) || 0;
    const args = [
      "-y",
      "-loglevel",
      "error",
      "-loop",
      "1",
      "-i",
      payload.image,
      "-i",
      payload.audio,
      ...(seconds > 0 ? ["-t", String(seconds)] : ["-shortest"]),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      payload.out,
    ];
    const result = await run("ffmpeg", args, { cwd: payload.cwd, timeoutMs: payload.timeoutMs ?? 3 * 3600_000 });
    if (!result.ok) return { ok: false, error: `ffmpeg failed: ${result.stderr.slice(0, 600)}` };

    let bytes = null;
    try {
      bytes = (await stat(payload.out)).size;
    } catch {
      /* reported as null rather than failing the job */
    }
    return { ok: true, output: { out: payload.out, bytes, ms: result.ms } };
  },

  /** Concatenates a list of audio files into one long mix (1-hour mixes). */
  async concat(payload) {
    if (!Array.isArray(payload?.files) || payload.files.length < 2 || !payload?.out) {
      return { ok: false, error: "concat needs { files: [..2], out }" };
    }
    const listPath = path.join(payload.cwd ?? process.cwd(), "concat-list.txt");
    const list = payload.files.map((file) => `file '${String(file).replace(/'/g, "'\\''")}'`).join("\n");
    await mkdir(path.dirname(listPath), { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(listPath, `${list}\n`, "utf8");

    const result = await run(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", payload.out],
      { cwd: payload.cwd }
    );
    if (!result.ok) return { ok: false, error: `ffmpeg concat failed: ${result.stderr.slice(0, 600)}` };
    return { ok: true, output: { out: payload.out, segments: payload.files.length } };
  },
};

// Only these handlers may be invoked by a remote queue. The legacy media
// handlers lack filesystem confinement and are NOT remotely enabled yet.
export const CAPABILITIES = ["echo"];
export function remoteCapabilities(videoFactoryRoot = process.env.TIMBRE_VIDEOFACTORY_ROOT) {
  return videoFactoryRoot ? [...CAPABILITIES, "videofactory_check"] : [...CAPABILITIES];
}

/* ------------------------------------------------------------------ */
/* Job execution                                                       */
/* ------------------------------------------------------------------ */

export async function executeJob(job, options = {}) {
  const handlers = options.handlers ?? HANDLERS;
  const started = Date.now();
  if (!job || typeof job !== "object") return { ok: false, error: "job must be an object", ms: 0 };

  const handler = handlers[job.type];
  if (!handler) {
    return {
      ok: false,
      error: `unknown job type "${job.type}" — allowed: ${Object.keys(handlers).join(", ")}`,
      ms: Date.now() - started,
    };
  }

  try {
    const result = await handler(job.payload ?? {}, { cwd: options.cwd ?? process.cwd(), videoFactoryRoot: options.videoFactoryRoot });
    return { ...result, ms: result.ms ?? Date.now() - started };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
  }
}

/* ------------------------------------------------------------------ */
/* n8n transport                                                       */
/* ------------------------------------------------------------------ */

function authHeaders(token) {
  return {
    "content-type": "application/json",
    accept: "application/json",
    ...(token ? { "x-timbre-token": token } : {}),
    "x-timbre-worker": os.hostname(),
  };
}

export async function claimJob(options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(options.url, {
    method: "POST",
    headers: authHeaders(options.token),
    body: JSON.stringify({
      worker: options.worker ?? os.hostname(),
      capabilities: remoteCapabilities(options.videoFactoryRoot ?? process.env.TIMBRE_VIDEOFACTORY_ROOT),
      version: VERSION,
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  });

  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`claim failed: HTTP ${response.status} ${await response.text().catch(() => "")}`.trim());

  const text = await response.text();
  if (!text.trim()) return null;
  const body = JSON.parse(text);
  // n8n webhooks often wrap the answer: { job: {...} } or a bare array with one row.
  const job = body?.job ?? (Array.isArray(body) ? body[0] : body);
  if (!job || typeof job !== "object" || !job.type) return null;
  return job;
}

export async function reportResult(job, result, options) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = options.resultUrl ?? `${options.url.replace(/\/$/, "")}/result`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: authHeaders(options.token),
    body: JSON.stringify({
      jobId: job.id ?? null,
      ...(job.lease_id != null ? { leaseId: job.lease_id } : {}),
      type: job.type,
      ok: result.ok,
      output: result.output ?? null,
      error: result.error ?? null,
      ms: result.ms ?? null,
      worker: options.worker ?? os.hostname(),
      finishedAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  });
  if (!response.ok) throw new Error(`report failed: HTTP ${response.status}`);
  // Older handshake workflows have no acknowledgement field. Queue workflows
  // must reject stale leases even if a proxy returns an HTTP 200.
  if (job.lease_id != null) {
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error("report failed: invalid lease acknowledgement"); }
    if (body?.accepted !== true) throw new Error("report failed: lease not accepted");
  }
  return true;
}

export async function runOnce(options) {
  const job = await claimJob(options);
  if (!job) return { job: null, result: null };

  if (options.dryRun) {
    return { job, result: { ok: true, output: { dryRun: true, type: job.type }, ms: 0 } };
  }

  const videoFactoryRoot = options.videoFactoryRoot ?? process.env.TIMBRE_VIDEOFACTORY_ROOT;
  const allowed = remoteCapabilities(videoFactoryRoot);
  const result = allowed.includes(job.type)
    ? await executeJob(job, { cwd: options.cwd, handlers: options.handlers, videoFactoryRoot })
    : { ok: false, error: `remote job type not enabled: ${String(job.type).slice(0, 100)}`, ms: 0 };
  if (options.report !== false) await reportResult(job, result, options);
  return { job, result };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

export function parseArgs(argv) {
  const args = { mode: "once", sleep: 30, cwd: process.cwd(), token: process.env.TIMBRE_WORKER_TOKEN };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    if (arg === "--help" || arg === "-h") args.mode = "help";
    else if (arg === "--version") args.mode = "version";
    else if (arg === "--self-test") args.mode = "self-test";
    else if (arg === "--loop") args.mode = "loop";
    else if (arg === "--once") args.mode = "once";
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--url") args.url = next();
    else if (arg === "--result-url") args.resultUrl = next();
    else if (arg === "--token") args.token = next();
    else if (arg === "--worker") args.worker = next();
    else if (arg === "--sleep") args.sleep = Number(next()) || 30;
    else if (arg === "--max-jobs") args.maxJobs = Number(next()) || 0;
    else if (arg === "--cwd") args.cwd = next();
  }
  return args;
}

const HELP = `Timbre PC worker ${VERSION}

  node worker/agent.mjs --url <n8n-webhook> [--token <token>] [options]

  --url <url>         n8n webhook that hands out jobs (POST)
  --result-url <url>  where results go (default: <url>/result)
  --token <token>     shared secret, sent as x-timbre-token (or set TIMBRE_WORKER_TOKEN)
  --worker <name>     label shown in n8n (default: hostname)
  --once              claim at most one job, then exit (default)
  --loop              keep polling
  --sleep <seconds>   wait between polls in loop mode (default 30)
  --max-jobs <n>      stop after n jobs in loop mode (0 = forever)
  --cwd <dir>         base directory for relative paths in jobs
  --dry-run           claim a job but do not execute or report it
  --self-test         check ffmpeg/ffprobe locally, no network
  --help, --version

Remote capability: echo. Optional read-only VideoFactory check requires
TIMBRE_VIDEOFACTORY_ROOT and video-factory-check.mjs next to agent.mjs.
Legacy probe/render/concat are disabled for remote jobs pending path confinement.
`;

async function selfTest() {
  console.log(`worker ${VERSION} on ${os.hostname()} (${process.platform}-${process.arch})`);
  console.log(`cpus: ${os.cpus().length} · memory: ${Math.round(os.totalmem() / 1024 ** 3)} GB · node: ${process.version}`);
  const checks = [
    ["ffmpeg", ["-version"], "required for render"],
    ["ffprobe", ["-version"], "required for probe"],
  ];
  let ok = true;
  for (const [cmd, args, why] of checks) {
    const result = await run(cmd, args, { timeoutMs: 15_000 });
    const first = (result.stdout || result.stderr).split("\n")[0]?.slice(0, 90) ?? "";
    if (result.ok) console.log(`  ✓ ${cmd.padEnd(8)} ${first}`);
    else {
      ok = false;
      console.log(`  ✗ ${cmd.padEnd(8)} not found — ${why}. Install: winget install Gyan.FFmpeg (Windows) or sudo apt install ffmpeg`);
    }
  }
  console.log(ok ? "\nSelf-test passed. The PC is ready for phase 1." : "\nFix the missing tools, then re-run --self-test.");
  process.exitCode = ok ? 0 : 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === "help") return console.log(HELP);
  if (args.mode === "version") return console.log(VERSION);
  if (args.mode === "self-test") return selfTest();

  if (!args.url) {
    console.error("Missing --url. Run with --help.");
    process.exitCode = 2;
    return;
  }

  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("\nStopping after the current job…");
  });

  if (args.mode === "once") {
    const { job, result } = await runOnce(args);
    if (!job) console.log("No job waiting.");
    else console.log(`${job.type} → ${result.ok ? "ok" : "failed"}${result.error ? `: ${result.error}` : ""}`);
    return;
  }

  let done = 0;
  while (!stopping) {
    try {
      const { job, result } = await runOnce(args);
      if (job) {
        done += 1;
        console.log(`[${new Date().toISOString()}] ${job.type} → ${result.ok ? "ok" : `failed: ${result.error}`}`);
        if (args.maxJobs && done >= args.maxJobs) break;
        continue; // drain the queue before sleeping
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${error instanceof Error ? error.message : error}`);
    }
    await sleep(args.sleep * 1000);
  }
  console.log(`Stopped after ${done} job(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
