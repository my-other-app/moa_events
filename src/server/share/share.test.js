// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildShareHtml, clip, routeFor, shareDocument } from "./share.js";
import { escapeHtml } from "./site.js";
import { fullEvent } from "@/test/eventFixture";
import { plansResponse } from "@/test/plansFixture";

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
    ["/about", { kind: "page", key: "about" }],
    ["/privacy?utm_source=x", { kind: "page", key: "privacy" }],
    ["/terms", { kind: "page", key: "terms" }],
    ["/for-clubs", { kind: "page", key: "for-clubs" }],
    ["/pricing?utm_source=wa#compare", { kind: "page", key: "pricing" }],
  ])("%s", (path, route) => {
    expect(routeFor(path)).toEqual(route);
  });

  it.each(["/tickets/abc", "/play/123", "/123/other", "/a/b/c", "/events/x/y/z", "/events/x/unknown", "/clubs/x/y", "/bad.ref", "/%E0%A4%A", "/threads/12", "/about/x", "/terms/live", "/for-clubs/x", "/pricing/live"])("%s is not one", (path) => {
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
    // The share picture is the site's own, never the poster's presigned S3 link (it dies within the hour).
    expect(tag(html, "property", "og:image")).toMatch(/^https:\/\/myotherapp\.in\/og\/events\/hack-night-04\?v=[a-z0-9]+$/);
    expect(tag(html, "property", "og:type")).toBe("website");
    expect(tag(html, "name", "twitter:card")).toBe("summary_large_image");
    expect(tag(html, "property", "og:description")).toMatch(/^Sun, 18 Oct · 6:00 PM IST · Lab 3B, COEP · ₹250\. Twenty-four hours of building\./);
    expect(html).toContain('<a href="https://myotherapp.in/events/hack-night-04">Register for Hack Night 04 on MyOtherApp</a>');
    // The about's "<script>" is text, and the JSON-LD can't be closed early.
    expect(html.match(/<script/g)).toHaveLength(1);
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]);
    expect(ld).toMatchObject({ "@type": "Event", name: "Hack Night 04", offers: { price: 250, priceCurrency: "INR" } });
  });

  it("gives an event without a poster its share picture too (the drawn cover), under a different version", async () => {
    const page = fullEvent();
    const withPoster = await shareDocument("/events/hack-night-04", { fetch: async () => ({ status: 200, data: page }) });
    const without = await shareDocument("/events/hack-night-04", { fetch: async () => ({ status: 200, data: { ...page, event: { ...page.event, poster: null, poster_thumb: null } } }) });
    expect(tag(without.html, "property", "og:image")).toMatch(/^https:\/\/myotherapp\.in\/og\/events\/hack-night-04\?v=/);
    expect(tag(without.html, "property", "og:image")).not.toBe(tag(withPoster.html, "property", "og:image"));
  });

  it("describes a club with its cover and tagline", async () => {
    const fetch = vi.fn(async () => ({ status: 200, data: { club: { name: "Circuit Society", slug: "circuit-society", tagline: "We build things that blink", cover: { original: "https://cdn.example/c.jpg" } } } }));
    const doc = await shareDocument("/clubs/circuit-society", { fetch });
    expect(fetch).toHaveBeenCalledWith("/api/v1/discover/clubs/circuit-society");
    expect(tag(doc.html, "property", "og:title")).toBe("Circuit Society");
    expect(tag(doc.html, "property", "og:description")).toBe("We build things that blink");
    expect(tag(doc.html, "property", "og:image")).toMatch(/^https:\/\/myotherapp\.in\/og\/clubs\/circuit-society\?v=[a-z0-9]+$/);
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

  it("gives the site's own pages their title, canonical address and their words, without asking the API", async () => {
    const fetch = vi.fn();
    const privacy = await shareDocument("/privacy", { fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(privacy.status).toBe(200);
    expect(canonical(privacy.html)).toBe("https://myotherapp.in/privacy");
    expect(privacy.html).toContain("<title>Privacy Policy · MyOtherApp</title>");
    expect(privacy.html).toContain("<p>Last updated 18 October 2026</p>");
    expect(privacy.html).toContain('<h2 id="what-we-collect">1. What We Collect</h2>');
    expect(privacy.html).toContain("<li><strong>Account details:</strong> your name, email address and username.");
    // The account-deletion section keeps its anchor for crawlers too.
    expect(privacy.html).toContain('<h2 id="delete-account">6. Deleting Your Account</h2>');
    expect(privacy.html).not.toContain("Finnet");

    const terms = await shareDocument("/terms", { fetch });
    expect(canonical(terms.html)).toBe("https://myotherapp.in/terms");
    expect(terms.html).toContain('<a href="https://myotherapp.in/privacy">Privacy Policy</a>');
    expect(terms.html).toContain(
      "<p><strong>We review reports and act within 24 hours, which may include removing content and suspending or terminating accounts.</strong>"
    );
    expect(terms.html).toContain('<a href="https://myotherapp.in/privacy#delete-account">Deleting your account</a>');
    expect(terms.html).not.toContain("2% processing fee");

    const about = await shareDocument("/about", { fetch });
    expect(canonical(about.html)).toBe("https://myotherapp.in/about");
    expect(about.html).toContain("<title>About MyOtherApp</title>");
    expect(about.html).toContain("<h2>For clubs</h2>");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives /for-clubs and /pricing their words, every plan with its prices, and the plans as structured data", async () => {
    const fetch = vi.fn(async () => ({ status: 200, data: plansResponse() }));
    const pricing = await shareDocument("/pricing", { fetch });
    expect(fetch).toHaveBeenCalledWith("/api/v1/plans");
    expect(pricing.status).toBe(200);
    expect(pricing.cache).toBe("public, s-maxage=600, stale-while-revalidate=86400");
    expect(canonical(pricing.html)).toBe("https://myotherapp.in/pricing");
    expect(pricing.html).toContain("<title>Pricing · MyOtherApp for clubs</title>");
    expect(tag(pricing.html, "property", "og:title")).toBe("Pricing · MyOtherApp for clubs");
    expect(pricing.html).toContain("<p>Pay yearly and get 2 months free.</p>");
    expect(pricing.html).toContain(
      "<li><strong>Growth</strong>: ₹699 a month or ₹6,990 a year. For an active club with a following. 15 events a month, 1,000 people per event, 8,000 registrations a month, 10 team seats, 60 announcements a month.</li>"
    );
    expect(pricing.html).toContain("<li><strong>Enterprise</strong>: Talk to us.");
    expect(pricing.html).toContain('<a href="https://myotherapp.in/privacy">Privacy Policy</a>');
    expect(pricing.html).not.toMatch(/coupon|ticket type|GB storage/i);
    const ld = JSON.parse(pricing.html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]);
    expect(ld).toMatchObject({ "@type": "SoftwareApplication", url: "https://myotherapp.in/pricing" });
    expect(ld.offers).toHaveLength(9);
    expect(ld.offers.find((o) => o.name === "Pro, monthly")).toMatchObject({ price: 1499, priceCurrency: "INR" });

    const clubs = await shareDocument("/for-clubs", { fetch });
    expect(canonical(clubs.html)).toBe("https://myotherapp.in/for-clubs");
    expect(clubs.html).toContain("<h2>Before the event: Fill the room</h2>");
    expect(clubs.html).toContain("<li><strong>We verify your club</strong>:");
    expect(clubs.html).toContain("<h2>Pricing</h2>");
    expect(JSON.parse(clubs.html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]).url).toBe("https://myotherapp.in/for-clubs");
  });

  it("keeps the plan pages' words when the plans can't be had, and tries again soon", async () => {
    for (const fetch of [async () => Promise.reject(new Error("timeout")), async () => ({ status: 404, data: null }), async () => ({ status: 200, data: { plans: [] } })]) {
      const doc = await shareDocument("/for-clubs", { fetch });
      expect(doc.status).toBe(200);
      expect(doc.cache).toBe("public, s-maxage=60, stale-while-revalidate=600");
      expect(tag(doc.html, "property", "og:title")).toBe("MyOtherApp for clubs · Run your club&#39;s events from one place");
      expect(doc.html).toContain("<h2>How it works</h2>");
      expect(doc.html).not.toContain("<h2>Pricing</h2>");
      expect(doc.html).not.toContain("application/ld+json");
    }
  });

  it("cuts descriptions at a word", () => {
    expect(clip("a ".repeat(200), 20).length).toBeLessThanOrEqual(20);
    expect(clip("short")).toBe("short");
  });
});

describe("the preview route", () => {
  it("answers by path (what the bot rewrites send) and by ?path=", async () => {
    const { GET: byPath } = await import("@/app/api/share/[...path]/route.js");
    const { GET: byQuery } = await import("@/app/api/share/route.js");
    const a = await byPath(new Request("https://myotherapp.in/api/share/events"), { params: Promise.resolve({ path: ["events"] }) });
    const b = await byQuery({ nextUrl: new URL("https://myotherapp.in/api/share?path=/about") });
    expect(a.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await a.text()).toContain("<title>Find events · MyOtherApp</title>");
    expect(await b.text()).toContain("<title>About MyOtherApp</title>");
  });
});
