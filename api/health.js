import { authConfig } from "../serverless/session.mjs";

export default function handler(req, res) {
  const config = authConfig();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    runtime: "vercel",
    authRequired: config.authRequired,
    googleConfigured: config.googleConfigured,
    sessionConfigured: config.sessionConfigured,
    snapshotProxy: Boolean(process.env.LIVE_SNAPSHOT_URL?.trim()),
  });
}
