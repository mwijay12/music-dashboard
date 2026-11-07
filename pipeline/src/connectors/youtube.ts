import { fetchJson } from "../lib/http";
import type { YouTubeChannelData, YouTubeVideo } from "../types";

interface YouTubeListResponse<T> {
  items?: T[];
}

interface YouTubeChannel {
  id: string;
  snippet?: {
    title?: string;
    customUrl?: string;
  };
  statistics?: {
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
    viewCount?: string;
    videoCount?: string;
  };
  contentDetails?: {
    relatedPlaylists?: { uploads?: string };
  };
}

interface YouTubePlaylistItem {
  contentDetails?: { videoId?: string };
}

interface YouTubeVideoItem {
  id: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

function apiKey() {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured");
  return key;
}

async function youtubeGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", apiKey());
  return fetchJson<T>(url);
}

function toNumber(value: string | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function fetchYouTubeChannel(input: {
  channelId?: string;
  handle?: string;
}): Promise<YouTubeChannelData> {
  const params: Record<string, string> = {
    part: "snippet,statistics,contentDetails",
  };

  if (input.channelId) {
    params.id = input.channelId;
  } else if (input.handle) {
    params.forHandle = input.handle.replace(/^@/, "");
  } else {
    throw new Error("YouTube channel ID or handle is required");
  }

  const channelResponse = await youtubeGet<YouTubeListResponse<YouTubeChannel>>("/channels", params);
  const channel = channelResponse.items?.[0];
  if (!channel) throw new Error("YouTube channel not found");

  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  let recentVideos: YouTubeVideo[] = [];

  if (uploadsPlaylistId) {
    const playlistResponse = await youtubeGet<YouTubeListResponse<YouTubePlaylistItem>>("/playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "6",
    });
    const videoIds = (playlistResponse.items || [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));

    if (videoIds.length) {
      const videoResponse = await youtubeGet<YouTubeListResponse<YouTubeVideoItem>>("/videos", {
        part: "snippet,statistics",
        id: videoIds.join(","),
      });

      recentVideos = (videoResponse.items || []).map((video) => ({
        id: video.id,
        title: video.snippet?.title ?? "Untitled",
        publishedAt: video.snippet?.publishedAt ?? "",
        views: toNumber(video.statistics?.viewCount),
        likes: toNumber(video.statistics?.likeCount),
        comments: toNumber(video.statistics?.commentCount),
        url: `https://www.youtube.com/watch?v=${video.id}`,
      }));
    }
  }

  const hidden = Boolean(channel.statistics?.hiddenSubscriberCount);

  return {
    channelId: channel.id,
    title: channel.snippet?.title ?? "YouTube channel",
    handle: channel.snippet?.customUrl ?? input.handle ?? null,
    url: channel.snippet?.customUrl
      ? `https://www.youtube.com/${channel.snippet.customUrl}`
      : `https://www.youtube.com/channel/${channel.id}`,
    subscribers: hidden ? null : toNumber(channel.statistics?.subscriberCount),
    views: toNumber(channel.statistics?.viewCount),
    videos: toNumber(channel.statistics?.videoCount),
    recentVideos,
  };
}
