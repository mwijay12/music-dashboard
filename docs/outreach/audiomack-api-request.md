# Audiomack Data API — access request (ON HOLD)

> **Status (2026-11-08): not sent — the artist decided against requesting access.**
> Nothing in the product depends on it. The weekly statistics email already
> supplies the Audiomack numbers, so the daily-series upgrade stays available
> rather than pursued. Revisit only if a per-track daily curve becomes a real
> requirement. Keep the draft for that day; do not send it by default.

There is no self-serve portal: Audiomack issues OAuth 1.0a consumer keys by hand. Their own developer guidance says to request a key through their support channel, so the email below is the whole process.

- Docs (what you are applying for): <https://www.audiomack.com/data-api/docs>
- Send to: **support@audiomack.com**
- CC (if you have a distributor/label contact): optional, it helps
- Sender: the email tied to your artist account if possible

## Fill these in first

| Placeholder | Where to get it |
| --- | --- |
| `<YOUR NAME>` | you |
| `<ARTIST NAME>` | `Piano Sifa Afro Gospel Amapiano Hub` |
| `<ARTIST URL>` | open your artist page on audiomack.com, copy the URL |
| `<EMAIL>` / `<PHONE>` | you |
| `<DOMAIN>` | the box that will run the poller, e.g. `https://timbre.example.com` |

## The email (copy as-is)

> **Subject:** Data API access request — read-only analytics for our own artist account
>
> Hello Audiomack team,
>
> I manage the artist account **<ARTIST NAME>** (<ARTIST URL>) and I would like to request
> Data API v1 credentials (OAuth 1.0a consumer key and secret).
>
> **What we would do with it**
> - Read only our own account's metrics: artist plays, followers, favourites, and per-track plays
> - Poll at most a few times per day from a single server, JSON only
> - Render the result into a weekly PDF for our own planning
>
> **What we would not do with it**
> - No redistribution or resale of Audiomack data
> - No third-party or multi-artist access
> - No scraping of the website, no automated downloads of audio
>
> **Technical details**
> - Server-side only (no browser client), OAuth 1.0a HMAC-SHA1
> - We can host any callback URL you require, e.g. `<DOMAIN>/oauth/audiomack/callback`
> - We are happy to sign whatever usage agreement you use, and to keep volume to one
>   request per minute or less
>
> If it helps, I can send a one-page sample of the report we produce from the weekly
> statistics email you already send us — that is the same data, just rendered.
>
> Thank you,
> **<YOUR NAME>**
> <EMAIL> · <PHONE>

## While waiting

- The weekly Audiomack statistics email already drives the dashboard (`npm run inbox` → `data/audiomack-digest.json` → PDF). Nothing is blocked on this request.
- If the reply is slow (>2 weeks), reply once in the same thread with a one-line bump; do not open new threads.
- If they decline, the fallback is a paid aggregator (Soundcharts / Chartmetric) for Audiomack plays, or Spotify for Artists CSV for the other platform.

## When the keys arrive

Put them in `/opt/timbre/.env` only — never in chat, never in git:

```dotenv
AUDIOMACK_CONSUMER_KEY=
AUDIOMACK_CONSUMER_SECRET=
AUDIOMACK_ACCESS_TOKEN=
AUDIOMACK_ACCESS_SECRET=
```

Then smoke-test with a signed `GET https://api.audiomack.com/v1/debug` before wiring the poller. Unsigned, that same call answers
`{"errorcode":1003,"message":"Invalid consumer key"}` — so a 200 means the signature chain is correct.
