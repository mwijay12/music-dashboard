/**
 * Studio research — the keyless half of the YouTube content studio.
 *
 * Two questions a channel operator asks every week, and neither needs a Google
 * Cloud project:
 *
 *   1. "What are people typing into YouTube about my niche?"
 *      → YouTube's own autocomplete endpoint. It is public, unauthenticated,
 *        and it is the cheapest demand signal that exists: suggestions are
 *        ordered by what real viewers search most.
 *
 *   2. "What are the channels I am competing with actually publishing, and
 *        what is landing?"
 *      → The channel RSS feed. Also public, no key, no quota. It carries the
 *        last ~15 uploads with view counts, which is enough to compute cadence
 *        (uploads/week), median views, and the day+hour that performs.
 *
 * Both are undocumented-but-public endpoints; treat them as a convenience, not
 * a contract. Everything here degrades to "no data" rather than throwing, so a
 * blocked endpoint never stops the report.
 */

export interface Suggestion {
  seed: string;
  text: string;
  /** Position in the suggestion list for that seed: 0 is the strongest. */
  rank: number;
}

export interface FeedVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  views: number;
  url: string;
}

export interface ChannelFeed {
  channelId: string;
  videos: FeedVideo[];
}

export interface FeedStats {
  uploads: number;
  uploadsPerWeek: number;
  medianViews: number;
  meanViews: number;
  topVideo: FeedVideo | null;
  /** Weekday name (EAT) → number of uploads. */
  byWeekday: Record<string, number>;
  /** EAT hour (0–23) → median views of uploads published in that hour. */
  viewsByHour: Record<number, number>;
  /** The hour whose uploads have the best median views, with at least one sample. */
  bestHour: number | null;
  /** Videos published in the last 30 days, newest first. */
  recent: FeedVideo[];
}

const EAT_OFFSET_MINUTES = 180;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toEat(iso: string): { weekday: string; hour: number } | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const shifted = new Date(time + EAT_OFFSET_MINUTES * 60_000);
  return { weekday: WEEKDAYS[shifted.getUTCDay()], hour: shifted.getUTCHours() };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/* ------------------------------------------------------------------ */
/* 1. Search demand: YouTube autocomplete                              */
/* ------------------------------------------------------------------ */

export async function fetchSuggestions(
  seed: string,
  options: { fetchImpl?: typeof fetch; hl?: string } = {}
): Promise<Suggestion[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const hl = options.hl ?? "sw";
  const url =
    `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt` +
    `&hl=${encodeURIComponent(hl)}&q=${encodeURIComponent(seed)}`;

  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const raw = await response.text();
    // The endpoint answers with a bare array: ["seed", ["a", "b"], ...]
    const parsed = JSON.parse(raw) as [string, string[]];
    const list = Array.isArray(parsed?.[1]) ? parsed[1] : [];
    return list
      .filter((text) => typeof text === "string" && text.trim().length > 0)
      .map((text, index) => ({ seed, text: text.trim(), rank: index }));
  } catch {
    return [];
  }
}

export function mergeSuggestions(
  groups: Suggestion[]
): Array<{ text: string; seeds: string[]; bestRank: number; score: number }> {
  const byText = new Map<string, { seeds: string[]; bestRank: number }>();
  for (const suggestion of groups) {
    const key = suggestion.text.toLowerCase();
    const existing = byText.get(key);
    if (existing) {
      existing.bestRank = Math.min(existing.bestRank, suggestion.rank);
      if (!existing.seeds.includes(suggestion.seed)) existing.seeds.push(suggestion.seed);
    } else {
      byText.set(key, { seeds: [suggestion.seed], bestRank: suggestion.rank });
    }
  }

  return [...byText.entries()]
    .map(([text, value]) => ({
      text,
      seeds: value.seeds,
      bestRank: value.bestRank,
      // Appearing under several seeds and high in the list is the strongest signal.
      score: value.seeds.length * 10 + Math.max(0, 10 - value.bestRank),
    }))
    .sort((a, b) => b.score - a.score || a.bestRank - b.bestRank);
}

/* ------------------------------------------------------------------ */
/* 2. Competition: channel RSS                                          */
/* ------------------------------------------------------------------ */

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Minimal Atom reader — the feed is generated by YouTube and is stable. */
export function parseChannelFeed(xml: string, channelId = ""): ChannelFeed {
  const entries = xml.split(/<entry>/).slice(1);
  const videos: FeedVideo[] = [];

  for (const chunk of entries) {
    const videoId = chunk.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? "";
    const title = decodeEntities(chunk.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "");
    const publishedAt = chunk.match(/<published>([^<]+)<\/published>/)?.[1] ?? "";
    const views = Number(chunk.match(/<media:statistics[^>]*views="(\d+)"/)?.[1] ?? 0);
    if (!videoId && !title) continue;
    videos.push({
      videoId,
      title,
      publishedAt,
      views: Number.isFinite(views) ? views : 0,
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
    });
  }

  videos.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { channelId, videos };
}

export async function fetchChannelFeed(
  channelId: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<ChannelFeed> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/atom+xml" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { channelId, videos: [] };
    return parseChannelFeed(await response.text(), channelId);
  } catch {
    return { channelId, videos: [] };
  }
}

export function analyseFeed(feed: ChannelFeed, options: { now?: Date } = {}): FeedStats {
  const now = options.now ?? new Date();
  const videos = feed.videos;
  if (!videos.length) {
    return {
      uploads: 0,
      uploadsPerWeek: 0,
      medianViews: 0,
      meanViews: 0,
      topVideo: null,
      byWeekday: {},
      viewsByHour: {},
      bestHour: null,
      recent: [],
    };
  }

  const times = videos.map((video) => Date.parse(video.publishedAt)).filter((value) => !Number.isNaN(value));
  const spanDays = times.length > 1 ? Math.max(1, (Math.max(...times) - Math.min(...times)) / 86_400_000) : 1;
  const byWeekday: Record<string, number> = {};
  const hourSamples = new Map<number, number[]>();

  for (const video of videos) {
    const eat = toEat(video.publishedAt);
    if (!eat) continue;
    byWeekday[eat.weekday] = (byWeekday[eat.weekday] ?? 0) + 1;
    const bucket = hourSamples.get(eat.hour) ?? [];
    bucket.push(video.views);
    hourSamples.set(eat.hour, bucket);
  }

  const viewsByHour: Record<number, number> = {};
  let bestHour: number | null = null;
  let bestHourMedian = -1;
  for (const [hour, samples] of hourSamples) {
    const value = median(samples);
    viewsByHour[hour] = value;
    if (value > bestHourMedian) {
      bestHourMedian = value;
      bestHour = hour;
    }
  }

  const thirtyDaysAgo = now.getTime() - 30 * 86_400_000;
  const topVideo = [...videos].sort((a, b) => b.views - a.views)[0] ?? null;

  return {
    uploads: videos.length,
    uploadsPerWeek: Math.round((videos.length / spanDays) * 7 * 10) / 10,
    medianViews: median(videos.map((video) => video.views)),
    meanViews: Math.round(videos.reduce((sum, video) => sum + video.views, 0) / videos.length),
    topVideo,
    byWeekday,
    viewsByHour,
    bestHour,
    recent: videos.filter((video) => Date.parse(video.publishedAt) >= thirtyDaysAgo),
  };
}

/* ------------------------------------------------------------------ */
/* 3. The report                                                        */
/* ------------------------------------------------------------------ */

export interface ResearchReport {
  generatedAt: string;
  seeds: string[];
  keywords: Array<{ text: string; seeds: string[]; bestRank: number; score: number }>;
  channels: Array<{ channelId: string; stats: FeedStats }>;
  /** Plain-language conclusions, so the report can be read without charts. */
  findings: string[];
}

export function buildFindings(
  keywords: ResearchReport["keywords"],
  channels: ResearchReport["channels"]
): string[] {
  const findings: string[] = [];

  if (keywords.length) {
    findings.push(
      `Demand: "${keywords[0].text}" is the highest-signal query (rank ${keywords[0].bestRank + 1} under ${
        keywords[0].seeds.length
      } of your seeds).`
    );
    const withSeedOverlap = keywords.filter((entry) => entry.seeds.length > 1).length;
    findings.push(
      `${withSeedOverlap} of ${keywords.length} suggestions appear under more than one seed — those are the enduring searches, not one-off phrasing.`
    );
  } else {
    findings.push(
      "Demand: autocomplete returned nothing. The endpoint may be blocked from this host; the rest of the report still stands."
    );
  }

  const active = channels.filter((entry) => entry.stats.uploads > 0);
  if (active.length) {
    const cadence = active.map((entry) => Math.round(entry.stats.uploadsPerWeek * 10));
    findings.push(
      `Competition publishes a median of ${median(cadence) / 10} uploads per week. Match or beat it with fewer, longer videos, not more shorts.`
    );

    const bestHours = active.map((entry) => entry.stats.bestHour).filter((hour): hour is number => hour !== null);
    if (bestHours.length) {
      const counts = new Map<number, number>();
      for (const hour of bestHours) counts.set(hour, (counts.get(hour) ?? 0) + 1);
      const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      findings.push(
        `Strongest publishing hour across competitors: ${String(winner[0]).padStart(
          2,
          "0"
        )}:00 EAT. The scheduler should default to it until your own data disagrees.`
      );
    }

    const top = active
      .map((entry) => entry.stats.topVideo)
      .filter((video): video is FeedVideo => Boolean(video))
      .sort((a, b) => b.views - a.views)[0];
    if (top) {
      findings.push(
        `Their biggest recent video: "${top.title}" with ${top.views.toLocaleString()} views. Study the title, not the thumbnail.`
      );
    }
  } else {
    findings.push("Competition: no channel feeds resolved. Check the channel IDs in studio/research.json.");
  }

  findings.push(
    "Reminder: views are not the goal. The decision this report supports is which format to publish next week."
  );
  return findings;
}

export async function buildResearchReport(input: {
  seeds: string[];
  channelIds?: string[];
  fetchImpl?: typeof fetch;
  hl?: string;
  now?: Date;
}): Promise<ResearchReport> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const seedGroups = await Promise.all(
    input.seeds.map((seed) => fetchSuggestions(seed, { fetchImpl, hl: input.hl }))
  );
  const keywords = mergeSuggestions(seedGroups.flat());

  const feeds = await Promise.all((input.channelIds ?? []).map((id) => fetchChannelFeed(id, { fetchImpl })));
  const now = input.now ?? new Date();
  const channels = feeds.map((feed) => ({ channelId: feed.channelId, stats: analyseFeed(feed, { now }) }));

  return {
    generatedAt: now.toISOString(),
    seeds: input.seeds,
    keywords,
    channels,
    findings: buildFindings(keywords, channels),
  };
}

export function renderResearchMarkdown(report: ResearchReport): string {
  const lines: string[] = [
    `# Studio research — ${report.generatedAt.slice(0, 10)}`,
    "",
    "Keyless run: YouTube autocomplete for demand, channel RSS for competition. No API key, no quota.",
    "",
    "## What people search",
    "",
    "| # | Query | Seeds | Best rank | Score |",
    "| --- | --- | --- | --- | --- |",
  ];

  report.keywords.slice(0, 25).forEach((entry, index) => {
    lines.push(
      `| ${index + 1} | ${entry.text} | ${entry.seeds.join(", ")} | ${entry.bestRank + 1} | ${entry.score} |`
    );
  });

  lines.push("", "## What competitors publish", "");
  for (const channel of report.channels) {
    const stats = channel.stats;
    lines.push(`### ${channel.channelId}`, "");
    if (!stats.uploads) {
      lines.push("_No feed resolved._", "");
      continue;
    }
    lines.push(
      `- ${stats.uploads} recent uploads · ${stats.uploadsPerWeek}/week · median ${stats.medianViews.toLocaleString()} views`,
      `- best hour (EAT): ${stats.bestHour === null ? "n/a" : `${String(stats.bestHour).padStart(2, "0")}:00`}`,
      `- weekday spread: ${Object.entries(stats.byWeekday)
        .map(([day, count]) => `${day} ${count}`)
        .join(", ")}`
    );
    if (stats.topVideo)
      lines.push(
        `- top video: [${stats.topVideo.title}](${stats.topVideo.url}) — ${stats.topVideo.views.toLocaleString()} views`
      );
    lines.push("");
    for (const video of stats.recent.slice(0, 5)) {
      lines.push(`  - ${video.publishedAt.slice(0, 10)} · ${video.views.toLocaleString()} views · ${video.title}`);
    }
    lines.push("");
  }

  lines.push("## What to do with this", "");
  for (const finding of report.findings) lines.push(`- ${finding}`);
  lines.push("");
  return lines.join("\n");
}
