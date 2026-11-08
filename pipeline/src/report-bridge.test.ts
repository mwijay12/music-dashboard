// @ts-nocheck — exercises the .mjs report module, which sits outside the pipeline TS project.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { resolveReportData } from "../../serverless/report/data.mjs";

const store = {
  schemaVersion: 1,
  account: "Piano Sifa Afro Gospel Amapiano Hub",
  updatedAt: "2026-11-08T00:00:00.000Z",
  latest: {
    account: "Piano Sifa Afro Gospel Amapiano Hub",
    periodEnd: "2026-11-07",
    totals: { plays: 103, followers: 0, likes: 0 },
    tracks: [
      { title: "Lango la Mbinguni", plays: 300 },
      { title: "Mwamba", plays: 160 },
    ],
    diagnostics: { topTrackSum: 460, scopeMismatch: true, notes: [] },
  },
  history: [],
};

async function withServer(status, body, run) {
  const server = createServer((req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}/api/digest`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("a reachable DIGEST_URL wins and is labelled upstream", async () => {
  await withServer(200, store, async (url) => {
    const data = await resolveReportData({ mode: "digest", digestUrl: url });
    assert.equal(data.mode, "digest");
    assert.equal(data.upstream, "digest-url");
    assert.equal(data.totals.plays, 103);
    assert.equal(data.totals.lifetimePlays, 460);
    assert.deepEqual(
      data.tracks.map((track) => track.name),
      ["Lango la Mbinguni", "Mwamba"]
    );
    assert.equal(data.tracks[0].share, 65.2);
  });
});

test("a failing DIGEST_URL falls back to the committed store", async () => {
  await withServer(500, { error: "boom" }, async (url) => {
    const data = await resolveReportData({ mode: "digest", digestUrl: url });
    assert.equal(data.mode, "digest");
    assert.equal(data.upstream, undefined);
    assert.equal(data.artist, "Piano Sifa Afro Gospel Amapiano Hub");
  });
});

test("an unreachable host still resolves (timeout path)", async () => {
  const data = await resolveReportData({
    mode: "digest",
    digestUrl: "http://127.0.0.1:9/api/digest",
    timeoutMs: 500,
  });
  assert.equal(data.mode, "digest");
});

test("demo mode never calls the network", async () => {
  let called = false;
  const server = createServer((req, res) => {
    called = true;
    res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const data = await resolveReportData({ mode: "demo", digestUrl: `http://127.0.0.1:${port}/` });
    assert.equal(data.mode, "demo");
    assert.equal(data.artist, "Mira Vale");
    assert.equal(called, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
