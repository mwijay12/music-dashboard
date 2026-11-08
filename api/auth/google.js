import { OAuth2Client } from "google-auth-library";
import {
  authConfig,
  createSessionToken,
  publicUser,
  setSessionCookie,
} from "../../serverless/session.mjs";

const client = () => {
  const { googleClientId } = authConfig();
  return googleClientId ? new OAuth2Client(googleClientId) : null;
};

async function verifyCredential(credential) {
  const config = authConfig();
  const oauth = client();
  if (!oauth) throw new Error("Google sign-in is not configured.");

  const ticket = await oauth.verifyIdToken({
    idToken: credential,
    audience: config.googleClientId,
  });
  const payload = ticket.getPayload();
  const validIssuer =
    payload?.iss === "https://accounts.google.com" || payload?.iss === "accounts.google.com";

  if (!payload?.sub || !payload.email || payload.email_verified !== true || !validIssuer) {
    throw new Error("Google account could not be verified.");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name?.trim() || payload.email.split("@")[0],
    picture: payload.picture || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const config = authConfig();
  if (!config.googleConfigured) {
    return res.status(503).json({ error: "Google sign-in is not configured." });
  }
  if (!config.sessionConfigured) {
    return res.status(503).json({
      error: "SESSION_SECRET is not set, so sessions cannot be signed on this deployment.",
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const credential = typeof body.credential === "string" ? body.credential : "";
  if (!credential) {
    return res.status(400).json({ error: "Missing Google credential." });
  }

  try {
    const profile = await verifyCredential(credential);
    const token = createSessionToken(profile);
    if (!token) {
      return res.status(503).json({ error: "Session signing is unavailable." });
    }
    setSessionCookie(req, res, token);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, user: publicUser(profile) });
  } catch (error) {
    console.warn("Google sign-in rejected:", error instanceof Error ? error.message : "unknown error");
    return res.status(401).json({ error: "Google sign-in could not be verified." });
  }
}
