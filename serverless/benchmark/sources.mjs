/**
 * Public-source artist lookup ("benchmark").
 *
 * Why this exists: for an artist with thousands of listeners, every number is
 * already public — Chartmetric, kworb, stats.fm, viberate. For an artist with
 * 103 plays a week, none of them have anything at all. So the benchmark tab is
 * not a stats mirror; it is the comparison the artist cannot make by hand:
 * "the acts you want to be like have these numbers, here is the gap".
 *
 * Sources used here are the two that are legitimately self-serve:
 *   - Spotify Web API, client-credentials flow (no user login, no OAuth screen)
 *   - YouTube Data API v3, plain API key
 * Everything is key-gated: with no keys the endpoint returns a structured
 * "unconfigured" payload instead of throwing.
 */

/** Turns an opaque HTTP status into something the operator can act on. */
export function hintFor(message = "") {
  const text = String(message);
  if (/\b401\b/.test(text)) {
    return "The key/secret was rejected. Spotify: client ID or secret is wrong. YouTube: the API key is wrong or was deleted.";
  }
  if (/\b403\b/.test(text)) {
    return "Access forbidden: for YouTube this usually means the API is not enabled on the key's project, the key is restricted to other APIs, or the daily quota (10,000 units) is spent.";
  }
  if (/\b400\b/.test(text)) {
    return "Bad request: a restricted key or a malformed handle. Check the API restrictions on the key.";
  }
  if (/\b429\b/.test(text)) {
    return "Rate limited. Wait a few minutes; Spotify's client-credentials calls are limited per app.";
  }
  if (/timeout|aborted|fetch failed|ENOTFOUND|ECONN/i.test(text)) {
    return "Network failure reaching the provider from the server. On EC2, check outbound DNS/egress.";
  }
  return null;
}

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

/* Spotify tokens last an hour; one process-wide cache is plenty. */
let spotifyToken = { value: null, expiresAt: 0 };

async function getSpotifyToken({ clientId, clientSecret, fetchImpl }) {
  const now = Date.now();
  if (spotifyToken.value && spotifyToken.expiresAt > now + 30_000) return spotifyToken.value;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetchImpl(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Spotify token HTTP ${response.status}`);
  const body = await response.json();
  spotifyToken = {
    value: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
  };
  return spotifyToken.value;
}

export async function lookupSpotify(artistName, options = {}) {
  const clientId = options.clientId ?? process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.SPOTIFY_CLIENT_SECRET;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!clientId || !clientSecret) {
    return { source: "spotify", configured: false, reason: "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set" };
  }

  try {
    const token = options.token ?? (await getSpotifyToken({ clientId, clientSecret, fetchImpl }));
    const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
    const call = async (path) => {
      const response = await fetchImpl(`${SPOTIFY_API}${path}`, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Spotify ${path} HTTP ${response.status}`);
      return response.json();
    };

    const search = await call(`/search?type=artist&limit=1&q=${encodeURIComponent(artistName)}`);
    const hit = search?.artists?.items?.[0];
    if (!hit) return { source: "spotify", configured: true, found: false };

    const [artist, topTracks] = await Promise.all([
      call(`/artists/${hit.id}`),
      call(`/artists/${hit.id}/top-tracks?market=US`).catch(() => ({ tracks: [] })),
    ]);

    return {
      source: "spotify",
      configured: true,
      found: true,
      artist: {
        name: artist.name,
        id: artist.id,
        url: artist.external_urls?.spotify ?? null,
        followers: artist.followers?.total ?? null,
        popularity: artist.popularity ?? null,
        genres: artist.genres ?? [],
        image: artist.images?.[0]?.url ?? null,
      },
      topTracks: (topTracks.tracks ?? []).slice(0, 5).map((track) => ({
        title: track.name,
        popularity: track.popularity ?? null,
        url: track.external_urls?.spotify ?? null,
      })),
      note: "Spotify does not publish monthly listeners or per-day streams through this API; aggregators estimate them.",
    };
  } catch (error) {
    return { source: "spotify", configured: true, found: false, error: error.message, hint: hintFor(error.message) };
  }
}

/** Accepts "@handle", a full channel URL, or a plain name. */
function youtubeQueryFor(input) {
  const trimmed = input.trim();
  const handle = trimmed.match(/(?:youtube\.com\/)?@([\w.-]+)/);
  if (handle) return { type: "handle", value: handle[1] };
  const channelId = trimmed.match(/channel\/(UC[\w-]{20,})/);
  if (channelId) return { type: "id", value: channelId[1] };
  return { type: "query", value: trimmed };
}

export async function lookupYouTube(input, options = {}) {
  const key = options.apiKey ?? process.env.YOUTUBE_API_KEY;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!key) {
    return { source: "youtube", configured: false, reason: "YOUTUBE_API_KEY not set" };
  }

  try {
    const target = youtubeQueryFor(input);
    let channelId = null;
    if (target.type === "id") {
      channelId = target.value;
    } else if (target.type === "handle") {
      const byHandle = await fetchImpl(
        `${YOUTUBE_API}/channels?part=statistics,snippet&forHandle=${encodeURIComponent(target.value)}&key=${key}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (byHandle.ok) {
        const body = await byHandle.json();
        channelId = body?.items?.[0]?.id ?? null;
      }
    }

    if (!channelId) {
      const search = await fetchImpl(
        `${YOUTUBE_API}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(target.value)}&key=${key}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!search.ok) throw new Error(`YouTube search HTTP ${search.status}`);
      const body = await search.json();
      channelId = body?.items?.[0]?.id?.channelId ?? body?.items?.[0]?.snippet?.channelId ?? null;
    }
    if (!channelId) return { source: "youtube", configured: true, found: false };

    const response = await fetchImpl(
      `${YOUTUBE_API}/channels?part=statistics,snippet&id=${channelId}&key=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) throw new Error(`YouTube channels HTTP ${response.status}`);
    const body = await response.json();
    const item = body?.items?.[0];
    if (!item) return { source: "youtube", configured: true, found: false };

    return {
      source: "youtube",
      configured: true,
      found: true,
      channel: {
        title: item.snippet?.title ?? null,
        id: item.id,
        url: `https://www.youtube.com/channel/${item.id}`,
        subscribers: Number(item.statistics?.subscriberCount ?? 0),
        views: Number(item.statistics?.viewCount ?? 0),
        videos: Number(item.statistics?.videoCount ?? 0),
      },
    };
  } catch (error) {
    return { source: "youtube", configured: true, found: false, error: error.message, hint: hintFor(error.message) };
  }
}

/** Optional: the artist's own numbers, so the payload can show the gap. */
function ownNumbers(digest) {
  const latest = digest?.latest;
  if (!latest) return null;
  const lifetime = (latest.tracks ?? []).reduce((sum, track) => sum + (track.plays ?? 0), 0);
  return {
    platform: "audiomack",
    account: latest.account ?? digest.account ?? null,
    plays7d: latest.totals?.plays ?? null,
    lifetime,
    followers: latest.totals?.followers ?? null,
    periodEnd: latest.periodEnd ?? null,
  };
}

export async function resolveBenchmark({ artist, digest = null, fetchImpl = fetch, env = process.env } = {}) {
  const name = String(artist || "").trim();
  if (!name) return { error: "Missing artist name." };

  const [spotify, youtube] = await Promise.all([
    lookupSpotify(name, {
      fetchImpl,
      clientId: env.SPOTIFY_CLIENT_ID,
      clientSecret: env.SPOTIFY_CLIENT_SECRET,
    }),
    lookupYouTube(name, { fetchImpl, apiKey: env.YOUTUBE_API_KEY }),
  ]);

  const anyConfigured = spotify.configured || youtube.configured;
  return {
    query: name,
    fetchedAt: new Date().toISOString(),
    configured: anyConfigured,
    sources: [spotify, youtube],
    you: ownNumbers(digest),
    ...(anyConfigured
      ? {}
      : {
          help:
            "Add SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET (developer.spotify.com → Create app) or YOUTUBE_API_KEY (Google Cloud → APIs & Services → Credentials) to enable public-source lookups.",
        }),
  };
}
