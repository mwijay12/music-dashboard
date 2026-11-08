import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { claimJob, executeJob, parseArgs, runOnce } from "./agent.mjs";

function withServer(handler) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const answer = handler({ method: request.method, url: request.url, headers: request.headers, body });
        const status = answer.status ?? 200;
        if (status === 204) {
          response.writeHead(204).end();
          return;
        }
        response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(answer.body ?? {}));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

test("parseArgs understands the modes and defaults", () => {
  assert.equal(parseArgs([]).mode, "once");
  assert.equal(parseArgs(["--loop"]).mode, "loop");
  assert.equal(parseArgs(["--self-test"]).mode, "self-test");
  const parsed = parseArgs(["--url", "https://x/y", "--token", "t", "--sleep", "5", "--dry-run"]);
  assert.equal(parsed.url, "https://x/y");
  assert.equal(parsed.token, "t");
  assert.equal(parsed.sleep, 5);
  assert.equal(parsed.dryRun, true);
});

test("an unknown job type is rejected with the allowlist, never guessed", async () => {
  const result = await executeJob({ id: "j1", type: "rm -rf /", payload: {} }, {});
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown job type/);
  assert.match(result.error, /echo/);
});

test("echo reports the machine so n8n can show which PC answered", async () => {
  const result = await executeJob({ id: "j2", type: "echo", payload: { hello: "world" } });
  assert.equal(result.ok, true);
  assert.equal(result.output.echoed.hello, "world");
  assert.ok(result.output.host.length > 0);
  assert.ok(result.output.memoryGb > 0);
});

test("handlers complain clearly when a payload is incomplete", async () => {
  const render = await executeJob({ type: "render", payload: { audio: "a.mp3" } });
  assert.equal(render.ok, false);
  assert.match(render.error, /render needs/);

  const concat = await executeJob({ type: "concat", payload: { files: ["one.mp3"], out: "x.mp3" } });
  assert.equal(concat.ok, false);
  assert.match(concat.error, /concat needs/);

  const probe = await executeJob({ type: "probe", payload: {} });
  assert.equal(probe.ok, false);
  assert.match(probe.error, /probe needs/);
});

test("claimJob turns an empty webhook answer into 'no job'", async () => {
  const { server, base } = await withServer(() => ({ status: 204 }));
  try {
    assert.equal(await claimJob({ url: base, token: "t" }), null);
  } finally {
    server.close();
  }
});

test("claimJob accepts n8n's wrappers: {job}, bare object, or a one-row array", async () => {
  const shapes = [
    { body: { job: { id: "a", type: "echo" } } },
    { body: { id: "b", type: "echo" } },
    { body: [{ id: "c", type: "echo" }] },
  ];
  for (const shape of shapes) {
    const { server, base } = await withServer(() => shape);
    try {
      const job = await claimJob({ url: base, token: "t" });
      assert.equal(job.type, "echo");
    } finally {
      server.close();
    }
  }
});

test("a full round trip: claim → execute → report, with the token on both calls", async () => {
  const seen = [];
  let handedOut = false;
  const { server, base } = await withServer((request) => {
    seen.push({ url: request.url, token: request.headers["x-timbre-token"], body: request.body });
    if (request.url.endsWith("/result")) return { body: { ok: true } };
    if (!handedOut) {
      handedOut = true;
      return { body: { job: { id: "job-42", type: "echo", payload: { niche: "kwaya" } } } };
    }
    return { status: 204 };
  });

  try {
    const first = await runOnce({ url: base, token: "secret", worker: "mwijay-pc" });
    assert.equal(first.job.id, "job-42");
    assert.equal(first.result.ok, true);

    const second = await runOnce({ url: base, token: "secret" });
    assert.equal(second.job, null);

    const claim = seen.find((call) => call.url === "/");
    assert.equal(claim.token, "secret");
    assert.match(claim.body, /kwaya|capabilities/);

    const report = seen.find((call) => call.url.endsWith("/result"));
    const payload = JSON.parse(report.body);
    assert.equal(payload.jobId, "job-42");
    assert.equal(payload.ok, true);
    assert.equal(payload.worker, "mwijay-pc");
    assert.equal(report.token, "secret");
  } finally {
    server.close();
  }
});

test("a failing job is still reported, so the queue never stalls", async () => {
  let reported = null;
  const { server, base } = await withServer((request) => {
    if (request.url.endsWith("/result")) {
      reported = JSON.parse(request.body);
      return { body: { ok: true } };
    }
    return { body: { job: { id: "bad-1", type: "does-not-exist", payload: {} } } };
  });

  try {
    const { result } = await runOnce({ url: base, token: "t" });
    assert.equal(result.ok, false);
    assert.equal(reported.jobId, "bad-1");
    assert.equal(reported.ok, false);
    assert.match(reported.error, /unknown job type/);
  } finally {
    server.close();
  }
});

test("dry-run claims but does not touch the filesystem or report back", async () => {
  const { server, base } = await withServer(() => ({ body: { job: { id: "d1", type: "render", payload: {} } } }));
  try {
    const { job, result } = await runOnce({ url: base, token: "t", dryRun: true });
    assert.equal(job.id, "d1");
    assert.deepEqual(result.output, { dryRun: true, type: "render" });
  } finally {
    server.close();
  }
});
