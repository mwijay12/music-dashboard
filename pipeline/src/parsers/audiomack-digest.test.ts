import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { findPeriodEnd, parseAudiomackDigest, parseTrackLine } from "./audiomack-digest.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "..", "..", "fixtures", "audiomack-digest-2026-11-07.txt");

test("parses the real weekly digest shape", async () => {
  const digest = parseAudiomackDigest(await readFile(fixture, "utf8"));

  assert.equal(digest.account, "Piano Sifa Afro Gospel Amapiano Hub");
  assert.equal(digest.periodEnd, "2026-11-07");
  assert.deepEqual(digest.totals, { plays: 103, followers: 0, likes: 0 });
  assert.deepEqual(
    digest.tracks.map((track) => [track.title, track.plays]),
    [
      ["Lango la Mbinguni", 300],
      ["Mwamba", 160],
      ["Jesus in me!", 110],
      ["Hakuna Mungu kama Wewe", 90],
      ["Ningekuwaa Wapi?", 90],
    ]
  );
  assert.equal(digest.diagnostics.topTrackSum, 750);
  assert.equal(digest.diagnostics.scopeMismatch, true);
  assert.match(digest.diagnostics.notes[0], /window-scoped|7 days/);
});

test("tolerates numbering, separators and thousands separators", () => {
  const digest = parseAudiomackDigest(`Mwijay Davie
Total plays: 12,480
New followers 34
Total likes 1,204

Top songs
1. Lango la Mbinguni — 8,300 plays
2) Mwamba | 2,100
- Jesus in me! · 1,050 plays
`);

  assert.equal(digest.totals.plays, 12480);
  assert.equal(digest.totals.followers, 34);
  assert.equal(digest.totals.likes, 1204);
  assert.deepEqual(
    digest.tracks.map((track) => track.title),
    ["Lango la Mbinguni", "Mwamba", "Jesus in me!"]
  );
  assert.equal(digest.diagnostics.topTrackSum, 11450);
});

test("reports a clean window when song plays are smaller than the total", () => {
  const digest = parseAudiomackDigest(`Mwijay Davie
Total plays 900
Top songs
Mwamba 120
Jesus in me! 90
`);
  assert.equal(digest.diagnostics.scopeMismatch, false);
  assert.equal(digest.tracks.length, 2);
});

test("does not invent tracks from label lines", () => {
  const digest = parseAudiomackDigest("Total plays 103\nNew followers 0\nTotal likes 0\n");
  assert.deepEqual(digest.tracks, []);
  assert.ok(digest.diagnostics.notes.some((note) => note.includes("No song rows")));
});

test("parses both date orders", () => {
  assert.equal(findPeriodEnd("Weekly stats 1 – 7 Nov 2026"), "2026-11-07");
  assert.equal(findPeriodEnd("Stats for Nov 7, 2026"), "2026-11-07");
  assert.equal(findPeriodEnd("period ending 07/11/2026"), "2026-11-07");
  assert.equal(findPeriodEnd("no date here"), null);
});

test("parseTrackLine rejects prose and headings", () => {
  assert.equal(parseTrackLine("Keep uploading to grow your audience."), null);
  assert.equal(parseTrackLine("Top songs this week"), null);
  assert.deepEqual(parseTrackLine("Hakuna Mungu kama Wewe   90"), {
    title: "Hakuna Mungu kama Wewe",
    plays: 90,
  });
});
