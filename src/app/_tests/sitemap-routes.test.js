// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/next";
import { parseXml, texts } from "@/test/xml";

/*
 * /sitemap.xml and /sitemaps/*.xml against the two APIs: today's (one list
 * of at most 5,000 of each, no /sitemap/index) and the paged one
 * (perf/discover-scale-2: /sitemap/index and /sitemap/{kind}/{n}).
 */
const legacyApi = () =>
  fakeFetch({
    "/api/v1/discover/sitemap/index": { status: 404, body: { detail: "Not Found" } },
    "/api/v1/discover/sitemap": {
      body: { events: [{ slug: "hack-night-04", updated_at: "2026-10-16T10:00:00+05:30" }, { slug: "bad slug" }], clubs: [{ slug: "circuit-society", updated_at: null }] },
    },
  });

const pagedApi = () =>
  fakeFetch((url) => {
    if (url.pathname === "/api/v1/discover/sitemap/index") {
      return {
        body: {
          page_size: 5000,
          pages: [
            { kind: "events", page: 1, entries: 5000, updated_at: "2026-10-16T10:00:00Z" },
            { kind: "events", page: 2, entries: 17, updated_at: "2026-10-17T10:00:00Z" },
            { kind: "clubs", page: 1, entries: 2, updated_at: null },
          ],
        },
      };
    }
    const m = /^\/api\/v1\/discover\/sitemap\/(events|clubs)\/(\d+)$/.exec(url.pathname);
    if (m && m[1] === "events" && m[2] === "2") return { body: { kind: "events", page: 2, pages: 2, items: [{ slug: "e-5001", updated_at: "2026-10-17T10:00:00Z" }, { slug: "e-5002" }] } };
    return { status: 404, body: { detail: "Not Found" } };
  });

afterEach(() => vi.unstubAllGlobals());

const index = async () => (await import("../sitemap.xml/route.js")).GET();
const page = async (name) => (await import("../sitemaps/[name]/route.js")).GET(new Request(`https://myotherapp.in/sitemaps/${name}`), { params: Promise.resolve({ name }) });

describe("the sitemap index", () => {
  it("lists one sitemap of each kind from today's API", async () => {
    vi.stubGlobal("fetch", legacyApi());
    const res = await index();
    expect(res.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=600/);
    const doc = parseXml(await res.text());
    expect(texts(doc, "loc")).toEqual(["https://myotherapp.in/sitemaps/pages.xml", "https://myotherapp.in/sitemaps/events-1.xml", "https://myotherapp.in/sitemaps/clubs-1.xml"]);
  });

  it("lists every page the paged API has, as soon as it has them", async () => {
    const api = pagedApi();
    vi.stubGlobal("fetch", api);
    const doc = parseXml(await (await index()).text());
    expect(texts(doc, "loc")).toEqual([
      "https://myotherapp.in/sitemaps/pages.xml",
      "https://myotherapp.in/sitemaps/events-1.xml",
      "https://myotherapp.in/sitemaps/events-2.xml",
      "https://myotherapp.in/sitemaps/clubs-1.xml",
    ]);
    // Never the whole list when the index is there (the topics are asked about alongside).
    expect(api.calls.map((c) => new URL(c.url).pathname).filter((p) => p.startsWith("/api/v1/discover/"))).toEqual(["/api/v1/discover/sitemap/index"]);
  });

  it("still lists the fixed pages, briefly cached, when the API is down", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => new TypeError("fetch failed")));
    const res = await index();
    expect(texts(parseXml(await res.text()), "loc")).toEqual(["https://myotherapp.in/sitemaps/pages.xml"]);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
  });
});

describe("one sitemap", () => {
  it("lists the fixed pages", async () => {
    vi.stubGlobal("fetch", legacyApi());
    expect(texts(parseXml(await (await page("pages.xml")).text()), "loc")).toContain("https://myotherapp.in/for-clubs");
  });

  it("lists events and clubs from today's API, skipping bad rows; page 2 doesn't exist there", async () => {
    vi.stubGlobal("fetch", legacyApi());
    const events = parseXml(await (await page("events-1.xml")).text());
    expect(texts(events, "loc")).toEqual(["https://myotherapp.in/events/hack-night-04"]);
    expect(texts(events, "lastmod")).toEqual(["2026-10-16T04:30:00.000Z"]);
    expect(texts(parseXml(await (await page("clubs-1.xml")).text()), "loc")).toEqual(["https://myotherapp.in/clubs/circuit-society"]);
    expect((await page("events-2.xml")).status).toBe(404);
    expect((await page("nonsense.xml")).status).toBe(404);
  });

  it("reads a page of the paged API, and 404s past the last", async () => {
    vi.stubGlobal("fetch", pagedApi());
    const doc = parseXml(await (await page("events-2.xml")).text());
    expect(texts(doc, "loc")).toEqual(["https://myotherapp.in/events/e-5001", "https://myotherapp.in/events/e-5002"]);
    expect((await page("events-3.xml")).status).toBe(404);
  });
});

describe("robots.txt", () => {
  it("opens the site and its feeds, keeps out a person's pages, the API and the flows' steps, and names the sitemap", async () => {
    const robots = (await import("../robots.js")).default();
    expect(robots.sitemap).toBe("https://myotherapp.in/sitemap.xml");
    const [rule] = robots.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toEqual(expect.arrayContaining(["/", "/events/rss.xml", "/clubs/*/rss.xml"]));
    expect(rule.disallow).toEqual(expect.arrayContaining(["/api/", "/me$", "/me/", "/register/", "/events/*/register", "/events/*/live", "/events/*/compete", "/tickets/", "/certificates/"]));
    // An old event address that starts with "me" (/meetup-2025) is not caught by /me.
    expect(rule.disallow).not.toContain("/me");
  });
});
