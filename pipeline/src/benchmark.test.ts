// @ts-nocheck — exercises the .mjs benchmark module with a fake fetch.
import assert from "node:assert/strict";
import test from "node:test";

import { lookupDeezer, lookupLastfm, lookupSpotify, lookupYouTube, resolveBenchmark } from "../../serverless/benchmark/sources.mjs";

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    for (const [pattern, handler] of routes) {
      if (String(url).includes(pattern)) {
        const result = typeof handler === "function" ? await handler(options) : handler;
        if (result instanceof Error) throw result;
        return {
          ok: result.status === undefined || result.status < 400,
          status: result.status ?? 200,
          json: async () => result.body,
        };
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  impl.calls = calls;
  return impl;
}

/* The Artist object after February 2026: no `followers`, no `popularity`. */
const spotifyArtist = {
  name: "Limoblaze",
  id: "0liXA3xwx6pncxYQA30ahT",
  genres: ["afro gospel"],
  images: [{ url: "https://i.scdn.co/image/x.jpg" }],
  external_urls: { spotify: "https://open.spotify.com/artist/0liXA3xwx6pncxYQA30ahT" },
};

const routes = [
  ["accounts.spotify.com/api/token", { body: { access_token: "tok", expires_in: 3600 } }],
  ["/v1/artists/0liXA3xwx6pncxYQA30ahT/albums", { body: { items: [{ name: "Afrobeats Worship", album_type: "album", release_date: "2024-03-01", external_urls: { spotify: "a" } }] } }],
  ["/v1/artists/0liXA3xwx6pncxYQA30ahT", { body: spotifyArtist }],
  ["/v1/search", { body: { artists: { items: [{ id: spotifyArtist.id }] } } }],
  ["api.deezer.com/search/artist", { body: { data: [{ id: 105958765, name: "Limoblaze", nb_fan: 4210, nb_album: 12, link: "https://www.deezer.com/artist/105958765" }] } }],
  ["api.deezer.com/artist/105958765/top", { body: { data: [{ title: "Jireh (My Provider)", rank: 812345, link: "https://www.deezer.com/track/1" }] } }],
  ["api.deezer.com/artist/105958765", { body: { id: 105958765, name: "Limoblaze", nb_fan: 4210, nb_album: 12, link: "https://www.deezer.com/artist/105958765", picture_xl: "https://e-cdns-images.dzcdn.net/x.jpg" } }],
  ["ws.audioscrobbler.com", { body: { artist: { name: "Limoblaze", url: "https://www.last.fm/music/Limoblaze", stats: { listeners: "51234", playcount: "1234567" }, image: [{ "#text": "small" }, { "#text": "https://lastfm.freetls.fastly.net/x.jpg" }], similar: { artist: [{ name: "Ada Ehi" }] } } } }],
  ["youtube/v3/search", { body: { items: [{ id: { channelId: "UC123" } }] } }],
  ["youtube/v3/channels", { body: { items: [{ id: "UC123", snippet: { title: "Limoblaze" }, statistics: { subscriberCount: "413000", viewCount: "172960000", videoCount: "385" } }] } }],
];

test("spotify lookup: search → artist → albums, with the post-Feb-2026 gaps reported as null", async () => {
  const fetchImpl = fakeFetch(routes);
  const result = await lookupSpotify("Limoblaze", { clientId: "id", clientSecret: "secret", fetchImpl });

  assert.equal(result.configured, true);
  assert.equal(result.found, true);
  assert.equal(result.artist.followers, null);
  assert.equal(result.artist.popularity, null);
  assert.deepEqual(result.artist.genres, ["afro gospel"]);
  assert.equal(result.albums[0].title, "Afrobeats Worship");
  assert.deepEqual(result.topTracks, []);
  assert.match(result.note, /Feb 2026/);

  // top-tracks was removed from the API; asking for it would 404 in production.
  assert.equal(fetchImpl.calls.some((call) => call.url.includes("top-tracks")), false);

  const tokenCall = fetchImpl.calls.find((call) => call.url.includes("accounts.spotify.com"));
  assert.equal(tokenCall.options.method, "POST");
  assert.deepEqual(tokenCall.options.body, "grant_type=client_credentials");
});

test("spotify without keys reports unconfigured instead of throwing", async () => {
  const result = await lookupSpotify("Limoblaze", { clientId: "", clientSecret: "", fetchImpl: fakeFetch([]) });
  assert.equal(result.configured, false);
  assert.match(result.reason, /SPOTIFY_CLIENT_ID/);
});

test("deezer needs no key at all and returns a fan count", async () => {
  const fetchImpl = fakeFetch(routes);
  const result = await lookupDeezer("Limoblaze", { fetchImpl });

  assert.equal(result.configured, true);
  assert.equal(result.found, true);
  assert.equal(result.artist.fans, 4210);
  assert.equal(result.artist.albums, 12);
  assert.equal(result.topTracks[0].title, "Jireh (My Provider)");
  assert.equal(result.topTracks[0].rank, 812345);
  // no token exchange, no key in any URL
  assert.equal(fetchImpl.calls.some((call) => call.url.includes("access_token")), false);
  assert.equal(fetchImpl.calls.every((call) => !call.url.includes("api_key")), true);
});

test("deezer reports its 200-with-error quota body as an actionable hint", async () => {
  const fetchImpl = fakeFetch([
    ["api.deezer.com/search/artist", { status: 200, body: { error: { type: "Exception", message: "Quota limit exceeded", code: 4 } } }],
  ]);
  const result = await lookupDeezer("Limoblaze", { fetchImpl });
  assert.equal(result.found, false);
  assert.match(result.error, /error 4/);
  assert.match(result.hint, /50 requests per 5 seconds/);
});

test("last.fm returns listeners and play counts", async () => {
  const fetchImpl = fakeFetch(routes);
  const result = await lookupLastfm("Limoblaze", { apiKey: "k", fetchImpl });

  assert.equal(result.found, true);
  assert.equal(result.artist.listeners, 51234);
  assert.equal(result.artist.playcount, 1234567);
  assert.equal(result.artist.image, "https://lastfm.freetls.fastly.net/x.jpg");
  assert.deepEqual(result.similar, ["Ada Ehi"]);
  assert.match(fetchImpl.calls[0].url, /api_key=k/);
});

test("last.fm unknown artist is 'not found', not an error", async () => {
  const fetchImpl = fakeFetch([["ws.audioscrobbler.com", { status: 404, body: { error: 6, message: "The artist you supplied could not be found" } }]]);
  const result = await lookupLastfm("Nobody At All", { apiKey: "k", fetchImpl });
  assert.equal(result.found, false);
  assert.equal(result.error, undefined);
});

test("last.fm without a key reports unconfigured", async () => {
  const result = await lookupLastfm("Limoblaze", { apiKey: "" });
  assert.equal(result.configured, false);
  assert.match(result.reason, /LASTFM_API_KEY/);
});

test("youtube resolves a @handle straight to the channel", async () => {
  const fetchImpl = fakeFetch([
    ["forHandle=limoblaze", { body: { items: [{ id: "UC123" }] } }],
    ["youtube/v3/channels", { body: { items: [{ id: "UC123", snippet: { title: "Limoblaze" }, statistics: { subscriberCount: "413000", viewCount: "172960000", videoCount: "385" } }] } }],
  ]);
  const result = await lookupYouTube("@limoblaze", { apiKey: "k", fetchImpl });
  assert.equal(result.channel.subscribers, 413000);
  assert.equal(result.channel.views, 172960000);
  // no /search call was needed
  assert.equal(fetchImpl.calls.some((call) => call.url.includes("/search")), false);
});

test("youtube falls back to search for a plain name", async () => {
  const fetchImpl = fakeFetch(routes);
  const result = await lookupYouTube("Limoblaze", { apiKey: "k", fetchImpl });
  assert.equal(result.channel.id, "UC123");
  assert.equal(result.channel.subscribers, 413000);
});

test("resolveBenchmark merges every source with the artist's own numbers", async () => {
  const digest = {
    account: "Piano Sifa Afro Gospel Amapiano Hub",
    latest: {
      account: "Piano Sifa Afro Gospel Amapiano Hub",
      periodEnd: "2026-11-07",
      totals: { plays: 103, followers: 0 },
      tracks: [{ title: "A", plays: 300 }, { title: "B", plays: 160 }],
    },
  };
  const payload = await resolveBenchmark({
    artist: "Limoblaze",
    digest,
    fetchImpl: fakeFetch(routes),
    env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "s", YOUTUBE_API_KEY: "k", LASTFM_API_KEY: "l" },
  });

  assert.equal(payload.configured, true);
  assert.deepEqual(payload.sources.map((source) => source.source), ["deezer", "lastfm", "youtube", "spotify"]);
  assert.equal(payload.you.plays7d, 103);
  assert.equal(payload.you.lifetime, 460);
  assert.equal(payload.help, undefined);
  assert.deepEqual(payload.optionalKeys.map((entry) => entry.env), [
    "YOUTUBE_API_KEY",
    "LASTFM_API_KEY",
    "SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET",
  ]);
});

test("with no keys at all deezer still answers, so the tab is never empty", async () => {
  const payload = await resolveBenchmark({ artist: "Limoblaze", env: {}, fetchImpl: fakeFetch(routes) });
  assert.equal(payload.configured, true);
  assert.equal(payload.help, undefined);

  const bySource = Object.fromEntries(payload.sources.map((source) => [source.source, source]));
  assert.equal(bySource.deezer.found, true);
  assert.equal(bySource.deezer.artist.fans, 4210);
  assert.equal(bySource.lastfm.configured, false);
  assert.equal(bySource.youtube.configured, false);
  assert.equal(bySource.spotify.configured, false);
});

test("empty artist name is rejected", async () => {
  const payload = await resolveBenchmark({ artist: "   ", env: {} });
  assert.equal(payload.error, "Missing artist name.");
});

test("HTTP failures carry an actionable hint instead of a bare status", async () => {
  const forbidden = fakeFetch([["/v1/search", { status: 403, body: {} }]]);
  const spotify = await lookupSpotify("Limoblaze", { clientId: "id", clientSecret: "s", token: "t", fetchImpl: forbidden });
  assert.equal(spotify.found, false);
  assert.match(spotify.error, /403/);
  assert.match(spotify.hint, /Premium|blocked/);

  const yt = await lookupYouTube("@limoblaze", {
    apiKey: "k",
    fetchImpl: fakeFetch([["forHandle=", { status: 403, body: {} }], ["youtube/v3/search", { status: 403, body: {} }]]),
  });
  assert.equal(yt.found, false);
  assert.match(yt.hint, /403|forbidden|quota/i);

  const bad = await lookupSpotify("Limoblaze", {
    clientId: "id",
    clientSecret: "s",
    token: "t",
    fetchImpl: fakeFetch([["/v1/search", { status: 401, body: {} }]]),
  });
  assert.match(bad.hint, /rejected/);

  const lastfm = await lookupLastfm("Limoblaze", {
    apiKey: "k",
    fetchImpl: fakeFetch([["ws.audioscrobbler.com", { status: 403, body: { error: 10, message: "Invalid API key" } }]]),
  });
  assert.match(lastfm.hint, /LASTFM_API_KEY/);
});
