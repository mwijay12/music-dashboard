import { clearSessionCookie } from "../serverless/session.mjs";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }
  clearSessionCookie(req, res);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true });
}
