#!/usr/bin/env bash
# Idempotent installer for a single EC2 box (Ubuntu 24.04, arm64 or x86_64).
#
#   sudo REPO_URL=https://github.com/mwijay12/music-dashboard.git ./install.sh
#
# What it does: 2 GB swap → Node 22 → user `timbre` → /opt/timbre checkout →
# npm ci → .env from example → systemd units + timers → firewall hint.
# It never overwrites an existing .env and never deletes data.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/mwijay12/music-dashboard.git}"
APP_DIR="${APP_DIR:-/opt/timbre}"
APP_USER="${APP_USER:-timbre}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR="${NODE_MAJOR:-22}"

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m!!\033[0m %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this with sudo." >&2
  exit 1
fi

if ! grep -qi ubuntu /etc/os-release; then
  warn "This script targets Ubuntu; continuing anyway."
fi

log "Swap (2 GB, skipped when already present)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -q -w vm.swappiness=10
else
  echo "/swapfile already exists"
fi

log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw

log "Node ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
else
  echo "node $(node -v) already installed"
fi

log "Service user ${APP_USER}"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"

log "Code in ${APP_DIR}"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" reset --hard --quiet "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

log "Dependencies (dev included: npm run inbox runs through tsx)"
cd "$APP_DIR"
npm ci --no-audit --no-fund

log "Environment file"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/deploy/ec2/env.example" "$APP_DIR/.env"
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  warn "Created $APP_DIR/.env — now fill in IMAP_USER / IMAP_PASSWORD / GOOGLE_CLIENT_ID."
else
  echo ".env already present, leaving it untouched"
fi

mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

log "systemd units"
install -m 644 "$APP_DIR/deploy/ec2/timbre-api.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/ec2/timbre-inbox.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/ec2/timbre-inbox.timer" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/ec2/timbre-backup.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/ec2/timbre-backup.timer" /etc/systemd/system/
mkdir -p /var/backups/timbre
chown -R "$APP_USER:$APP_USER" /var/backups/timbre

systemctl daemon-reload
systemctl enable --now timbre-api.service
systemctl enable --now timbre-inbox.timer
systemctl enable --now timbre-backup.timer

log "Firewall"
if ufw status | grep -q inactive; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  warn "ufw rules staged. Run 'ufw enable' when you are sure SSH works."
else
  echo "ufw already active"
fi

log "Health"
sleep 2
curl -fsS http://127.0.0.1:8130/api/health || warn "API not answering yet — check: journalctl -u timbre-api -n 50"

cat <<'SUMMARY'

Next:
  1. Edit /opt/timbre/.env  (IMAP_*, GOOGLE_CLIENT_ID, BASE_URL=https://your-domain)
  2. sudo systemctl restart timbre-api
  3. npm run inbox -- --dry-run --file pipeline/fixtures/audiomack-digest-2026-11-07.txt
  4. Put nginx + certbot in front of 127.0.0.1:8130 for TLS.

Handy:
  journalctl -u timbre-api -f
  systemctl list-timers 'timbre-*'
  sudo -u timbre git -C /opt/timbre pull && sudo systemctl restart timbre-api
SUMMARY
