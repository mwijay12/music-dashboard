#!/usr/bin/env bash
# Disposable local Docker test only. Never point this at the VPS or production data.
# Requires Docker, permission to pull postgres:16-alpine, and no published ports.
set -Eeuo pipefail
command -v docker >/dev/null || { echo 'Docker is required.' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker daemon is not available.' >&2; exit 1; }
root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/timbre-restore-test.XXXXXXXX")
suffix=${tmp##*.}
network="timbre-test-$suffix"
source="timbre-src-$suffix"
target="timbre-dst-$suffix"
umask 077
cleanup() {
  docker rm -f "$source" "$target" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf -- "$tmp"
}
trap cleanup EXIT
# Test containers only: trust is acceptable solely in this short-lived isolated
# network, with dummy data. Never use this auth configuration in production.
docker pull postgres:16-alpine >/dev/null
docker network create --internal "$network" >/dev/null
for container in "$source" "$target"; do
  docker run -d --name "$container" --network "$network" \
    -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=timbre_test postgres:16-alpine >/dev/null
done
for container in "$source" "$target"; do
  ready=false
  for _ in {1..60}; do
    if docker exec "$container" pg_isready -q -U postgres -d timbre_test; then ready=true; break; fi
    sleep 1
  done
  "$ready" || { echo "Test PostgreSQL failed to start: $container" >&2; exit 1; }
done
psql_src=(docker exec -i "$source" psql -X -v ON_ERROR_STOP=1 -U postgres -d timbre_test)
psql_dst=(docker exec -i "$target" psql -X -v ON_ERROR_STOP=1 -U postgres -d timbre_test)
"${psql_src[@]}" < "$root/01-schema.sql" >/dev/null
"${psql_src[@]}" >/dev/null <<'SQL'
INSERT INTO timbre.jobs(job_type, payload) VALUES ('echo', '{"message":"restore-test"}'::jsonb);
-- This intentionally tests a read-only backup account, not the application account.
CREATE ROLE timbre_test_backup LOGIN;
GRANT CONNECT ON DATABASE timbre_test TO timbre_test_backup;
GRANT USAGE ON SCHEMA timbre TO timbre_test_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA timbre TO timbre_test_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA timbre TO timbre_test_backup;
SQL
# Validate failure handling: invalid database must fail even though gzip succeeds.
if docker exec "$source" pg_dump -U timbre_test_backup -d does_not_exist 2>/dev/null | gzip > "$tmp/bad.sql.gz"; then
  echo 'ERROR: backup pipeline did not propagate pg_dump failure.' >&2; exit 1
fi
rm -f "$tmp/bad.sql.gz"
docker exec "$source" pg_dump --no-owner --no-privileges -U timbre_test_backup -d timbre_test | gzip > "$tmp/queue.sql.gz"
test -s "$tmp/queue.sql.gz"
gzip -t "$tmp/queue.sql.gz"
gzip -dc "$tmp/queue.sql.gz" | "${psql_dst[@]}" >/dev/null
"${psql_dst[@]}" >/dev/null <<'SQL'
DO $$
DECLARE j record; accepted boolean;
BEGIN
  IF (SELECT count(*) FROM timbre.jobs WHERE state='queued' AND payload->>'message'='restore-test') <> 1 THEN
    RAISE EXCEPTION 'restored job missing';
  END IF;
  SELECT * INTO j FROM timbre.claim_echo('restore-test-worker');
  IF j.id IS NULL THEN RAISE EXCEPTION 'restored claim function failed'; END IF;
  SELECT timbre.complete_echo(j.id,j.lease_id,true,'{"restored":true}'::jsonb,NULL) INTO accepted;
  IF accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'restored complete function failed'; END IF;
END $$;
SQL
echo 'PASS: dump, failed-dump detection, isolated restore, restored job and queue functions.'
echo 'Test containers, network and dummy backup will now be removed.'
