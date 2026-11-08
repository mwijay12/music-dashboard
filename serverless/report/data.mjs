import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Report data for the PDF export.
 *
 * The dashboard currently ships a deterministic demo dataset; the report uses
 * the same numbers so a printed PDF never contradicts the screen. When a live
 * snapshot is wired in, pass the real values here and the layout is unchanged.
 */

const DEMO = {
  mode: "demo",
  artist: "Mira Vale",
  periodStart: "2026-10-05",
  periodEnd: "2026-11-01",
  source: "demo",
  metrics: [
    { key: "streams", label: "Streams", value: 2847193, delta: 18.4, format: "compact" },
    { key: "listeners", label: "Monthly listeners", value: 612408, delta: 9.2, format: "compact" },
    { key: "saves", label: "Saves", value: 84211, delta: 24.1, format: "compact" },
    { key: "revenue", label: "Revenue", value: 18420, delta: 12.8, format: "money" },
  ],
  daily: [
    82400, 86100, 91300, 87900, 94600, 102800, 97400, 88900, 92100, 98700, 104600, 112400, 105900,
    96700, 99800, 106300, 113900, 121500, 114200, 103100, 107600, 115400, 123800, 131600, 124900,
    112800, 118400, 126700,
  ],
  platforms: [
    { name: "Spotify", share: 56, listeners: 355200, delta: 2.4 },
    { name: "Apple Music", share: 22, listeners: 134700, delta: 14.0 },
    { name: "YouTube", share: 12, listeners: 73500, delta: 8.1 },
    { name: "SoundCloud", share: 8, listeners: 49800, delta: -1.2 },
  ],
  cities: [
    { name: "London", listeners: 82400, delta: 12.8 },
    { name: "Berlin", listeners: 61200, delta: 9.4 },
    { name: "Tokyo", listeners: 54900, delta: 6.2 },
    { name: "Los Angeles", listeners: 49100, delta: 3.1 },
    { name: "São Paulo", listeners: 38800, delta: 7.8 },
  ],
  tracks: [
    {
      name: "Hollow Bloom",
      type: "Single",
      length: "3:42",
      streams: 1204880,
      share: 42,
      delta: 21.4,
      spark: [24, 28, 27, 34, 33, 41, 39, 48, 46, 55, 53, 62],
    },
    {
      name: "Static Garden",
      type: "Single",
      length: "4:05",
      streams: 842610,
      share: 30,
      delta: 12.8,
      spark: [18, 20, 19, 24, 26, 25, 31, 30, 36, 35, 41, 43],
    },
    {
      name: "Low Tide",
      type: "EP",
      length: "3:18",
      streams: 498204,
      share: 18,
      delta: 4.1,
      spark: [12, 14, 13, 15, 17, 16, 18, 19, 18, 21, 20, 22],
    },
    {
      name: "Night Ferry",
      type: "Single",
      length: "5:12",
      streams: 301499,
      share: 10,
      delta: -2.3,
      spark: [26, 24, 25, 22, 23, 21, 22, 19, 20, 18, 19, 17],
    },
  ],
  coverage: [
    { platform: "Audiomack", route: "Weekly email → IMAP parser", state: "planned" },
    { platform: "Spotify", route: "Spotify for Artists CSV export", state: "manual" },
    { platform: "YouTube", route: "YouTube Analytics API (OAuth)", state: "planned" },
    { platform: "Apple Music", route: "No public analytics API", state: "unavailable" },
  ],
  milestones: [
    { label: "1M streams", detail: "Hollow Bloom", value: 100, status: "Reached" },
    { label: "1.5M streams", detail: "Hollow Bloom · ~18 days", value: 80.3, status: "On track" },
    { label: "3M streams", detail: "All releases · ~6 days", value: 94.9, status: "Close" },
  ],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const DIGEST_PATH = path.join(ROOT, "data", "audiomack-digest.json");

/**
 * Maps an Audiomack weekly digest (see pipeline/src/parsers/audiomack-digest.ts)
 * onto the report shape. This is the only dataset in the product that comes
 * from the artist's own account rather than the demo fixtures, so it is labelled
 * as an imported digest everywhere it appears.
 */
export function digestToReport(digest) {
  if (!digest || !Array.isArray(digest.tracks) || !digest.tracks.length) return null;

  const tracks = [...digest.tracks].sort((a, b) => b.plays - a.plays);
  const lifetime = tracks.reduce((sum, track) => sum + track.plays, 0);
  const periodEnd = digest.periodEnd || new Date().toISOString().slice(0, 10);
  const start = new Date(`${periodEnd}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);

  return {
    mode: "digest",
    source: "audiomack-digest",
    artist: digest.account || "Audiomack artist",
    periodStart: start.toISOString().slice(0, 10),
    periodEnd,
    generatedAt: new Date().toISOString(),
    totals: {
      plays: digest.totals?.plays ?? 0,
      followers: digest.totals?.followers ?? 0,
      likes: digest.totals?.likes ?? 0,
      lifetimePlays: lifetime,
    },
    kpis: [
      { label: "Plays · 7 days", value: String(digest.totals?.plays ?? 0), caption: "Audiomack digest" },
      { label: "New followers", value: String(digest.totals?.followers ?? 0), caption: "same window" },
      { label: "Total likes", value: String(digest.totals?.likes ?? 0), caption: "same window" },
      { label: "Track plays", value: lifetime.toLocaleString("en-US"), caption: "lifetime, top " + tracks.length },
    ],
    tracks: tracks.map((track) => ({
      name: track.title,
      plays: track.plays,
      share: lifetime ? Math.round((track.plays / lifetime) * 1000) / 10 : 0,
    })),
    diagnostics: digest.diagnostics || { notes: [] },
  };
}

export function readDigestReport(file = DIGEST_PATH) {
  try {
    const store = JSON.parse(readFileSync(file, "utf8"));
    return digestToReport(store.latest || store);
  } catch {
    return null;
  }
}

export function buildReportData(options = {}) {
  if (options.digest) return options.digest;

  const wantsDigest = options.mode === "digest" || options.mode === "auto";
  if (wantsDigest) {
    const digest = readDigestReport(options.digestFile);
    if (digest) return digest;
  }
  if (options.mode === "digest") return null;

  const data = { ...clone(DEMO), ...options.overrides };
  data.generatedAt = data.generatedAt || new Date().toISOString();
  data.totals = {
    streams: data.metrics.find((metric) => metric.key === "streams")?.value ?? 0,
    previousStreams: Math.round(
      (data.metrics.find((metric) => metric.key === "streams")?.value ?? 0) / 1.184
    ),
  };
  data.previousDaily = data.daily.map((value, index) => {
    const ramp = 0.72 + (index / Math.max(1, data.daily.length - 1)) * 0.14;
    return Math.round(value * ramp);
  });
  return data;
}

export const DEMO_ARTIST = DEMO.artist;
