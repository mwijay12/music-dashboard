import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { executeJob, parseArgs } from '../worker/agent.mjs';

const workflow = JSON.parse(await readFile(new URL('./pc-handshake.json', import.meta.url), 'utf8'));
test('handshake uses protected POST webhooks and is inactive on import', () => {
  assert.equal(workflow.active, false);
  const hooks = workflow.nodes.filter(node => node.type === 'n8n-nodes-base.webhook');
  assert.deepEqual(hooks.map(node => node.parameters.path), ['timbre-handshake/jobs', 'timbre-handshake/jobs/result']);
  for (const hook of hooks) {
    assert.equal(hook.parameters.authentication, 'headerAuth');
    assert.equal(hook.parameters.httpMethod, 'POST');
  }
});
test('sample job is understood by the real worker', async () => {
  const code = workflow.nodes.find(node => node.name === 'Send test job').parameters.jsCode;
  const [{ json }] = new Function(code)();
  assert.equal(json.job.type, 'echo');
  const result = await executeJob(json.job);
  assert.equal(result.ok, true);
  assert.equal(result.output.echoed.message, 'Hello from n8n');
});
test('worker reads token from environment, but explicit option wins', () => {
  const original = process.env.TIMBRE_WORKER_TOKEN;
  try {
    process.env.TIMBRE_WORKER_TOKEN = 'local-test';
    assert.equal(parseArgs([]).token, 'local-test');
    assert.equal(parseArgs(['--token', 'override']).token, 'override');
  } finally {
    if (original === undefined) delete process.env.TIMBRE_WORKER_TOKEN;
    else process.env.TIMBRE_WORKER_TOKEN = original;
  }
});
