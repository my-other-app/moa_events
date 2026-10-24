// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseXml, texts } from "@/test/xml";
import { entriesFor, indexEntries, parseSitemapName, sitemapIndexXml, staticEntries, urlsetXml } from "./sitemap";

describe("the sitemap's parts", () => {
  it("lists events and clubs by slug, each once, with when they changed, and skips what isn't a slug", () => {
    const events = entriesFor("events", [{ slug: "hack-night-04", updated_at: "2026-10-16T10:00:00+05:30" }, { slug: "hack-night-04" }, { slug: "../etc" }, null, { slug: "a&b" }]);
    const clubs = entriesFor("clubs", [{ slug: "circuit-society", updated_at: "nope" }]);
    expect(events).toEqual([{ loc: "https://myotherapp.in/events/hack-night-04", lastmod: "2026-10-16T04:30:00.000Z", priority: "0.7" }]);
    expect(clubs).toEqual([{ loc: "https://myotherapp.in/clubs/circuit-society", lastmod: null, priority: "0.6" }]);
  });

  it("writes a well-formed urlset, escaping what it must", () => {
    const xml = urlsetXml([...staticEntries(), { loc: "https://myotherapp.in/events/x?a=1&b=2", lastmod: "2026-10-16T04:30:00.000Z" }]);
    const doc = parseXml(xml);
    expect(doc.documentElement.tagName).toBe("urlset");
    expect(doc.documentElement.getAttribute("xmlns")).toBe("http://www.sitemaps.org/schemas/sitemap/0.9");
    expect(texts(doc, "loc")).toContain("https://myotherapp.in/events/x?a=1&b=2");
    expect(xml).toContain("<loc>https://myotherapp.in/events/x?a=1&amp;b=2</loc>");
    expect(texts(doc, "loc").slice(0, 3)).toEqual(["https://myotherapp.in/", "https://myotherapp.in/events", "https://myotherapp.in/clubs"]);
    // The fixed pages (/verify among them) and the one added.
    expect(texts(doc, "url")).toHaveLength(11);
    expect(texts(doc, "loc")).toContain("https://myotherapp.in/verify");
  });

  it("indexes one sitemap per page: the API's paged sitemap when it has one", () => {
    const paged = {
      paged: true,
      pageSize: 5000,
      pages: [
        { kind: "events", page: 1, entries: 5000, updated_at: "2026-10-16T10:00:00Z" },
        { kind: "events", page: 2, entries: 1234, updated_at: null },
        { kind: "clubs", page: 1, entries: 80, updated_at: "2026-10-01T00:00:00Z" },
        { kind: "clubs", page: 2, entries: 0, updated_at: null },
      ],
    };
    const doc = parseXml(sitemapIndexXml(indexEntries(paged)));
    expect(doc.documentElement.tagName).toBe("sitemapindex");
    expect(texts(doc, "loc")).toEqual([
      "https://myotherapp.in/sitemaps/pages.xml",
      "https://myotherapp.in/sitemaps/events-1.xml",
      "https://myotherapp.in/sitemaps/events-2.xml",
      "https://myotherapp.in/sitemaps/clubs-1.xml",
    ]);
    expect(texts(doc, "lastmod")).toEqual(["2026-10-16T10:00:00.000Z", "2026-10-01T00:00:00.000Z"]);
  });

  it("indexes the single list as one page of each when the API has no paging, and the fixed pages alone when it is down", () => {
    const legacy = { paged: false, events: [{ slug: "a", updated_at: "2026-10-01T00:00:00Z" }, { slug: "b", updated_at: "2026-10-05T00:00:00Z" }], clubs: [] };
    expect(indexEntries(legacy).map((e) => e.loc)).toEqual(["https://myotherapp.in/sitemaps/pages.xml", "https://myotherapp.in/sitemaps/events-1.xml"]);
    expect(indexEntries(legacy)[1].lastmod).toBe("2026-10-05T00:00:00.000Z");
    expect(indexEntries(null)).toEqual([{ loc: "https://myotherapp.in/sitemaps/pages.xml" }]);
  });

  it("reads a sitemap's name, and nothing else", () => {
    expect(parseSitemapName("pages.xml")).toEqual({ kind: "pages", page: 1 });
    expect(parseSitemapName("events-12.xml")).toEqual({ kind: "events", page: 12 });
    expect(parseSitemapName("clubs-1.xml")).toEqual({ kind: "clubs", page: 1 });
    for (const bad of ["events-0.xml", "events-1", "threads-1.xml", "events-01.xml", "../x.xml", ""]) expect(parseSitemapName(bad)).toBeNull();
  });
});
