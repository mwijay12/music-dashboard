import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const flow = JSON.parse(await readFile(new URL('./echo-queue-test.json', import.meta.url), 'utf8'));
const node = (name) => flow.nodes.find((n) => n.name === name);
const run = (name, body) => new Function('$json', node(name).parameters.jsCode)({ body });
test('test workflow is inactive and webhooks require header auth', () => {
  assert.equal(flow.active, false);
  for (const n of flow.nodes.filter(n => n.type === 'n8n-nodes-base.webhook')) assert.equal(n.parameters.authentication, 'headerAuth');
  for (const n of flow.nodes.filter(n => n.type === 'n8n-nodes-base.postgres')) {
    assert.match(n.parameters.query, /\$1/);
    assert.ok(n.parameters.options.queryReplacement);
  }
});
test('validates worker and result before DB queries', () => {
  assert.equal(run('Validate worker', {worker:'mwijay-pc'})[0].json.worker, 'mwijay-pc');
  assert.throws(() => run('Validate worker', {worker:''}));
  const id = '00000000-0000-4000-8000-000000000123';
  const result = {jobId:id,leaseId:id,type:'echo',ok:true,output:{message:"hello, 'quoted'"}};
  const args = run('Validate result', result)[0].json.args;
  assert.equal(args[3], JSON.stringify(result.output));
  assert.throws(() => run('Validate result', {...result, type:'render'}));
  assert.throws(() => run('Validate result', {...result, leaseId:'not-a-uuid'}));
  assert.throws(() => run('Validate result', {...result, ok:'true'}));
});
