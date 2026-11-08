import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveBenchmark } from "../serverless/benchmark/sources.mjs";

const DIGEST_FILE = path.join(process.cwd(), "data", "audiomack-digest.json");
const CACHE_TTL_MS = 10 * 60;
const cache = new Map();

async function loadDigest() {
  const remote = process.env.DIGEST_URL;
  if (remote) {
    try {
      const response = await fetch(remote, {
        headers: {
          accept: "application/json",
          ...(process.env.DIGEST_TOKEN ? { authorization: `Bearer ${process.env.DIGEST_TOKEN}` } : {}),
        },
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) return await response.json();
    } catch {
      /* fall through to the bundled copy */
    }
  }
  try {
    return JSON.parse(await readFile(DIGEST_FILE, "utf8"));
  } catch {
    return null;
  }
}

export default async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const artist = (url.searchParams.get("artist") || url.searchParams.get("q") || "").trim();
  if (!artist) {
    response.status(400).json({ error: "Pass ?artist=<name> to look up an artist.", configured: true });
    return;
  }
  if (artist.length > 120) {
    response.status(400).json({ error: "Artist name is too long." });
    return;
  }

  const key = artist.toLowerCase();
  const fresh = ["1", "true"].includes(url.searchParams.get("fresh") || "");
  const cached = cache.get(key);
  if (!fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    response.setHeader("X-Benchmark-Cache", "hit");
    response.setHeader("Cache-Control", "public, max-age=300");
    response.status(200).json(cached.payload);
    return;
  }

  const digest = await loadDigest();
  const payload = await resolveBenchmark({ artist, digest });

  if (payload.configured !== false) {
    cache.set(key, { at: Date.now(), payload });
    response.setHeader("X-Benchmark-Cache", "miss");
    response.setHeader("Cache-Control", "public, max-age=300");
  } else {
    response.setHeader("Cache-Control", "no-store");
  }

  response.status(200).json(payload);
}
