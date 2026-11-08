import assert from "node:assert/strict";
import test from "node:test";

import { mergeDigest, type DigestStore } from "./digest-store.js";
import { pickDigestBody } from "./inbox.js";
import type { AudiomackDigest } from "./parsers/audiomack-digest.js";

const digest = (periodEnd: string, plays: number, tracks: Array<[string, number]>): AudiomackDigest => ({
  account: "Piano Sifa Afro Gospel Amapiano Hub",
  periodEnd,
  totals: { plays, followers: 0, likes: 0 },
  tracks: tracks.map(([title, count]) => ({ title, plays: count })),
  diagnostics: {
    topTrackSum: tracks.reduce((sum, [, count]) => sum + count, 0),
    scopeMismatch: false,
    notes: [],
  },
});

test("merging a new week appends one history entry", () => {
  const store = mergeDigest(null, digest("2026-11-07", 103, [["Mwamba", 160]]), "2026-11-08T00:00:00Z");
  assert.equal(store.history.length, 1);
  assert.equal(store.account, "Piano Sifa Afro Gospel Amapiano Hub");
  assert.equal(store.history[0].topTrackSum, 160);
  assert.equal(store.latest.periodEnd, "2026-11-07");
});

test("re-running the same week replaces it instead of duplicating", () => {
  const first = mergeDigest(null, digest("2026-11-07", 103, [["Mwamba", 160]]), "2026-11-08T00:00:00Z");
  const second = mergeDigest(first, digest("2026-11-07", 140, [["Mwamba", 195]]), "2026-11-09T00:00:00Z");
  assert.equal(second.history.length, 1);
  assert.equal(second.history[0].totals.plays, 140);
  assert.equal(second.updatedAt, "2026-11-09T00:00:00Z");
});

test("history stays sorted by period end across several weeks", () => {
  let store: DigestStore | null = null;
  store = mergeDigest(store, digest("2026-11-21", 90, [["Mwamba", 200]]), "2026-11-22T00:00:00Z");
  store = mergeDigest(store, digest("2026-11-07", 103, [["Mwamba", 160]]), "2026-11-08T00:00:00Z");
  store = mergeDigest(store, digest("2026-11-14", 75, [["Mwamba", 180]]), "2026-11-15T00:00:00Z");
  assert.deepEqual(
    store.history.map((entry) => entry.periodEnd),
    ["2026-11-07", "2026-11-14", "2026-11-21"]
  );
});

test("digests without a period end fall back to the capture date as the key", () => {
  const missing = { ...digest("2026-11-07", 10, [["Mwamba", 10]]), periodEnd: null };
  const first = mergeDigest(null, missing, "2026-11-08T09:00:00Z");
  const second = mergeDigest(first, missing, "2026-11-08T18:00:00Z");
  assert.equal(second.history.length, 1);
});

test("pickDigestBody prefers plain text and strips HTML when there is none", () => {
  const text = pickDigestBody({
    text: "Total plays 103\nTop songs\nMwamba 160",
    html: "<p>ignore me</p>",
  });
  assert.match(text, /Total plays 103/);

  const html = pickDigestBody({
    text: "  ",
    html: "<table><tr><td>Total plays</td><td>103</td></tr><tr><td>Mwamba</td><td>160</td></tr></table><script>x()</script>",
  });
  assert.match(html, /Total plays/);
  assert.match(html, /Mwamba/);
  assert.ok(!html.includes("<"), "html tags should be stripped");
  assert.ok(!html.includes("x()"), "scripts should be removed");

  assert.equal(pickDigestBody({ text: "", html: false }), "");
});
