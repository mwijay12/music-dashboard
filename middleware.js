/**
 * Edge auth gate for the dashboard shell.
 *
 * Only active when AUTH_REQUIRED=true. Verifies the same HMAC-signed cookie
 * that /api/auth/google issues, so unsigned or tampered cookies are rejected
 * before the HTML is served (no flash of the dashboard).
 */

const COOKIE_NAME = "timbre_session";

function base64urlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hasValidSession(token, secret) {
  if (!token || !secret) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(signature),
      new TextEncoder().encode(payload)
    );
    if (!valid) return false;

    const session = JSON.parse(new TextDecoder().decode(base64urlToBytes(payload)));
    return Boolean(session?.exp && session.exp > Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

export const config = { matcher: ["/", "/index.html"] };

export default async function middleware(request) {
  if (process.env.AUTH_REQUIRED !== "true") return;

  const secret = process.env.SESSION_SECRET?.trim() || "";
  /* Cannot verify without a secret: serve the app and let /api/me report the
     misconfiguration instead of locking the owner out of their own dashboard. */
  if (!secret) return;

  const cookie = request.headers.get("cookie") || "";
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  const token = entry ? decodeURIComponent(entry.slice(COOKIE_NAME.length + 1)) : "";

  if (await hasValidSession(token, secret)) return;

  const login = new URL("/login.html", request.url);
  login.searchParams.set("next", "/");
  return Response.redirect(login, 302);
}
