// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeFetch, outcome } from "@/test/next";
import { fullEvent } from "@/test/eventFixture";

/*
 * An event's or a club's old slug (feature-register/mail-and-slugs-contract.md,
 * Part S2): an admin changed it, and the API answers the old one with the
 * event or club, whose slug is the current one.
 *   - the kept (ISR) page at the old address answers a 308 to the current one;
 *   - with a query, src/proxy.js answers that 308 first, query kept (the ISR
 *     page never sees it), asking the API at most once a minute per slug;
 *   - the sitemaps list what the API lists: current slugs only.
 */
const EVENTS = "/api/v1/discover/events/";
const CLUBS = "/api/v1/discover/clubs/";
const T0 = Date.parse("2026-11-13T10:00:00+05:30");
const event = fullEvent();
const club = {
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null, tagline: "We build things that blink", followers: 40 },
  upcoming: [],
  past: [],
};

/** What the API says now, changed by the tests. */
let down;
let fetch;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  down = false;
  fetch = fakeFetch((u) => {
    if (down) return { status: 503, body: { detail: "down" } };
    const ref = decodeURIComponent(u.pathname.split("/").pop());
    if (u.pathname.startsWith(EVENTS)) return ["hack-night-04", "hack-night-old", "123"].includes(ref) ? { body: event } : { status: 404, body: { detail: "Not found" } };
    if (u.pathname.startsWith(CLUBS)) return ["circuit-society", "circuit-old"].includes(ref) ? { body: club } : { status: 404, body: { detail: "Not found" } };
    return undefined;
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fresh(file) {
  vi.resetModules();
  return import(file);
}

const request = (path, { method = "GET", headers = {} } = {}) => new NextRequest(`https://myotherapp.in${path}`, { method, headers });
const passes = (res) => res.headers.get("x-middleware-next") === "1";
const asked = () => fetch.calls.filter((c) => /\/api\/v1\/discover\/(events|clubs)\//.test(new URL(c.url).pathname)).map((c) => new URL(c.url).pathname);
const params = (o) => Promise.resolve(o);

describe("src/proxy.js: an old slug with a query", () => {
  it("runs on the event and club pages as well as the private docs", async () => {
    const { config } = await fresh("../../proxy.js");
    expect(config.matcher).toEqual(["/developers/:path+", "/events/:slug", "/clubs/:slug"]);
  });

  it("answers a 308 to the event's current slug, keeping the whole query", async () => {
    const { proxy } = await fresh("../../proxy.js");
    const res = await proxy(request("/events/hack-night-old?ref=x7k2m9pq&utm_source=qr&utm_source=poster&sref=site1234"));
    expect(res.status).toBe(308);
    expect(passes(res)).toBe(false);
    expect(res.headers.get("location")).toBe("https://myotherapp.in/events/hack-night-04?ref=x7k2m9pq&utm_source=qr&utm_source=poster&sref=site1234");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(asked()).toEqual([`${EVENTS}hack-night-old`]);
    // The read goes past Next's data cache: the proxy keeps its own answers.
    expect(fetch.calls[0].init.cache).toBe("no-store");
  });

  it("answers a 308 to the club's current slug, keeping the query", async () => {
    const { proxy } = await fresh("../../proxy.js");
    const res = await proxy(request("/clubs/circuit-old?follow=1&utm_campaign=nov"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://myotherapp.in/clubs/circuit-society?follow=1&utm_campaign=nov");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("lets the current slug through, asking the API once a minute per slug", async () => {
    const { proxy } = await fresh("../../proxy.js");
    expect(passes(await proxy(request("/events/hack-night-04?ref=abc")))).toBe(true);
    expect(passes(await proxy(request("/events/hack-night-04?utm_source=ig")))).toBe(true);
    expect((await proxy(request("/events/hack-night-old?ref=abc"))).status).toBe(308);
    expect((await proxy(request("/events/hack-night-old?ref=def"))).status).toBe(308);
    expect(asked()).toEqual([`${EVENTS}hack-night-04`, `${EVENTS}hack-night-old`]);
    vi.setSystemTime(T0 + 61_000);
    expect(passes(await proxy(request("/events/hack-night-04?ref=abc")))).toBe(true);
    expect(asked()).toHaveLength(3);
  });

  it("asks once for requests arriving together", async () => {
    const { proxy } = await fresh("../../proxy.js");
    const all = await Promise.all([1, 2, 3].map((n) => proxy(request(`/clubs/circuit-old?n=${n}`))));
    expect(all.map((r) => r.status)).toEqual([308, 308, 308]);
    expect(asked()).toEqual([`${CLUBS}circuit-old`]);
  });

  it("never asks without a query: the page's own 308 is the same answer", async () => {
    const { proxy } = await fresh("../../proxy.js");
    for (const path of ["/events/hack-night-old", "/events/hack-night-old?", "/clubs/circuit-old"]) expect(passes(await proxy(request(path)))).toBe(true);
    expect(asked()).toEqual([]);
  });

  it("never asks about what is not a slug page: an id, the city pages, feeds, junk, the router's own fetches, a POST", async () => {
    const { proxy } = await fresh("../../proxy.js");
    for (const path of ["/events/123?ref=x", "/events/in?x=1", "/clubs/in?x=1", "/events/rss.xml?x=1", "/events/a%20b?x=1", "/events/-x?x=1", "/events?q=hack", "/clubs?q=x"]) {
      expect(passes(await proxy(request(path))), path).toBe(true);
    }
    expect(passes(await proxy(request("/events/hack-night-old?ref=x", { headers: { rsc: "1" } })))).toBe(true);
    expect(passes(await proxy(request("/events/hack-night-old?_rsc=abc12")))).toBe(true);
    expect(passes(await proxy(request("/events/hack-night-old?ref=x", { method: "POST" })))).toBe(true);
    expect(asked()).toEqual([]);
  });

  it("lets an unknown slug through to the page's 404, and remembers it for a minute", async () => {
    const { proxy } = await fresh("../../proxy.js");
    expect(passes(await proxy(request("/events/nope?ref=x")))).toBe(true);
    expect(passes(await proxy(request("/events/nope?ref=y")))).toBe(true);
    expect(asked()).toEqual([`${EVENTS}nope`]);
  });

  it("lets everything through when the API fails, and asks again next time", async () => {
    const { proxy } = await fresh("../../proxy.js");
    down = true;
    expect(passes(await proxy(request("/events/hack-night-old?ref=x")))).toBe(true);
    down = false;
    expect((await proxy(request("/events/hack-night-old?ref=x"))).status).toBe(308);
    expect(asked()).toHaveLength(2);
  });

  it("believes only a slug-shaped answer", async () => {
    const { askCurrentSlug } = await fresh("@/seo/slugRedirect");
    const answering = (body) => fakeFetch(() => ({ body }));
    expect(await askCurrentSlug("event", "x", { base: "https://api.example", fetchImpl: answering({ event: { slug: "new-one" } }) })).toEqual({ state: "ok", slug: "new-one" });
    expect(await askCurrentSlug("club", "x", { base: "https://api.example", fetchImpl: answering({ club: { slug: "../evil" } }) })).toEqual({ state: "error" });
    expect(await askCurrentSlug("club", "x", { base: "https://api.example", fetchImpl: answering({}) })).toEqual({ state: "error" });
    expect(await askCurrentSlug("event", "x", { base: "https://api.example", fetchImpl: () => Promise.reject(new TypeError("fetch failed")) })).toEqual({ state: "error" });
  });

  it("sends the site's server credential when it has one", async () => {
    vi.stubEnv("API_SITE_TOKEN", "site-token-1");
    vi.stubEnv("API_BASE_URL", "https://api.internal:8000/");
    const { proxy } = await fresh("../../proxy.js");
    await proxy(request("/events/hack-night-old?ref=x"));
    expect(fetch.calls[0].url).toBe("https://api.internal:8000/api/v1/discover/events/hack-night-old");
    expect(fetch.calls[0].init.headers["X-Site-Token"]).toBe("site-token-1");
  });
});

describe("the pages at an old slug, without a query", () => {
  it("/events/{old slug} answers a 308 to the current one", async () => {
    const route = await fresh("../events/[slug]/page.jsx");
    expect(await outcome(() => route.default({ params: params({ slug: "hack-night-old" }) }))).toEqual({ redirect: { url: "/events/hack-night-04", status: 308 } });
  });

  it("/clubs/{old slug} answers a 308 to the current one", async () => {
    const route = await fresh("../clubs/[slug]/page.jsx");
    expect(await outcome(() => route.default({ params: params({ slug: "circuit-old" }) }))).toEqual({ redirect: { url: "/clubs/circuit-society", status: 308 } });
  });
});
