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
    baseUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.BASE_URL || "",
  });
}
