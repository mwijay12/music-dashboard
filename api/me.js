import { authConfig, publicUser, readSession } from "../serverless/session.mjs";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const config = authConfig();
  const session = readSession(req);

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    authenticated: Boolean(session),
    user: session ? publicUser(session) : null,
    authRequired: config.authRequired,
    googleConfigured: config.googleConfigured,
    sessionConfigured: config.sessionConfigured,
  });
}
