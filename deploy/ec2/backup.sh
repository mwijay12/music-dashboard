#!/usr/bin/env bash
# Archives data/ (digest store, session secret, users) into /var/backups/timbre.
# Keeps the last 14 archives. Safe to run daily from timbre-backup.timer.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/timbre}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/timbre}"
STAMP="$(date -u +%Y-%m-%d)"
KEEP="${KEEP:-14}"

mkdir -p "$BACKUP_DIR"

if [ ! -d "$APP_DIR/data" ]; then
  echo "No data directory at $APP_DIR/data — nothing to back up."
  exit 0
fi

# Only plain files matter here; the JSON store is a few KB.
tar -czf "$BACKUP_DIR/timbre-data-$STAMP.tar.gz" \
  -C "$APP_DIR" \
  --exclude='*.log' \
  data

echo "Wrote $BACKUP_DIR/timbre-data-$STAMP.tar.gz"

# Rotate: delete archives older than the newest $KEEP.
ls -1t "$BACKUP_DIR"/timbre-data-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "Pruning $old"
  rm -f -- "$old"
done
