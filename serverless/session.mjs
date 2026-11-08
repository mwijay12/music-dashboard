import crypto from "node:crypto";

/**
 * Stateless sessions for serverless hosts (Vercel).
 *
 * The Express server keeps a users.json file; a serverless function has no
 * writable disk, so the session cookie carries the signed profile instead.
 * The payload is HMAC-SHA256 signed and never trusted without verification.
 */

export const COOKIE_NAME = "timbre_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const secret = () => process.env.SESSION_SECRET?.trim() || "";

export const authConfig = () => ({
  googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
  googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
  authRequired: process.env.AUTH_REQUIRED === "true",
  sessionConfigured: Boolean(secret()),
});

const base64url = (input) => Buffer.from(input).toString("base64url");

const sign = (payload) =>
  crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export function createSessionToken(user) {
  if (!secret()) return null;
  const payload = base64url(
    JSON.stringify({
      sub: user.sub,
      email: user.email,
      name: user.name,
      picture: user.picture || null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
    })
  );
  return `${payload}.${sign(payload)}`;
}

export function readSession(req) {
  if (!secret()) return null;
  const header = req.headers?.cookie || "";
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;

  const token = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session?.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export const publicUser = (session) => ({
  id: session.sub,
  name: session.name || session.email,
  email: session.email,
  picture: session.picture || null,
});

const isSecure = (req) =>
  req.headers?.["x-forwarded-proto"] === "https" ||
  Boolean(req.headers?.host && !String(req.headers.host).startsWith("localhost"));

export function setSessionCookie(req, res, token) {
  if (!token) return;
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (isSecure(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(req, res) {
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isSecure(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}
