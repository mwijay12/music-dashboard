# Running Timbre next to n8n on the box you already pay for

Target instance (already running): `i-0cc1e65a07b17d1d5`, `t4g.small` (2 GiB, arm64, eu-north-1), Caddy in front at `https://mwijay.duckdns.org`, access through SSM (`aws ssm start-session --target i-0cc1e65a07b17d1d5`).

No new instance, no second domain, no TLS work — Caddy already terminates HTTPS.

## Memory reality check (2 GiB total)

| Process | Resident |
| --- | --- |
| n8n (+ its Postgres, if local) | ~1.1–1.5 GiB |
| Caddy | ~25 MiB |
| `timbre-api` | ~110 MiB |
| `timbre-inbox` (2 s every 15 min) | ~90 MiB peak |
| **Total** | **~1.3–1.7 GiB** |

That fits, but there is no headroom for a second heavy guest, so:

- add swap if the box has none (`install.sh` handles it, or `fallocate -l 2G /swapfile`)
- cap the API at 384 MiB on this box (`sed -i 's/MemoryMax=512M/MemoryMax=384M/' timbre-api.service`)
- do **not** run the Vite dev server or `npm run build` here; Vercel builds the site

If `dmesg | grep -i oom` ever shows the kernel killing things, resize to `t4g.medium` (4 GiB) rather than removing swap.

## 1. Install alongside n8n

```bash
aws ssm start-session --target i-0cc1e65a07b17d1d5      # -> shell as ssm-user
sudo -i
git clone https://github.com/mwijay12/music-dashboard.git /tmp/timbre-src
REPO_URL=https://github.com/mwijay12/music-dashboard.git bash /tmp/timbre-src/deploy/ec2/install.sh
```

The installer does not touch n8n, Docker or Caddy. It adds a `timbre` system user, `/opt/timbre`, the units, the timers and (only if absent) a swapfile. Skip its ufw step: Caddy is the only public port you need, and SSM needs no inbound SSH.

## 2. Environment

```bash
sudo -e /opt/timbre/.env
```

```dotenv
PORT=8130
BASE_URL=https://mwijay.duckdns.org/timbre
AUTH_REQUIRED=false
GOOGLE_CLIENT_ID=473209965436-…apps.googleusercontent.com
SESSION_SECRET=<32 bytes hex>
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=you@gmail.com
IMAP_PASSWORD=<gmail app password>
IMAP_FOLDER=INBOX
DIGEST_SENDER=audiomack
DIGEST_TOKEN=<long random>          # protects /api/digest
# public-source benchmark (optional)
YOUTUBE_API_KEY=
LASTFM_API_KEY=
# optional; needs a Spotify Premium-owned app, and returns no followers/popularity since Feb 2026
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

Remember: if `BASE_URL` has a path prefix (`/timbre`), the Google authorized origin is still the bare origin — `https://mwijay.duckdns.org`.

## 3. Publish it under a path on the existing domain

`/etc/caddy/Caddyfile` — add the `handle_path` block **before** the n8n reverse proxy:

```caddyfile
mwijay.duckdns.org {
	handle_path /timbre/* {
		reverse_proxy 127.0.0.1:8130
	}

	# existing n8n route stays as it is
	reverse_proxy 127.0.0.1:5678
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`handle_path` strips the prefix, so the app keeps serving from `/` internally while the browser sees `/timbre/`. Absolute URLs inside the app (`/api/...`) do **not** get the prefix — either use the bare-path form below, or put the app on its own subdomain.

**Simpler and less brittle:** give it a subdomain instead of a path.

```caddyfile
timbre.mwijay.duckdns.org {
	reverse_proxy 127.0.0.1:8130
}
```

DuckDNS supports several subdomains per account (`timbre.mwijay.duckdns.org` → same IP), Caddy gets the certificate automatically, and no path rewriting is needed anywhere.

## 4. Verify

```bash
curl -s localhost:8130/api/health
curl -s -o /tmp/r.pdf -w '%{http_code} %{content_type}\n' 'localhost:8130/api/report?source=digest&inline=1'
curl -s -H "authorization: Bearer $DIGEST_TOKEN" localhost:8130/api/digest | head -c 120
curl -s 'localhost:8130/api/benchmark?artist=Limoblaze'
systemctl list-timers 'timbre-*' --no-pager
systemctl status timbre-api --no-pager
```

External:

```bash
curl -s -H "authorization: Bearer <token>" https://timbre.mwijay.duckdns.org/api/digest | head -c 120
```

## 5. Point Vercel at it

In the Vercel project (`timbre`):

```
DIGEST_URL=https://timbre.mwijay.duckdns.org/api/digest
DIGEST_TOKEN=<same token as the box>
```

Redeploy once. `/api/report?source=digest` on Vercel now renders whatever the box pulled most recently, and falls back to the committed copy within 4 seconds if the box is down.

## 6. Coexistence rules

- **Do not** let n8n manage these timers. Two schedulers on one box fighting over the same IMAP folder is how you get duplicate imports. Pick one: systemd timers (current setup) *or* an n8n workflow that shells into `pipeline/src/inbox.ts`.
- Keep n8n's Docker volumes and Timbre's `/opt/timbre/data` separate; they are backed up independently.
- Update path: `sudo -u timbre git -C /opt/timbre pull && sudo systemctl restart timbre-api`.
- Logs: `journalctl -u timbre-api -f`, `journalctl -u timbre-inbox -n 50`.
