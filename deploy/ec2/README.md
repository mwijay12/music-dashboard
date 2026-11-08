# Running Timbre on one EC2 box (4 GB RAM)

Everything here targets a single **Ubuntu 24.04** instance, `t4g.medium` (2 vCPU / 4 GiB, arm64) or `t3.medium` if you prefer x86. No Docker, no n8n, no headless Chrome — the product needs under 1 GB, so the box stays comfortable.

| Piece | RAM (steady state) |
| --- | --- |
| OS + sshd + systemd | ~380 MB |
| `timbre-api` (Express + static app) | ~110 MB |
| `timbre-inbox` (runs ~2 s every 15 min) | spike ~90 MB |
| `timbre-backup` (nightly, tar of a few KB) | spike ~20 MB |
| 2 GB swap (installer) | insurance, not a target |

## 1. Install

```bash
ssh ubuntu@<ec2-ip>
git clone https://github.com/mwijay12/music-dashboard.git /tmp/timbre-src
sudo REPO_URL=https://github.com/mwijay12/music-dashboard.git bash /tmp/timbre-src/deploy/ec2/install.sh
```

The installer is idempotent and does exactly this:

1. adds a 2 GB `/swapfile` (skipped if present) and sets `vm.swappiness=10`
2. installs Node 22 from NodeSource plus `git`, `curl`, `ufw`
3. creates the system user `timbre`
4. clones the repo to `/opt/timbre` (or hard-resets it to `origin/main` if it already exists)
5. runs `npm ci` — **dev dependencies included on purpose**, because `npm run inbox` runs through `tsx`
6. copies `deploy/ec2/env.example` to `/opt/timbre/.env` **only if missing**, generating `SESSION_SECRET`
7. installs and enables `timbre-api.service`, `-inbox.timer`, `-backup.timer`
8. stages ufw rules for SSH/80/443 (does not enable the firewall — you do that once SSH is confirmed)

## 2. Fill in the environment

```bash
sudo -e /opt/timbre/.env     # keep it mode 600
```

Minimum to get real data:

```dotenv
BASE_URL=https://timbre.example.com
GOOGLE_CLIENT_ID=473209965436-…apps.googleusercontent.com
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=you@gmail.com
IMAP_PASSWORD=xxxx xxxx xxxx xxxx   # Gmail app password, not your login
IMAP_FOLDER=INBOX
DIGEST_SENDER=audiomack
```

Then:

```bash
sudo systemctl restart timbre-api
sudo -u timbre /usr/bin/node /opt/timbre/node_modules/tsx/dist/cli.mjs \
  pipeline/src/inbox.ts --dry-run --file pipeline/fixtures/audiomack-digest-2026-11-07.txt
sudo systemctl start timbre-inbox.service && journalctl -u timbre-inbox -n 30 --no-pager
```

## 3. TLS in front of it

The Express server listens on `0.0.0.0:8130`; terminate TLS with nginx so the API and the PDF report are served over HTTPS (Google sign-in requires a secure origin, and `Secure` cookies need it).

```nginx
server {
  listen 80;
  server_name timbre.example.com;

  client_max_body_size 4m;

  location / {
    proxy_pass http://127.0.0.1:8130;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
  }
}
```

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d timbre.example.com
```

Add `https://timbre.example.com` to the Google OAuth client's **Authorized JavaScript origins** afterwards.

## 4. Verify

```bash
curl -s localhost:8130/api/health
# {"ok":true,"authRequired":false,"googleConfigured":true,...}

curl -s -o /tmp/r.pdf -w '%{http_code} %{content_type} %{size_download}\n' \
  'localhost:8130/api/report?source=digest&inline=1'
# 200 application/pdf ~9000

systemctl list-timers 'timbre-*' --no-pager
tail -f /var/log/nginx/access.log
journalctl -u timbre-api -f
```

## 5. Operating it

| Task | Command |
| --- | --- |
| Deploy a new commit | `sudo -u timbre git -C /opt/timbre pull && sudo systemctl restart timbre-api` |
| Re-run the mailbox check now | `sudo systemctl start timbre-inbox.service` |
| See digests stored | `sudo -u timbre cat /opt/timbre/data/audiomack-digest.json \| head -40` |
| Backups | `/var/backups/timbre/timbre-data-YYYY-MM-DD.tar.gz`, last 14 kept |
| Restore | `sudo tar -xzf /var/backups/timbre/timbre-data-2026-11-08.tar.gz -C /opt/timbre` then restart |

The unit files apply `ProtectSystem=strict`, `ProtectHome`, `NoNewPrivileges` and a `MemoryMax` cap; the only writable path is `/opt/timbre/data`.

## 6. When to grow beyond this box

- **Postgres** instead of the JSON store once you ingest more than one platform (schema in `docs/AUTOMATION-PLAN.md` §6).
- **A second box or SQS** only if the ingester starts taking minutes; today it is seconds.
- **n8n** only if you want its UI for notifications — it costs 1.1–1.5 GB, i.e. more than the whole product here.

## Files in this directory

| File | Purpose |
| --- | --- |
| `install.sh` | idempotent provisioner (swap, Node, user, checkout, units) |
| `env.example` | the `.env` template copied to `/opt/timbre/.env` |
| `timbre-api.service` | the dashboard/API process, hardened, auto-restart |
| `timbre-inbox.service` / `.timer` | mailbox poll every 15 min |
| `timbre-backup.service` / `.timer` | nightly archive of `data/` |
| `backup.sh` | tar + 14-day rotation |
