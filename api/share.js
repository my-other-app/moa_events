/**
 * GET /api/share?path=/events/{slug} — the page link-preview bots are sent
 * (vercel.json rewrites their requests for event and club addresses here).
 * People never see it: their browsers get the app.
 */
import { shareDocument } from "./_lib/share.js";

export default async function handler(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const path = url.searchParams.get("path") || req.query?.path || "/";
  const doc = await shareDocument(Array.isArray(path) ? path[0] : path);
  res.statusCode = doc.status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", doc.cache);
  res.setHeader("X-Robots-Tag", "all");
  res.end(doc.html);
}
