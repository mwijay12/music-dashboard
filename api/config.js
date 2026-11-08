import { authConfig } from "../serverless/session.mjs";

export default function handler(req, res) {
  const config = authConfig();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    googleClientId: config.googleClientId || null,
    googleConfigured: config.googleConfigured,
    authRequired: config.authRequired,
    sessionConfigured: config.sessionConfigured,
    youtubeConnectReady: Boolean(config.googleClientId && process.env.GOOGLE_CLIENT_SECRET),
    // Which public benchmark sources can answer. Deezer is keyless.
    benchmarkSources: {
      deezer: true,
      lastfm: Boolean(process.env.LASTFM_API_KEY),
      youtube: Boolean(process.env.YOUTUBE_API_KEY),
      spotify: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
    },
    baseUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.BASE_URL || "",
  });
}
