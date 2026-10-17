/**
 * sitemap.xml: the fixed pages, then every public event and club the API
 * lists. Slugs are checked and escaped; a bad row is skipped, not trusted.
 */
import { SITE_URL } from "./site.js";

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const STATIC = [
  ["/", "daily", "1.0"],
  ["/events", "daily", "0.9"],
  ["/clubs", "daily", "0.8"],
  ["/threads", "daily", "0.6"],
  ["/for-clubs", "weekly", "0.8"],
  ["/pricing", "weekly", "0.7"],
  ["/about", "monthly", "0.5"],
  ["/privacy", "yearly", "0.3"],
  ["/terms", "yearly", "0.3"],
];

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const lastmod = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** The XML for `data` ({events, clubs}: [{slug, updated_at}]); just the fixed pages when data is missing. */
export function buildSitemap(data, { siteUrl = SITE_URL } = {}) {
  const urls = STATIC.map(([path, changefreq, priority]) => ({ loc: `${siteUrl}${path}`, changefreq, priority }));
  const seen = new Set();
  const add = (prefix, rows, priority) => {
    for (const row of Array.isArray(rows) ? rows : []) {
      const slug = row && typeof row.slug === "string" ? row.slug.trim() : "";
      const key = `${prefix}/${slug}`;
      if (!SLUG.test(slug) || seen.has(key)) continue;
      seen.add(key);
      urls.push({ loc: `${siteUrl}${prefix}/${encodeURIComponent(slug)}`, lastmod: lastmod(row.updated_at), priority });
    }
  };
  add("/events", data?.events, "0.7");
  add("/clubs", data?.clubs, "0.6");
  const body = urls
    .map((u) =>
      [
        "  <url>",
        `    <loc>${xml(u.loc)}</loc>`,
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
        u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
        u.priority ? `    <priority>${u.priority}</priority>` : null,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
