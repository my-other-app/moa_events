// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildShareHtml, clip, routeFor, shareDocument } from "./share.js";
import { escapeHtml } from "./site.js";
import { fullEvent } from "../../src/test/eventFixture.js";

/** The value of one tag in a document, as a bot would read it. */
const tag = (html, attr, key) => {
  const m = html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`));
  return m ? m[1] : null;
};
const canonical = (html) => html.match(/<link rel="canonical" href="([^"]*)">/)?.[1];

describe("which addresses get a preview", () => {
  it.each([
    ["/events/hack-night-04", { kind: "event", ref: "hack-night-04" }],
    ["/events/hack-night-04/register", { kind: "event", ref: "hack-night-04" }],
    ["/events/hack-night-04?utm_source=wa", { kind: "event", ref: "hack-night-04" }],
    ["/123", { kind: "event", ref: "123" }],
    ["/hack-night-04", { kind: "event", ref: "hack-night-04" }],
    ["/123/live", { kind: "event", ref: "123" }],
    ["/123/compete", { kind: "event", ref: "123" }],
    ["/register/123", { kind: "event", ref: "123" }],
    ["/clubs/circuit-society", { kind: "club", slug: "circuit-society" }],
    ["/", { kind: "page", key: "home" }],
    ["/events", { kind: "page", key: "events" }],
    ["/clubs", { kind: "page", key: "clubs" }],
    ["/threads", { kind: "page", key: "threads" }],
  ])("%s", (path, route) => {
    expect(routeFor(path)).toEqual(route);
  });

  it.each(["/tickets/abc", "/play/123", "/123/other", "/a/b/c", "/events/x/y/z", "/events/x/unknown", "/clubs/x/y", "/bad.ref", "/%E0%A4%A", "/threads/12"])("%s is not one", (path) => {
    expect(routeFor(path)).toBeNull();
  });
});

describe("the preview page", () => {
  it("escapes every value it writes", () => {
    const html = buildShareHtml({
      title: `"><script>alert(1)</script>`,
      description: "Tom & Jerry's <b>night</b>",
      image: "https://cdn.example/p.jpg?a=1&b=2",
      url: "https://myotherapp.in/events/x",
      lines: ["<img src=x onerror=alert(1)>"],
      body: "Line <one>\n\nLine & two",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>night</b>");
    expect(tag(html, "property", "og:title")).toBe("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(tag(html, "property", "og:description")).toBe("Tom &amp; Jerry&#39;s &lt;b&gt;night&lt;/b&gt;");
    expect(tag(html, "property", "og:image")).toBe("https://cdn.example/p.jpg?a=1&amp;b=2");
    expect(html).toContain("<p>Line &lt;one&gt;</p>");
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("describes an event: its tags, a large card, the canonical address, and a link people can follow", async () => {
    const fetch = vi.fn(async () => ({ status: 200, data: fullEvent() }));
    const doc = await shareDocument("/123?ref=abc", { fetch });
    expect(fetch).toHaveBeenCalledWith("/api/v1/discover/events/123");
    expect(doc.status).toBe(200);
    expect(doc.cache).toBe("public, s-maxage=600, stale-while-revalidate=86400");
    const html = doc.html;
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>Hack Night 04 · MyOtherApp</title>");
    expect(tag(html, "property", "og:title")).toBe("Hack Night 04");
    expect(tag(html, "property", "og:url")).toBe("https://myotherapp.in/events/hack-night-04");
    expect(canonical(html)).toBe("https://myotherapp.in/events/hack-night-04");
    expect(tag(html, "property", "og:image")).toBe("https://cdn.example/p-m.jpg");
    expect(tag(html, "property", "og:type")).toBe("website");
    expect(tag(html, "name", "twitter:card")).toBe("summary_large_image");
    expect(tag(html, "property", "og:description")).toMatch(/^Sun, 18 Oct · 6:00 PM IST · Lab 3B, COEP · ₹250\. Twenty-four hours of building\./);
    expect(html).toContain('<a href="https://myotherapp.in/events/hack-night-04">Register for Hack Night 04 on MyOtherApp</a>');
    // The about's "<script>" is text, and the JSON-LD can't be closed early.
    expect(html.match(/<script/g)).toHaveLength(1);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]);
    expect(ld).toMatchObject({ "@type": "Event", name: "Hack Night 04", offers: { price: 250, priceCurrency: "INR" } });
  });

  it("uses the default picture for an event without a poster", async () => {
    const page = fullEvent();
    const doc = await shareDocument("/events/hack-night-04", { fetch: async () => ({ status: 200, data: { ...page, event: { ...page.event, poster: null, poster_thumb: null } } }) });
    expect(tag(doc.html, "property", "og:image")).toBe("https://myotherapp.in/og-default.png");
  });

  it("describes a club with its cover and tagline", async () => {
    const fetch = vi.fn(async () => ({ status: 200, data: { club: { name: "Circuit Society", slug: "circuit-society", tagline: "We build things that blink", cover: { original: "https://cdn.example/c.jpg" } } } }));
    const doc = await shareDocument("/clubs/circuit-society", { fetch });
    expect(fetch).toHaveBeenCalledWith("/api/v1/discover/clubs/circuit-society");
    expect(tag(doc.html, "property", "og:title")).toBe("Circuit Society");
    expect(tag(doc.html, "property", "og:description")).toBe("We build things that blink");
    expect(tag(doc.html, "property", "og:image")).toBe("https://cdn.example/c.jpg");
    expect(canonical(doc.html)).toBe("https://myotherapp.in/clubs/circuit-society");
  });

  it("falls back to the site's own tags when the API fails or the event isn't public", async () => {
    const down = await shareDocument("/events/x", { fetch: async () => Promise.reject(new Error("timeout")) });
    expect(down.status).toBe(200);
    expect(down.cache).toBe("public, s-maxage=60, stale-while-revalidate=600");
    expect(tag(down.html, "property", "og:title")).toBe("MyOtherApp · Events and clubs near you");
    expect(tag(down.html, "property", "og:image")).toBe("https://myotherapp.in/og-default.png");

    const gone = await shareDocument("/events/x", { fetch: async () => ({ status: 404, data: null }) });
    expect(gone.status).toBe(404);

    const other = await shareDocument("/tickets/abc", { fetch: vi.fn() });
    expect(tag(other.html, "property", "og:url")).toBe("https://myotherapp.in/");
    const events = await shareDocument("/events", { fetch: vi.fn() });
    expect(tag(events.html, "property", "og:title")).toBe("Find events · MyOtherApp");
  });

  it("cuts descriptions at a word", () => {
    expect(clip("a ".repeat(200), 20).length).toBeLessThanOrEqual(20);
    expect(clip("short")).toBe("short");
  });
});
