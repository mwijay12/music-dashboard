export type ArtistRole = "self" | "competitor";

export interface ArtistConfig {
  id: string;
  name: string;
  role?: ArtistRole;
  spotifyArtistId?: string;
  youtubeChannelId?: string;
  youtubeHandle?: string;
}

export interface PipelineConfig {
  market?: string;
  artist: ArtistConfig;
  competitors?: ArtistConfig[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  popularity: number;
  durationMs: number;
  previewUrl: string | null;
  album: string;
  releaseDate: string | null;
  url: string | null;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  type: string;
  releaseDate: string | null;
  totalTracks: number;
  url: string | null;
}

export interface SpotifyArtistData {
  id: string;
  name: string;
  followers: number;
  popularity: number;
  genres: string[];
  image: string | null;
  url: string | null;
  topTracks: SpotifyTrack[];
  albums: SpotifyAlbum[];
}

export interface YouTubeVideo {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  url: string;
}

export interface YouTubeChannelData {
  channelId: string;
  title: string;
  handle: string | null;
  url: string;
  subscribers: number | null;
  views: number;
  videos: number;
  recentVideos: YouTubeVideo[];
}

export interface ArtistSnapshot {
  id: string;
  name: string;
  role: ArtistRole;
  spotify?: SpotifyArtistData;
  youtube?: YouTubeChannelData;
  errors: string[];
}

export interface PublicSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  market: string;
  artists: ArtistSnapshot[];
}
