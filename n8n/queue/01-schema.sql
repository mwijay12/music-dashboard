-- Timbre queue prototype: ECHO JOBS ONLY. Do not apply to production yet.
-- Dedicated database recommended; this does not alter n8n's SQLite database.
BEGIN;
CREATE SCHEMA IF NOT EXISTS timbre;
CREATE TABLE IF NOT EXISTS timbre.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type = 'echo'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'leased', 'succeeded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  worker text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  output jsonb,
  error text,
  CHECK ((state = 'queued' AND lease_id IS NULL AND lease_until IS NULL)
      OR (state IN ('leased', 'succeeded', 'failed') AND lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS jobs_pending_idx ON timbre.jobs (created_at, id) WHERE state IN ('queued', 'leased');

-- Single statement + row lock: simultaneous claimers cannot lease the same row.
-- An expired lease may be reassigned. Execution is at-least-once, not exactly-once.
CREATE OR REPLACE FUNCTION timbre.claim_echo(p_worker text)
RETURNS TABLE (id uuid, type text, payload jsonb, lease_id uuid, lease_until timestamptz)
LANGUAGE sql AS $$
  WITH candidate AS (
    SELECT j.id FROM timbre.jobs AS j
    WHERE (j.state = 'queued' OR (j.state = 'leased' AND j.lease_until <= clock_timestamp()))
    ORDER BY j.created_at, j.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE timbre.jobs AS j
  SET state = 'leased', worker = left(p_worker, 120), lease_id = gen_random_uuid(),
      lease_until = clock_timestamp() + interval '5 minutes', attempts = j.attempts + 1,
      updated_at = clock_timestamp()
  FROM candidate AS c WHERE j.id = c.id
  RETURNING j.id, j.job_type, j.payload, j.lease_id, j.lease_until;
$$;

-- Requires the current unexpired lease. Duplicate result submissions for an
-- already completed matching lease are acknowledged without rewriting output.
CREATE OR REPLACE FUNCTION timbre.complete_echo(p_id uuid, p_lease_id uuid, p_ok boolean, p_output jsonb, p_error text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_state text; v_lease uuid; v_until timestamptz;
BEGIN
  IF p_id IS NULL OR p_lease_id IS NULL OR p_ok IS NULL THEN RETURN false; END IF;
  SELECT state, lease_id, lease_until INTO v_state, v_lease, v_until
    FROM timbre.jobs WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v_lease IS DISTINCT FROM p_lease_id THEN RETURN false; END IF;
  IF v_state IN ('succeeded', 'failed') THEN RETURN true; END IF;
  IF v_state <> 'leased' OR v_until <= clock_timestamp() THEN RETURN false; END IF;
  UPDATE timbre.jobs SET state = CASE WHEN p_ok THEN 'succeeded' ELSE 'failed' END,
    output = p_output, error = left(p_error, 2000), updated_at = clock_timestamp()
    WHERE id = p_id;
  RETURN true;
END;
$$;
-- Application roles must be granted only the privileges they need explicitly.
REVOKE ALL ON SCHEMA timbre FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION timbre.claim_echo(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION timbre.complete_echo(uuid, uuid, boolean, jsonb, text) FROM PUBLIC;
COMMIT;
