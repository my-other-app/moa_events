// @vitest-environment node
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { BOT_PAGES, isBot } from "@/seo/bots";

/*
 * Which file answers which address, by Next's file routing (a static folder
 * beats [param], which beats [...rest]; _private folders are not routes),
 * after next.config's redirects and rewrites. Every address the old app
 * answered must still be answered, by the right kind of page.
 */
const APP = join(process.cwd(), "src/app");
const ENTRY = /^(page|route)\.(js|jsx)$/;

function tree(dir) {
  const node = { files: [], dirs: {} };
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name.startsWith("_")) continue;
      node.dirs[name] = tree(p);
    } else if (ENTRY.test(name)) node.files.push(relative(APP, p));
  }
  return node;
}

const ROOT = tree(APP);

function match(node, segs) {
  if (!segs.length) return node.files[0] ? { file: node.files[0] } : null;
  const [head, ...rest] = segs;
  const names = Object.keys(node.dirs);
  if (node.dirs[head]) {
    const hit = match(node.dirs[head], rest);
    if (hit) return hit;
  }
  for (const n of names.filter((n) => /^\[[^.]/.test(n))) {
    const hit = match(node.dirs[n], rest);
    if (hit) return hit;
  }
  for (const n of names.filter((n) => n.startsWith("[..."))) {
    if (node.dirs[n].files[0]) return { file: node.dirs[n].files[0] };
  }
  return null;
}

const compile = (source) => new RegExp(`^${source.replace(/:(\w+)\(([^)]+)\)/g, "($2)").replace(/:(\w+)/g, "([^/]+)")}$`);

async function resolve(url, { ua = "Mozilla/5.0" } = {}) {
  let path = url.split("?")[0];
  for (const r of await nextConfig.redirects()) {
    if (compile(r.source).test(path)) return { redirect: r.destination, permanent: r.permanent };
  }
  const { beforeFiles } = await nextConfig.rewrites();
  for (const r of beforeFiles) {
    const m = compile(r.source).exec(path);
    if (!m) continue;
    if (r.has && !r.has.every((h) => h.type === "header" && new RegExp(`^${h.value}$`).test(ua))) continue;
    if (r.destination.startsWith("/api/share/")) {
      // The bot's page goes to /api/share/{the same path}.
      let i = 0;
      return { file: "api/share/[...path]/route.js", share: true, to: r.destination.replace(/:\w+/g, () => m[++i]) };
    }
    path = r.destination.replace(/:(\w+)/g, () => m[1]);
  }
  const hit = match(ROOT, path.split("/").filter(Boolean));
  return hit || { file: null };
}

const BOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const WHATSAPP = "WhatsApp/2.23.20.0";

describe("which file answers which address", () => {
  it.each([
    ["/", "page.jsx"],
    ["/events", "events/page.jsx"],
    ["/events/hack-night-04", "events/[slug]/page.jsx"],
    ["/events/hack-night-04/register", "events/[slug]/register/page.jsx"],
    ["/events/hack-night-04/live", "events/[slug]/live/page.jsx"],
    ["/events/hack-night-04/compete", "events/[slug]/compete/page.jsx"],
    ["/events/rss.xml", "events/rss.xml/route.js"],
    ["/clubs", "clubs/page.jsx"],
    ["/clubs/circuit-society", "clubs/[slug]/page.jsx"],
    ["/clubs/circuit-society/rss.xml", "clubs/[slug]/rss.xml/route.js"],
    ["/threads", "threads/page.jsx"],
    ["/threads/42", "threads/[id]/page.jsx"],
    ["/about", "about/page.jsx"],
    ["/for-clubs", "for-clubs/page.jsx"],
    ["/pricing", "pricing/page.jsx"],
    ["/privacy", "privacy/page.jsx"],
    ["/terms", "terms/page.jsx"],
    ["/me/tickets", "me/tickets/page.jsx"],
    ["/me/following", "me/following/page.jsx"],
    ["/play/123", "play/[eventId]/page.jsx"],
    ["/feedback/123/456", "feedback/[eventId]/[registrationId]/page.jsx"],
    ["/tickets/abc-123", "tickets/[ticketid]/page.jsx"],
    ["/certificates/abc-123", "certificates/[ticketid]/page.jsx"],
    ["/sitemap.xml", "sitemap.xml/route.js"],
    ["/sitemaps/events-1.xml", "sitemaps/[name]/route.js"],
    ["/robots.txt", null],
    ["/media/events/hack-night-04/poster", "media/[...path]/route.jsx"],
    ["/og/events/hack-night-04", "og/events/[slug]/route.jsx"],
    ["/og/clubs/circuit-society", "og/clubs/[slug]/route.jsx"],
  ])("%s → %s", async (url, file) => {
    if (file === null) return; // robots.txt is Next's own metadata route (src/app/robots.js)
    expect((await resolve(url)).file).toBe(file);
  });

  it.each([
    ["/123", "[ref]/page.jsx"],
    ["/hack-night-04?ref=abc", "[ref]/page.jsx"],
    ["/123/live", "[ref]/live/page.jsx"],
    ["/123/compete", "[ref]/compete/page.jsx"],
    ["/register/123", "register/[ref]/page.jsx"],
    // An id under /events is handed to the old-address page, which keeps the query.
    ["/events/123", "[ref]/page.jsx"],
  ])("the old address %s → %s (a 308 to the event)", async (url, file) => {
    expect((await resolve(url)).file).toBe(file);
  });

  it("never takes the site's own words for an old event address", async () => {
    for (const word of ["/events", "/clubs", "/threads", "/about", "/for-clubs", "/pricing", "/privacy", "/terms"]) {
      expect((await resolve(word)).file).not.toMatch(/^\[ref\]/);
    }
  });

  it("sends /me to the tickets, for now", async () => {
    expect(await resolve("/me")).toEqual({ redirect: "/me/tickets", permanent: false });
  });

  it("has no route for deeper nonsense (the 404 page answers)", async () => {
    expect((await resolve("/a/b/c")).file).toBeNull();
    expect((await resolve("/events/x/y/z")).file).toBeNull();
  });
});

describe("what link-preview bots get", () => {
  it("is the real page for the server-rendered ones", async () => {
    for (const url of ["/events/hack-night-04", "/clubs/circuit-society", "/123", "/register/123", "/123/live", "/", "/events", "/clubs", "/threads", "/threads/42", "/about", "/privacy", "/terms", "/for-clubs", "/pricing"]) {
      expect((await resolve(url, { ua: BOT })).share).toBeUndefined();
      expect((await resolve(url, { ua: WHATSAPP })).share).toBeUndefined();
    }
  });

  it("is the small preview page for the ones still drawn in the browser", async () => {
    for (const url of ["/events/hack-night-04/register"]) {
      expect(await resolve(url, { ua: BOT })).toEqual({ file: "api/share/[...path]/route.js", share: true, to: `/api/share${url}` });
      expect((await resolve(url)).share).toBeUndefined();
    }
    expect(BOT_PAGES.map((p) => p.source)).not.toContain("/events/:slug");
    expect(isBot(BOT)).toBe(true);
    expect(isBot(WHATSAPP)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(false);
  });
});
