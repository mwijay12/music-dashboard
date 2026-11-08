import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_STORE_PATH, mergeDigest, readStore, writeStore } from "./digest-store.js";
import { parseAudiomackDigest } from "./parsers/audiomack-digest.js";

/**
 * Turns an Audiomack weekly email file (or stdin) into the digest store.
 *
 *   npm run digest -- --file inbox/audiomack-2026-11-07.txt
 *   cat email.txt | npm run digest
 *
 * For automatic pickup from the mailbox, use `npm run inbox`.
 */

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
  const store = await readStore(process.env.DIGEST_STORE || DEFAULT_STORE_PATH);
  const next = mergeDigest(store, digest);
  await writeStore(next, process.env.DIGEST_STORE || DEFAULT_STORE_PATH);
  const history = next.history;

  console.log(`Audiomack digest → ${path.relative(process.cwd(), process.env.DIGEST_STORE || DEFAULT_STORE_PATH)}`);
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
