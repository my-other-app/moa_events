// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSitemap } from "./sitemap.js";

const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

describe("the sitemap", () => {
  it("lists the fixed pages, then every event and club by slug, with when they changed", () => {
    const xml = buildSitemap({
      events: [{ slug: "hack-night-04", updated_at: "2026-10-16T10:00:00Z" }, { slug: "hack-night-04" }, { slug: "../etc" }, null],
      clubs: [{ slug: "circuit-society", updated_at: "nope" }],
    });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')).toBe(true);
    expect(locs(xml)).toEqual([
      "https://myotherapp.in/",
      "https://myotherapp.in/events",
      "https://myotherapp.in/clubs",
      "https://myotherapp.in/threads",
      "https://myotherapp.in/events/hack-night-04",
      "https://myotherapp.in/clubs/circuit-society",
    ]);
    expect(xml).toContain("<lastmod>2026-10-16T10:00:00.000Z</lastmod>");
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml.trim().endsWith("</urlset>")).toBe(true);
  });

  it("still lists the fixed pages when the API gave nothing", () => {
    expect(locs(buildSitemap(null))).toHaveLength(4);
    expect(locs(buildSitemap({ events: "nope" }))).toHaveLength(4);
  });
});
