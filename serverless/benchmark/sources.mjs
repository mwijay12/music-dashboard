/**
 * Public-source artist lookup ("benchmark").
 *
 * Why this exists: for an artist with thousands of listeners, every number is
 * already public — Chartmetric, kworb, stats.fm, viberate. For an artist with
 * 103 plays a week, none of them have anything at all. So the benchmark tab is
 * not a stats mirror; it is the comparison the artist cannot make by hand:
 * "the acts you want to be like have these numbers, here is the gap".
 *
 * Sources, in the order they matter:
 *   - Deezer, keyless public API — works with no account at all (`nb_fan`)
 *   - Last.fm, free self-serve key — listeners + play counts
 *   - YouTube Data API v3, plain API key — subscribers, views
 *   - Spotify Web API, client-credentials — catalogue only since Feb 2026,
 *     because Dev Mode now needs Premium and the API dropped follower,
 *     popularity and top-track data
 * Nothing throws: a source that cannot run reports `configured:false`, and the
 * payload stays useful as long as one source answers.
 */

/** Turns an opaque HTTP status into something the operator can act on. */
export function hintFor(message = "") {
  const text = String(message);

  // Provider-specific first: their messages also contain a status code.
  if (/deezer/i.test(text) && /error 4|quota/i.test(text)) {
    return "Deezer's keyless API is rate limited per IP (about 50 requests per 5 seconds). Back off and retry; no key is involved.";
  }
  if (/last\.?fm|audioscrobbler/i.test(text) && /\b(401|403)\b/.test(text)) {
    return "Last.fm rejected the key: check LASTFM_API_KEY (it is the 32-character key, not the shared secret) or that the key was not suspended.";
  }
  if (/spotify/i.test(text) && /\b(401|403)\b/.test(text)) {
    return "Spotify rejected the client ID/secret, or the app is blocked. Since Feb 2026 Development Mode apps require a Spotify Premium owner; free accounts get 403 on every call.";
  }
  if (/\b401\b/.test(text)) {
    return "The key/secret was rejected. YouTube: the API key is wrong or was deleted.";
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
  if (/\b50[234]\b/.test(text)) {
    return "The provider returned a server error. Usually transient — retry in a minute; nothing to fix on our side.";
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

/**
 * Spotify, as of the February 2026 Web API changes.
 *
 * Two things changed under us:
 *   1. Development Mode now requires the app owner to hold Spotify Premium, so
 *      the keys can only exist for a paying account.
 *   2. `GET /artists/{id}/top-tracks` was removed, and the `followers` and
 *      `popularity` fields were stripped from the Artist object.
 *
 * So this source is kept for the catalogue facts it still returns (name,
 * artwork, genres, link, albums) and reports the missing numbers as null
 * instead of pretending. Deezer and Last.fm below carry the audience numbers.
 */
export async function lookupSpotify(artistName, options = {}) {
  const clientId = options.clientId ?? process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.SPOTIFY_CLIENT_SECRET;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!clientId || !clientSecret) {
    return {
      source: "spotify",
      configured: false,
      reason: "SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set (Spotify needs a Premium account to create the app)",
    };
  }

  try {
    const token = options.token ?? (await getSpotifyToken({ clientId, clientSecret, fetchImpl }));
    const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
    const call = async (path) => {
      const response = await fetchImpl(`${SPOTIFY_API}${path}`, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Spotify ${path} HTTP ${response.status}`);
      return response.json();
    };

    // `limit` max dropped from 50 to 10 in Feb 2026.
    const search = await call(`/search?type=artist&limit=10&q=${encodeURIComponent(artistName)}`);
    const hit = search?.artists?.items?.[0];
    if (!hit) return { source: "spotify", configured: true, found: false };

    const [artist, albums] = await Promise.all([
      call(`/artists/${encodeURIComponent(hit.id)}`),
      call(`/artists/${encodeURIComponent(hit.id)}/albums?include_groups=album,single&limit=5`).catch(() => ({ items: [] })),
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
      topTracks: [],
      albums: (albums.items ?? []).slice(0, 5).map((album) => ({
        title: album.name,
        type: album.album_type ?? null,
        releaseDate: album.release_date ?? null,
        url: album.external_urls?.spotify ?? null,
      })),
      partial: true,
      note:
        "Spotify's Feb 2026 API no longer returns artist followers/popularity and removed top-tracks; those fields are null. Deezer and Last.fm provide the audience numbers.",
    };
  } catch (error) {
    return { source: "spotify", configured: true, found: false, error: error.message, hint: hintFor(error.message) };
  }
}

/* ------------------------------------------------------------------ *
 * Deezer — keyless.
 *
 * No app, no OAuth, no account: `api.deezer.com` is open for reading.
 * That makes it the one public source that can never be taken away from
 * this endpoint by a signup wall, so it is the default audience datapoint.
 * `nb_fan` is Deezer's own follower count — the closest thing to the
 * Spotify follower number we lost.
 * ------------------------------------------------------------------ */
const DEEZER_API = "https://api.deezer.com";
const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

function deezerError(body, what) {
  const error = body?.error;
  if (!error) return null;
  const detail = typeof error === "string" ? error : error.message || error.type || "unknown error";
  return new Error(`Deezer ${what} error${error.code ? ` ${error.code}` : ""}: ${detail}`);
}

export async function lookupDeezer(artistName, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const call = async (path) => {
    const response = await fetchImpl(`${DEEZER_API}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    // Deezer signals quota/errors with a 200 and an `error` object.
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`Deezer ${path} HTTP ${response.status}`);
    const error = deezerError(body, path.split("?")[0]);
    if (error) throw error;
    return body;
  };

  try {
    const search = await call(`/search/artist?q=${encodeURIComponent(artistName)}&limit=1`);
    const hit = search?.data?.[0];
    if (!hit) return { source: "deezer", configured: true, found: false };

    const [artist, top] = await Promise.all([
      call(`/artist/${encodeURIComponent(hit.id)}`),
      call(`/artist/${encodeURIComponent(hit.id)}/top?limit=5`).catch(() => ({ data: [] })),
    ]);

    return {
      source: "deezer",
      configured: true,
      found: true,
      artist: {
        name: artist.name ?? hit.name ?? null,
        id: artist.id ?? hit.id,
        url: artist.link ?? hit.link ?? null,
        fans: Number(artist.nb_fan ?? hit.nb_fan ?? 0),
        albums: Number(artist.nb_album ?? hit.nb_album ?? 0),
        image: artist.picture_xl ?? artist.picture_big ?? hit.picture_big ?? null,
      },
      topTracks: (top?.data ?? []).slice(0, 5).map((track) => ({
        title: track.title ?? null,
        rank: track.rank ?? null,
        url: track.link ?? null,
      })),
      note: "Deezer is keyless; 'fans' is Deezer's follower count, not Spotify listeners.",
    };
  } catch (error) {
    return { source: "deezer", configured: true, found: false, error: error.message, hint: hintFor(error.message) };
  }
}

/* ------------------------------------------------------------------ *
 * Last.fm — free key, no approval, no Premium.
 *
 * `listeners` is a scrobbler audience count and it is the only free
 * figure that tracks the same shape as "how many people actually listen
 * to this act", which is the comparison the tab exists for.
 * ------------------------------------------------------------------ */
export async function lookupLastfm(artistName, options = {}) {
  const apiKey = options.apiKey ?? process.env.LASTFM_API_KEY;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!apiKey) {
    return { source: "lastfm", configured: false, reason: "LASTFM_API_KEY not set (free key, no approval)" };
  }

  try {
    const url =
      `${LASTFM_API}?method=artist.getinfo&artist=${encodeURIComponent(artistName)}` +
      `&api_key=${encodeURIComponent(apiKey)}&format=json&autocorrect=1`;
    const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => null);

    if (!response.ok || body?.error) {
      // 6 = artist not found; that is an answer, not a failure.
      if (body?.error === 6) return { source: "lastfm", configured: true, found: false };
      const detail = body?.message ? `: ${body.message}` : "";
      throw new Error(`Last.fm HTTP ${response.status}${body?.error ? ` (error ${body.error})` : ""}${detail}`);
    }

    const artist = body?.artist;
    if (!artist) return { source: "lastfm", configured: true, found: false };

    const images = Array.isArray(artist.image) ? artist.image : [];
    const largest = [...images].reverse().find((entry) => entry?.["#text"]);

    return {
      source: "lastfm",
      configured: true,
      found: true,
      artist: {
        name: artist.name ?? null,
        url: artist.url ?? null,
        listeners: Number(artist.stats?.listeners ?? 0),
        playcount: Number(artist.stats?.playcount ?? 0),
        image: largest?.["#text"] ?? null,
      },
      similar: (artist.similar?.artist ?? []).slice(0, 5).map((entry) => entry.name).filter(Boolean),
      note: "Last.fm listeners are scrobbles, not streams; use it for relative reach, not revenue.",
    };
  } catch (error) {
    return { source: "lastfm", configured: true, found: false, error: error.message, hint: hintFor(error.message) };
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

  const [spotify, deezer, lastfm, youtube] = await Promise.all([
    lookupSpotify(name, {
      fetchImpl,
      clientId: env.SPOTIFY_CLIENT_ID,
      clientSecret: env.SPOTIFY_CLIENT_SECRET,
    }),
    lookupDeezer(name, { fetchImpl }),
    lookupLastfm(name, { fetchImpl, apiKey: env.LASTFM_API_KEY }),
    lookupYouTube(name, { fetchImpl, apiKey: env.YOUTUBE_API_KEY }),
  ]);

  // Deezer needs no key, so the endpoint is functional unless it is also down.
  const anyConfigured = spotify.configured || deezer.configured || lastfm.configured || youtube.configured;
  const optionalKeys = [
    { env: "YOUTUBE_API_KEY", adds: "YouTube subscribers, views and video count (Google Cloud, free)" },
    { env: "LASTFM_API_KEY", adds: "Last.fm listeners and play counts (free, instant, no approval)" },
    {
      env: "SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET",
      adds: "Spotify link/artwork/albums only — needs a Premium account, and since Feb 2026 gives no followers or popularity",
    },
  ];

  return {
    query: name,
    fetchedAt: new Date().toISOString(),
    configured: anyConfigured,
    keyless: ["deezer"],
    sources: [deezer, lastfm, youtube, spotify],
    optionalKeys,
    you: ownNumbers(digest),
    ...(anyConfigured
      ? {}
      : {
          help:
            "Every source failed. Deezer needs no key at all — if it failed too, the function cannot reach the public internet, which is an infrastructure problem, not a configuration one.",
        }),
  };
}
