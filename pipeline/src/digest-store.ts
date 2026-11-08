import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AudiomackDigest } from "./parsers/audiomack-digest.js";

/**
 * One file holds the latest digest plus one history entry per week. That history
 * is the only real time series this account has — Audiomack itself publishes
 * weekly numbers, so the series is built by us, week by week.
 */

export interface DigestHistoryEntry {
  periodEnd: string | null;
  capturedAt: string;
  totals: AudiomackDigest["totals"];
  topTrackSum: number;
  tracks: AudiomackDigest["tracks"];
}

export interface DigestStore {
  schemaVersion: 1;
  account: string;
  updatedAt: string;
  latest: AudiomackDigest;
  history: DigestHistoryEntry[];
}

export const DEFAULT_STORE_PATH = path.resolve("data/audiomack-digest.json");
const MAX_HISTORY = 260;

export async function readStore(file = DEFAULT_STORE_PATH): Promise<DigestStore | null> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as DigestStore;
    return Array.isArray(parsed.history) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeStore(store: DigestStore, file = DEFAULT_STORE_PATH): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(store, null, 2)}\n`);
}

/** Idempotent per period end: re-running the same week replaces that entry. */
export function mergeDigest(
  store: DigestStore | null,
  digest: AudiomackDigest,
  capturedAt = new Date().toISOString()
): DigestStore {
  const key = digest.periodEnd ?? capturedAt.slice(0, 10);
  const history = (store?.history ?? []).filter(
    (entry) => (entry.periodEnd ?? entry.capturedAt.slice(0, 10)) !== key
  );

  history.push({
    periodEnd: digest.periodEnd,
    capturedAt,
    totals: digest.totals,
    topTrackSum: digest.diagnostics.topTrackSum,
    tracks: digest.tracks,
  });
  history.sort((a, b) =>
    String(a.periodEnd ?? a.capturedAt).localeCompare(String(b.periodEnd ?? b.capturedAt))
  );

  return {
    schemaVersion: 1,
    account: digest.account,
    updatedAt: capturedAt,
    latest: digest,
    history: history.slice(-MAX_HISTORY),
  };
}
