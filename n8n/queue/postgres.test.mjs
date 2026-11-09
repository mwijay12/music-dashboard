// Integration test against an explicitly provided DISPOSABLE PostgreSQL database.
// PG_MODULE_PATH points to a local installation of the `pg` module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const url = process.env.TIMBRE_TEST_DATABASE_URL;
const modulePath = process.env.PG_MODULE_PATH;
test('echo queue: PostgreSQL locking, leases and result retries', { skip: (!url || !modulePath) ? 'set TIMBRE_TEST_DATABASE_URL and PG_MODULE_PATH' : false }, async () => {
  const parsed = new URL(url);
  if (!/^\/timbre_test_[a-z0-9_]+$/.test(parsed.pathname)) throw new Error('Refusing to run: database name must start with timbre_test_ and be disposable');
  const { default: pg } = await import(pathToFileURL(modulePath).href);
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  const db = await pool.connect();
  const other = await pool.connect();
  try {
    await db.query('DROP SCHEMA IF EXISTS timbre CASCADE');
    await db.query(await readFile(new URL('./01-schema.sql', import.meta.url), 'utf8'));
    const id = (await db.query("INSERT INTO timbre.jobs(job_type,payload) VALUES ('echo', $1) RETURNING id", [{ message: 'hello' }])).rows[0].id;
    await db.query('BEGIN');
    const first = (await db.query('SELECT * FROM timbre.claim_echo($1)', ['pc-a'])).rows[0];
    assert.equal(first.id, id);
    // The first transaction deliberately keeps its row lock while the other claims.
    assert.equal((await other.query('SELECT * FROM timbre.claim_echo($1)', ['pc-b'])).rowCount, 0);
    await db.query('COMMIT');
    assert.equal((await other.query('SELECT * FROM timbre.claim_echo($1)', ['pc-b'])).rowCount, 0);
    await db.query("UPDATE timbre.jobs SET lease_until = now() - interval '1 second' WHERE id = $1", [id]);
    assert.equal((await db.query('SELECT timbre.complete_echo($1,$2,true,$3,null) AS accepted', [id, first.lease_id, {}])).rows[0].accepted, false);
    const second = (await other.query('SELECT * FROM timbre.claim_echo($1)', ['pc-b'])).rows[0];
    assert.notEqual(first.lease_id, second.lease_id);
    assert.equal((await db.query('SELECT timbre.complete_echo($1,$2,true,$3,null) AS accepted', [id, first.lease_id, {}])).rows[0].accepted, false);
    assert.equal((await db.query('SELECT timbre.complete_echo($1,$2,true,$3,null) AS accepted', [id, second.lease_id, { answer: 1 }])).rows[0].accepted, true);
    assert.equal((await db.query('SELECT timbre.complete_echo($1,$2,true,$3,null) AS accepted', [id, second.lease_id, { answer: 2 }])).rows[0].accepted, true);
    const saved = (await db.query('SELECT state, attempts, output FROM timbre.jobs WHERE id=$1', [id])).rows[0];
    assert.equal(saved.state, 'succeeded');
    assert.equal(saved.attempts, 2);
    assert.deepEqual(saved.output, { answer: 1 });
    await assert.rejects(db.query("INSERT INTO timbre.jobs(job_type) VALUES ('render')"), /check constraint/);
  } finally {
    await db.query('ROLLBACK').catch(() => {});
    await db.query('DROP SCHEMA IF EXISTS timbre CASCADE').catch(() => {});
    db.release(); other.release(); await pool.end();
  }
});
