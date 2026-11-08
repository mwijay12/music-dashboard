import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseAudiomackDigest, type AudiomackDigest } from "./parsers/audiomack-digest.js";

/**
 * Turns an Audiomack weekly email into `data/audiomack-digest.json`.
 *
 *   npm run digest -- --file inbox/audiomack-2026-11-07.txt
 *   cat email.txt | npm run digest
 *
 * The file keeps the latest digest plus a per-week history, so once you run it
 * every week you get a real time series — something Audiomack itself does not
 * expose through its API.
 */

const OUT = path.resolve("data/audiomack-digest.json");

interface DigestStore {
  schemaVersion: 1;
  account: string;
  updatedAt: string;
  latest: AudiomackDigest;
  history: Array<{
    periodEnd: string | null;
    capturedAt: string;
    totals: AudiomackDigest["totals"];
    topTrackSum: number;
    tracks: AudiomackDigest["tracks"];
  }>;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const file = arg("--file");
  const raw = file ? await readFile(path.resolve(file), "utf8") : await readStdin();

  if (!raw.trim()) {
    throw new Error("No digest text provided. Pass --file <path> or pipe the email body on stdin.");
  }

  const digest = parseAudiomackDigest(raw);
  const now = new Date().toISOString();

  let store: DigestStore | null = null;
  try {
    store = JSON.parse(await readFile(OUT, "utf8")) as DigestStore;
  } catch {
    store = null;
  }

  const history = (store?.history ?? []).filter((entry) => entry.periodEnd !== digest.periodEnd);
  history.push({
    periodEnd: digest.periodEnd,
    capturedAt: now,
    totals: digest.totals,
    topTrackSum: digest.diagnostics.topTrackSum,
    tracks: digest.tracks,
  });
  history.sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)));

  const next: DigestStore = {
    schemaVersion: 1,
    account: digest.account,
    updatedAt: now,
    latest: digest,
    history,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(next, null, 2)}\n`);

  console.log(`Audiomack digest → ${path.relative(process.cwd(), OUT)}`);
  console.log(`  account     ${digest.account}`);
  console.log(`  period end  ${digest.periodEnd ?? "unknown"}`);
  console.log(
    `  totals      plays ${digest.totals.plays} · followers ${digest.totals.followers} · likes ${digest.totals.likes}`
  );
  console.log(`  tracks      ${digest.tracks.length} (sum ${digest.diagnostics.topTrackSum})`);
  for (const note of digest.diagnostics.notes) console.log(`  ! ${note}`);
  console.log(`  history     ${history.length} week(s)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
