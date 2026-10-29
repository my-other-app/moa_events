/**
 * The sitemap, built to grow to lakhs of events and clubs: /sitemap.xml is
 * an index of smaller sitemaps of at most 5,000 addresses each,
 *
 *   /sitemaps/pages.xml        the site's fixed pages
 *   /sitemaps/topics.xml       /topics and every topic's page (only when the API has topics)
 *   /sitemaps/cities.xml       the city pages worth indexing (/events/in/{city}, /clubs/in/{city}, the hub;
 *                              only while there are some)
 *   /sitemaps/events-{n}.xml   public events, page n
 *   /sitemaps/clubs-{n}.xml    public clubs, page n
 *
 * read from the API's paged sitemap (GET /discover/sitemap/index and
 * /discover/sitemap/{kind}/{n}) when it has one, else from the single
 * GET /discover/sitemap (at most 5,000 of each: one page of each kind).
 * Pure: the route handlers fetch, these write the XML. Slugs are checked
 * and escaped; a bad row is skipped, never trusted.
 */
import { SITE_URL } from "@/config";
import { w3c } from "./time";

export const PAGE_SIZE = 5000;

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export const STATIC_PAGES = [
  ["/", "daily", "1.0"],
  ["/events", "daily", "0.9"],
  ["/clubs", "daily", "0.8"],
  ["/threads", "daily", "0.6"],
  ["/for-clubs", "weekly", "0.8"],
  ["/pricing", "weekly", "0.7"],
  ["/about", "monthly", "0.5"],
  // The certificate check; its results (/verify/{number}) are never listed.
  ["/verify", "monthly", "0.5"],
  // Help: the App Store's Support URL, and Google Play's account-deletion page (/support#delete-account).
  ["/support", "monthly", "0.4"],
  ["/privacy", "yearly", "0.3"],
  ["/terms", "yearly", "0.3"],
];

export const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const PREFIX = { events: "/events", clubs: "/clubs" };
const PRIORITY = { events: "0.7", clubs: "0.6" };

/** The addresses for rows of {slug, updated_at}: each slug once, bad ones and those `skip` says (demo content) left out. */
export function entriesFor(kind, rows, { siteUrl = SITE_URL, skip = () => false } = {}) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const slug = row && typeof row.slug === "string" ? row.slug.trim() : "";
    if (!SLUG.test(slug) || seen.has(slug) || skip(row)) continue;
    seen.add(slug);
    out.push({ loc: `${siteUrl}${PREFIX[kind]}/${encodeURIComponent(slug)}`, lastmod: w3c(row.updated_at), priority: PRIORITY[kind] });
  }
  return out;
}

/** /topics and each topic's page ({slug}s, from the topics list), each once, bad slugs left out. */
export function topicEntries(topics, { siteUrl = SITE_URL } = {}) {
  const seen = new Set();
  const rows = [];
  for (const t of Array.isArray(topics) ? topics : []) {
    const slug = t && typeof t.slug === "string" ? t.slug.trim() : "";
    if (!SLUG.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    rows.push({ loc: `${siteUrl}/topics/${encodeURIComponent(slug)}`, changefreq: "daily", priority: "0.7" });
  }
  return rows.length ? [{ loc: `${siteUrl}/topics`, changefreq: "daily", priority: "0.8" }, ...rows] : [];
}

export const staticEntries = ({ siteUrl = SITE_URL } = {}) => STATIC_PAGES.map(([path, changefreq, priority]) => ({ loc: `${siteUrl}${path}`, changefreq, priority }));

/** A <urlset> of {loc, lastmod?, changefreq?, priority?}. */
export function urlsetXml(entries) {
  const body = entries
    .map((u) =>
      [
        "  <url>",
        `    <loc>${xml(u.loc)}</loc>`,
        u.lastmod ? `    <lastmod>${xml(u.lastmod)}</lastmod>` : null,
        u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : null,
        u.priority ? `    <priority>${u.priority}</priority>` : null,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}${body ? "\n" : ""}</urlset>\n`;
}

/** A <sitemapindex> of {loc, lastmod?}. */
export function sitemapIndexXml(entries) {
  const body = entries
    .map((s) => ["  <sitemap>", `    <loc>${xml(s.loc)}</loc>`, s.lastmod ? `    <lastmod>${xml(s.lastmod)}</lastmod>` : null, "  </sitemap>"].filter(Boolean).join("\n"))
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}${body ? "\n" : ""}</sitemapindex>\n`;
}

const newest = (rows) => rows.map((r) => r?.updated_at).filter(Boolean).sort().pop() || null;

/**
 * The index's entries for a sitemap source (src/server/discover.js's
 * getSitemapSource): the fixed pages, the topics (`topics`: true when the
 * API has some), the cities (`cities`: true when a city page is worth
 * indexing), then every page of events and clubs. Null source (the API
 * is down): the fixed pages (and the topics) only.
 */
export function indexEntries(source, { siteUrl = SITE_URL, topics = false, cities = false } = {}) {
  const out = [{ loc: `${siteUrl}/sitemaps/pages.xml` }];
  if (topics) out.push({ loc: `${siteUrl}/sitemaps/topics.xml` });
  if (cities) out.push({ loc: `${siteUrl}/sitemaps/cities.xml` });
  if (!source) return out;
  if (source.paged) {
    for (const p of source.pages) {
      if (p.entries > 0) out.push({ loc: `${siteUrl}/sitemaps/${p.kind}-${p.page}.xml`, lastmod: w3c(p.updated_at) });
    }
    return out;
  }
  for (const kind of ["events", "clubs"]) {
    const rows = source[kind] || [];
    if (rows.length) out.push({ loc: `${siteUrl}/sitemaps/${kind}-1.xml`, lastmod: w3c(newest(rows)) });
  }
  return out;
}

/** "events-3.xml" → {kind: "events", page: 3}; "pages.xml", "topics.xml", "cities.xml" → {kind}; anything else → null. */
export function parseSitemapName(name) {
  const s = decodeURIComponent(String(name || ""));
  if (s === "pages.xml") return { kind: "pages", page: 1 };
  if (s === "topics.xml") return { kind: "topics", page: 1 };
  if (s === "cities.xml") return { kind: "cities", page: 1 };
  const m = /^(events|clubs)-([1-9]\d{0,5})\.xml$/.exec(s);
  return m ? { kind: m[1], page: Number(m[2]) } : null;
}
