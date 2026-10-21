// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { parseXml, texts } from "@/test/xml";
import { fullEvent } from "@/test/eventFixture";

/*
 * The made-up demo clubs (src/seo/demo.js) on the server: their pages say
 * noindex, follow and still render; the sitemaps and the find pages'
 * ItemLists leave them out; DEMO_NOINDEX=off puts everything back.
 */
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const DEMO_CLUB = { id: 7, name: "Borrow Checkers Kochi", slug: "borrow-checkers-kochi", tagline: "Rust in Kochi", location_name: "Panampilly Nagar, Kochi", contact_email: "hello@borrow-checkers-kochi.demo.myotherapp.in" };
const NEW_DEMO_CLUB = { id: 9, name: "Unlisted Demo", slug: "unlisted-demo", contact_email: "hi@unlisted-demo.demo.myotherapp.in" };
const REAL_CLUB = { id: 3, name: "Circuit Society", slug: "circuit-society", contact_email: "hello@circuit.club" };
const ref = (c) => ({ id: c.id, name: c.name, slug: c.slug, logo: null });
const card = (id, slug, club) => ({ id, slug, name: `Event ${id}`, starts_at: "2026-11-01T13:00:00Z", status: "upcoming", club: ref(club) });

const demoEvent = fullEvent({
  event: { ...fullEvent().event, id: 73, slug: "meetup-29", name: "Meetup #29", contact: { name: "S", email: "hello@borrow-checkers-kochi.demo.myotherapp.in", phone: null } },
  club: ref(DEMO_CLUB),
});
const realEvent = fullEvent();

let fetch;
beforeEach(() => {
  requestHeaders = new Headers();
  fetch = fakeFetch((url) => {
    const p = url.pathname;
    if (p === "/api/v1/discover/clubs/borrow-checkers-kochi") return { body: { club: DEMO_CLUB, upcoming: [card(73, "meetup-29", DEMO_CLUB)], past: [] } };
    if (p === "/api/v1/discover/clubs/unlisted-demo") return { body: { club: NEW_DEMO_CLUB, upcoming: [], past: [] } };
    if (p === "/api/v1/discover/clubs/circuit-society") return { body: { club: REAL_CLUB, upcoming: [], past: [] } };
    if (p === "/api/v1/discover/events/meetup-29") return { body: demoEvent };
    if (p === "/api/v1/discover/events/hack-night-04") return { body: realEvent };
    if (p === "/api/v1/threads/t-demo") return { body: { id: "t-demo", club: ref(DEMO_CLUB), body: "Kits are in", created_at: "2026-10-15T10:00:00Z" } };
    if (p === "/api/v1/threads/t-real") return { body: { id: "t-real", club: ref(REAL_CLUB), body: "Hello", created_at: "2026-10-15T10:00:00Z" } };
    if (/^\/api\/v1\/threads\/[^/]+\/comments$/.test(p)) return { body: [] };
    if (p === "/api/v1/discover/clubs/borrow-checkers-kochi/events") {
      const when = url.searchParams.get("when");
      return { body: { items: when === "past" ? [card(60, "meetup-28", DEMO_CLUB)] : [card(73, "meetup-29", DEMO_CLUB)], total: 1 } };
    }
    if (p === "/api/v1/discover/sitemap/index") return { status: 404, body: {} };
    if (p === "/api/v1/discover/sitemap") {
      return {
        body: {
          events: [{ slug: "meetup-29" }, { slug: "meetup-28" }, { slug: "hack-night-04" }, { slug: "tagged-by-api", club_slug: "neural-tide" }],
          clubs: [{ slug: "borrow-checkers-kochi" }, { slug: "circuit-society" }, { slug: "neural-tide" }],
        },
      };
    }
    if (p === "/api/v1/discover/events") return { body: { items: [card(73, "meetup-29", DEMO_CLUB), card(1, "hack-night-04", REAL_CLUB)], total: 2, categories: [{ id: 4, name: "Tech", upcoming: 2 }] } };
    if (p === "/api/v1/discover/clubs") return { body: { items: [{ ...ref(DEMO_CLUB), followers: 1 }, { ...ref(REAL_CLUB), followers: 2 }], total: 2, interests: [] } };
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const params = (o) => Promise.resolve(o);
const NOINDEX = { index: false, follow: true };

describe("a demo club's pages", () => {
  it("say noindex, follow: the club (by its slug or its address), its events and its posts", async () => {
    const clubRoute = await import("../clubs/[slug]/page.jsx");
    expect((await clubRoute.generateMetadata({ params: params({ slug: "borrow-checkers-kochi" }) })).robots).toEqual(NOINDEX);
    expect((await clubRoute.generateMetadata({ params: params({ slug: "unlisted-demo" }) })).robots).toEqual(NOINDEX);
    expect((await clubRoute.generateMetadata({ params: params({ slug: "circuit-society" }) })).robots).toBeUndefined();

    const eventRoute = await import("../events/[slug]/page.jsx");
    const meta = await eventRoute.generateMetadata({ params: params({ slug: "meetup-29" }) });
    expect(meta.robots).toEqual(NOINDEX);
    // Still the page it was: its canonical, its title.
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/events/meetup-29");
    expect((await eventRoute.generateMetadata({ params: params({ slug: "hack-night-04" }) })).robots).toBeUndefined();

    const threadRoute = await import("../threads/[id]/page.jsx");
    expect((await threadRoute.generateMetadata({ params: params({ id: "t-demo" }) })).robots).toEqual(NOINDEX);
    expect((await threadRoute.generateMetadata({ params: params({ id: "t-real" }) })).robots).toBeUndefined();
  });

  it("still render for people, in full", async () => {
    const eventRoute = await import("../events/[slug]/page.jsx");
    const out = html(await eventRoute.default({ params: params({ slug: "meetup-29" }) }));
    expect(out).toContain("Meetup #29");
    const clubRoute = await import("../clubs/[slug]/page.jsx");
    expect(html(await clubRoute.default({ params: params({ slug: "borrow-checkers-kochi" }) }))).toContain("Borrow Checkers Kochi");
  });

  it("are indexed like any other once DEMO_NOINDEX=off", async () => {
    vi.stubEnv("DEMO_NOINDEX", "off");
    const clubRoute = await import("../clubs/[slug]/page.jsx");
    expect((await clubRoute.generateMetadata({ params: params({ slug: "borrow-checkers-kochi" }) })).robots).toBeUndefined();
    const eventRoute = await import("../events/[slug]/page.jsx");
    expect((await eventRoute.generateMetadata({ params: params({ slug: "meetup-29" }) })).robots).toBeUndefined();
  });
});

describe("the sitemaps", () => {
  const sitemap = async (name) => {
    const { GET } = await import("../sitemaps/[name]/route.js");
    return texts(parseXml(await (await GET(new Request(`https://myotherapp.in/sitemaps/${name}`), { params: params({ name }) })).text()), "loc");
  };

  it("leave out the demo clubs and every event of theirs, upcoming and past", async () => {
    expect(await sitemap("clubs-1.xml")).toEqual(["https://myotherapp.in/clubs/circuit-society"]);
    expect(await sitemap("events-1.xml")).toEqual(["https://myotherapp.in/events/hack-night-04"]);
  });

  it("list them all again with the switch off (and read no club's events for it)", async () => {
    vi.stubEnv("DEMO_NOINDEX", "off");
    expect(await sitemap("clubs-1.xml")).toHaveLength(3);
    expect(await sitemap("events-1.xml")).toHaveLength(4);
    expect(fetch.calls.some((c) => c.url.includes("/events?") && c.url.includes("/clubs/"))).toBe(false);
  });
});

describe("the find pages' ItemLists", () => {
  const sp = (qs) => Promise.resolve(Object.fromEntries(new URLSearchParams(qs)));

  it("list only real events and clubs; the demo ones still show", async () => {
    const events = await import("../events/page.jsx");
    const out = html(await events.default({ searchParams: sp("") }), "/events");
    expect(out).toContain("Event 73");
    const list = jsonLdOf(out).find((l) => l["@type"] === "ItemList");
    expect(list.itemListElement.map((i) => i.url)).toEqual(["https://myotherapp.in/events/hack-night-04"]);

    const clubs = await import("../clubs/page.jsx");
    const clubsOut = html(await clubs.default({ searchParams: sp("") }), "/clubs");
    expect(jsonLdOf(clubsOut).find((l) => l["@type"] === "ItemList").itemListElement.map((i) => i.name)).toEqual(["Circuit Society"]);
  });

  it("keep a filter whose results are all demo out of the index", async () => {
    fetch = fakeFetch(() => ({ body: { items: [card(73, "meetup-29", DEMO_CLUB)], total: 1, categories: [{ id: 4, name: "Tech", upcoming: 1 }] } }));
    vi.stubGlobal("fetch", fetch);
    const events = await import("../events/page.jsx");
    const meta = await events.generateMetadata({ searchParams: sp("category=4") });
    expect(meta.robots).toEqual({ index: false, follow: true });
    const out = html(await events.default({ searchParams: sp("category=4") }), "/events?category=4");
    expect(jsonLdOf(out).find((l) => l["@type"] === "ItemList")).toBeUndefined();
  });
});
