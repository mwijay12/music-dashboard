import { fetchJson } from "../lib/http";
import type { SpotifyAlbum, SpotifyArtistData, SpotifyTrack } from "../types";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyArtistResponse {
  id: string;
  name: string;
  followers: { total: number };
  popularity: number;
  genres: string[];
  images: Array<{ url: string }>;
  external_urls?: { spotify?: string };
}

interface SpotifyTracksResponse {
  tracks: Array<{
    id: string;
    name: string;
    popularity: number;
    duration_ms: number;
    preview_url: string | null;
    album?: { name?: string; release_date?: string };
    external_urls?: { spotify?: string };
  }>;
}

interface SpotifyAlbumsResponse {
  items: Array<{
    id: string;
    name: string;
    album_type: string;
    release_date?: string;
    total_tracks: number;
    external_urls?: { spotify?: string };
  }>;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const clientId = requiredEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requiredEnv("SPOTIFY_CLIENT_SECRET");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as TokenResponse;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(30, data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
}

async function spotifyGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  return fetchJson<T>(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchSpotifyArtist(artistId: string, market = "US"): Promise<SpotifyArtistData> {
  const safeMarket = /^[A-Za-z]{2}$/.test(market) ? market.toUpperCase() : "US";

  const [artist, topTracks, albums] = await Promise.all([
    spotifyGet<SpotifyArtistResponse>(`/artists/${encodeURIComponent(artistId)}`),
    spotifyGet<SpotifyTracksResponse>(`/artists/${encodeURIComponent(artistId)}/top-tracks?market=${safeMarket}`),
    spotifyGet<SpotifyAlbumsResponse>(
      `/artists/${encodeURIComponent(artistId)}/albums?include_groups=album,single&limit=10&market=${safeMarket}`
    ),
  ]);

  const normalizedTracks: SpotifyTrack[] = (topTracks.tracks || []).slice(0, 5).map((track) => ({
    id: track.id,
    name: track.name,
    popularity: track.popularity ?? 0,
    durationMs: track.duration_ms ?? 0,
    previewUrl: track.preview_url ?? null,
    album: track.album?.name ?? "",
    releaseDate: track.album?.release_date ?? null,
    url: track.external_urls?.spotify ?? null,
  }));

  const normalizedAlbums: SpotifyAlbum[] = (albums.items || []).map((album) => ({
    id: album.id,
    name: album.name,
    type: album.album_type,
    releaseDate: album.release_date ?? null,
    totalTracks: album.total_tracks ?? 0,
    url: album.external_urls?.spotify ?? null,
  }));

  return {
    id: artist.id,
    name: artist.name,
    followers: artist.followers?.total ?? 0,
    popularity: artist.popularity ?? 0,
    genres: artist.genres || [],
    image: artist.images?.[0]?.url ?? null,
    url: artist.external_urls?.spotify ?? null,
    topTracks: normalizedTracks,
    albums: normalizedAlbums,
  };
}
