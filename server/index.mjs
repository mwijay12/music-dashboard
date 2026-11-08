import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import { OAuth2Client } from "google-auth-library";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 8130);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || "";
const AUTH_REQUIRED = process.env.AUTH_REQUIRED === "true";
const COOKIE_SECURE = BASE_URL.startsWith("https://");
const SESSION_COOKIE = "timbre_session";
const USERS_FILE = path.join(ROOT, "data", "users.json");
const SECRET_FILE = path.join(ROOT, "data", ".session-secret");

const STATIC_FILES = new Set([
  "index.html",
  "login.html",
  "app.js",
  "boot.js",
  "auth.js",
  "auth.css",
  "styles.css",
  "bundle.js",
  "globe-dist/globe-island.js",
  "globe-dist/globe-island.css",
  "vendor/gsap.min.js",
  "vendor/three.module.js",
  "data/live.json",
]);

async function loadSessionSecret() {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;

  try {
    const existing = (await fs.readFile(SECRET_FILE, "utf8")).trim();
    if (existing) return existing;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const secret = crypto.randomBytes(32).toString("hex");
  await fs.mkdir(path.dirname(SECRET_FILE), { recursive: true });
  await fs.writeFile(SECRET_FILE, secret, { encoding: "utf8", mode: 0o600 });
  return secret;
}

async function readUsers() {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") return { users: [] };
    throw error;
  }
}

async function writeUsers(db) {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  const temp = `${USERS_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await fs.rename(temp, USERS_FILE);
}

let userWriteQueue = Promise.resolve();

function updateUsers(mutator) {
  const next = userWriteQueue.then(async () => {
    const db = await readUsers();
    const result = await mutator(db);
    await writeUsers(db);
    return result;
  });
  userWriteQueue = next.catch(() => {});
  return next;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    loginCount: user.loginCount,
  };
}

function upsertGoogleUser(profile) {
  return updateUsers((db) => {
    const now = new Date().toISOString();
    let user = db.users.find((candidate) => candidate.googleSub === profile.sub);

    if (user) {
      user.name = profile.name || user.name;
      user.email = profile.email;
      user.picture = profile.picture || user.picture || null;
      user.lastLoginAt = now;
      user.loginCount = (user.loginCount || 0) + 1;
    } else {
      user = {
        id: crypto.randomUUID(),
        googleSub: profile.sub,
        name: profile.name,
        email: profile.email,
        picture: profile.picture,
        createdAt: now,
        lastLoginAt: now,
        loginCount: 1,
      };
      db.users.push(user);
    }

    return publicUser(user);
  });
}

async function findUserById(id) {
  if (!id) return null;
  const db = await readUsers();
  return db.users.find((candidate) => candidate.id === id) || null;
}

async function currentUser(req) {
  const userId = req.signedCookies?.[SESSION_COOKIE];
  return findUserById(userId);
}

function setSessionCookie(res, userId) {
  res.cookie(SESSION_COOKIE, userId, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
  });
}

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

async function verifyGoogleCredential(credential) {
  if (!googleClient) throw new Error("Google sign-in is not configured");

  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const validIssuer =
    payload?.iss === "https://accounts.google.com" || payload?.iss === "accounts.google.com";

  if (!payload?.sub || !payload.email || payload.email_verified !== true || !validIssuer) {
    throw new Error("Google account could not be verified");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name?.trim() || payload.email.split("@")[0],
    picture: payload.picture || null,
  };
}

const SESSION_SECRET = await loadSessionSecret();
const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser(SESSION_SECRET));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, authRequired: AUTH_REQUIRED, googleConfigured: Boolean(GOOGLE_CLIENT_ID) });
});

app.get("/api/snapshot", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const remote = process.env.LIVE_SNAPSHOT_URL?.trim();

  if (!remote) {
    try {
      const raw = await fs.readFile(path.join(ROOT, "data", "live.json"), "utf8");
      return res.type("application/json").send(raw);
    } catch {
      return res.status(404).json({ error: "No snapshot has been generated yet." });
    }
  }

  try {
    const response = await fetch(remote, {
      signal: AbortSignal.timeout(5000),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return res.status(502).json({ error: `Snapshot source responded ${response.status}.` });
    }
    return res.type("application/json").send(await response.text());
  } catch {
    return res.status(502).json({ error: "Snapshot source unreachable." });
  }
});

app.get("/api/config", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
    googleConfigured: Boolean(GOOGLE_CLIENT_ID),
    authRequired: AUTH_REQUIRED,
    youtubeConnectReady: Boolean(GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    baseUrl: BASE_URL,
  });
});

app.get("/api/me", async (req, res, next) => {
  try {
    const user = await currentUser(req);
    res.set("Cache-Control", "no-store");
    res.json({
      authenticated: Boolean(user),
      user: user ? publicUser(user) : null,
      authRequired: AUTH_REQUIRED,
      googleConfigured: Boolean(GOOGLE_CLIENT_ID),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/google", async (req, res) => {
  const credential = typeof req.body?.credential === "string" ? req.body.credential : "";

  if (!credential) {
    return res.status(400).json({ error: "Missing Google credential." });
  }
  if (!GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: "Google sign-in is not configured." });
  }

  try {
    const profile = await verifyGoogleCredential(credential);
    const user = await upsertGoogleUser(profile);
    setSessionCookie(res, user.id);
    res.json({ ok: true, user });
  } catch (error) {
    console.warn("Google sign-in rejected:", error instanceof Error ? error.message : "unknown error");
    res.status(401).json({ error: "Google sign-in could not be verified." });
  }
});

app.post("/api/logout", async (req, res, next) => {
  try {
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/login", (req, res) => {
  res.redirect(302, "/login.html");
});

app.get(["/", "/index.html"], async (req, res, next) => {
  try {
    const user = await currentUser(req);
    if (AUTH_REQUIRED && !user) {
      return res.redirect(302, "/login.html?next=%2F");
    }
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(ROOT, "index.html"));
  } catch (error) {
    next(error);
  }
});

app.get("/login.html", async (req, res, next) => {
  try {
    const user = await currentUser(req);
    if (user) return res.redirect(302, "/");
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(ROOT, "login.html"));
  } catch (error) {
    next(error);
  }
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.use(async (req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  try {
    const requested = decodeURIComponent(req.path || "").replace(/^\/+/, "");

    if (!STATIC_FILES.has(requested)) {
      return res.status(404).type("text").send("Not found");
    }

    const file = path.resolve(ROOT, requested);
    if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) {
      return res.status(403).type("text").send("Forbidden");
    }

    if (requested === "data/live.json" || requested.endsWith(".html")) {
      res.set("Cache-Control", "no-store");
    } else {
      res.set("Cache-Control", "public, max-age=300");
    }

    return res.sendFile(file);
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).type("text").send("Not found");
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Timbre server on ${BASE_URL}`);
  console.log(`Google sign-in: ${GOOGLE_CLIENT_ID ? "configured" : "not configured"}`);
  console.log(`Auth gate: ${AUTH_REQUIRED ? "required" : "demo mode"}`);
});
