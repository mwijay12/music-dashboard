/**
 * Optional live-data proxy.
 *
 * Set LIVE_SNAPSHOT_URL to any JSON endpoint that returns the PublicSnapshot
 * shape (see pipeline/src/types.ts) — a Firebase Storage object, a Firestore
 * REST document, a GitHub raw file, or your own ingest endpoint. When it is
 * unset, the dashboard falls back to the bundled data/live.json.
 */

const CACHE_MS = 60_000;
let cache = { at: 0, body: null };

export default async function handler(req, res) {
  const source = process.env.LIVE_SNAPSHOT_URL?.trim();
  res.setHeader("Cache-Control", "no-store");

  if (!source) {
    return res.status(404).json({ error: "LIVE_SNAPSHOT_URL is not configured." });
  }

  if (cache.body && Date.now() - cache.at < CACHE_MS) {
    res.setHeader("X-Snapshot-Cache", "hit");
    return res.status(200).json(cache.body);
  }

  try {
    const response = await fetch(source, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return res.status(502).json({ error: `Snapshot source responded ${response.status}.` });
    }
    const body = await response.json();
    if (body?.schemaVersion !== 1 || !Array.isArray(body.artists)) {
      return res.status(502).json({ error: "Snapshot source returned an unexpected payload." });
    }
    cache = { at: Date.now(), body };
    res.setHeader("X-Snapshot-Cache", "miss");
    return res.status(200).json(body);
  } catch {
    return res.status(502).json({ error: "Snapshot source unreachable." });
  }
}
