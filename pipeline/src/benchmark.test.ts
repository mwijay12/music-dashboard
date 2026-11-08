// @ts-nocheck — exercises the .mjs benchmark module with a fake fetch.
import assert from "node:assert/strict";
import test from "node:test";

import { lookupSpotify, lookupYouTube, resolveBenchmark } from "../../serverless/benchmark/sources.mjs";

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

const spotifyArtist = {
  name: "Limoblaze",
  id: "0liXA3xwx6pncxYQA30ahT",
  followers: { total: 337800 },
  popularity: 56,
  genres: ["afro gospel"],
  images: [{ url: "https://i.scdn.co/image/x.jpg" }],
  external_urls: { spotify: "https://open.spotify.com/artist/0liXA3xwx6pncxYQA30ahT" },
};

const routes = [
  ["accounts.spotify.com/api/token", { body: { access_token: "tok", expires_in: 3600 } }],
  ["/v1/search", { body: { artists: { items: [{ id: spotifyArtist.id }] } } }],
  ["/v1/artists/0liXA3xwx6pncxYQA30ahT/top-tracks", { body: { tracks: [{ name: "Jireh (My Provider)", popularity: 78, external_urls: { spotify: "u" } }] } }],
  ["/v1/artists/0liXA3xwx6pncxYQA30ahT", { body: spotifyArtist }],
  ["youtube/v3/search", { body: { items: [{ id: { channelId: "UC123" } }] } }],
  ["youtube/v3/channels", { body: { items: [{ id: "UC123", snippet: { title: "Limoblaze" }, statistics: { subscriberCount: "413000", viewCount: "172960000", videoCount: "385" } }] } }],
];

test("spotify lookup: search → artist → top tracks", async () => {
  const fetchImpl = fakeFetch(routes);
  const result = await lookupSpotify("Limoblaze", { clientId: "id", clientSecret: "secret", fetchImpl });

  assert.equal(result.configured, true);
  assert.equal(result.found, true);
  assert.equal(result.artist.followers, 337800);
  assert.equal(result.artist.popularity, 56);
  assert.equal(result.topTracks[0].title, "Jireh (My Provider)");
  assert.match(result.note, /monthly listeners/);

  const tokenCall = fetchImpl.calls.find((call) => call.url.includes("accounts.spotify.com"));
  assert.equal(tokenCall.options.method, "POST");
  assert.deepEqual(tokenCall.options.body, "grant_type=client_credentials");
});

test("spotify without keys reports unconfigured instead of throwing", async () => {
  const result = await lookupSpotify("Limoblaze", { clientId: "", clientSecret: "", fetchImpl: fakeFetch([]) });
  assert.equal(result.configured, false);
  assert.match(result.reason, /SPOTIFY_CLIENT_ID/);
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

test("resolveBenchmark merges both sources with the artist's own numbers", async () => {
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
    env: { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "s", YOUTUBE_API_KEY: "k" },
  });

  assert.equal(payload.configured, true);
  assert.equal(payload.sources.length, 2);
  assert.equal(payload.you.plays7d, 103);
  assert.equal(payload.you.lifetime, 460);
  assert.equal(payload.help, undefined);
});

test("no keys at all still returns a usable payload with help text", async () => {
  const payload = await resolveBenchmark({ artist: "Limoblaze", env: {}, fetchImpl: fakeFetch([]) });
  assert.equal(payload.configured, false);
  assert.match(payload.help, /SPOTIFY_CLIENT_ID/);
  assert.equal(payload.sources.every((source) => source.configured === false), true);
});

test("empty artist name is rejected", async () => {
  const payload = await resolveBenchmark({ artist: "   ", env: {} });
  assert.equal(payload.error, "Missing artist name.");
});
