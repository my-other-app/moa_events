/** GET /sitemap.xml (rewritten here by vercel.json): the fixed pages and every public event and club. */
import { buildSitemap } from "./_lib/sitemap.js";
import { CACHE, CACHE_SHORT, fetchJson } from "./_lib/site.js";

export default async function handler(req, res) {
  let data = null;
  try {
    ({ data } = await fetchJson("/api/v1/discover/sitemap", { timeoutMs: 8000 }));
  } catch {
    data = null;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", data ? CACHE : CACHE_SHORT);
  res.end(buildSitemap(data));
}
