import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "./client";
import { fullEvent, sparseEvent } from "@/test/eventFixture";
import {
  clubsQuery,
  discoverApi,
  eventsQuery,
  filtersToSearch,
  forgetEvents,
  isEmptyHome,
  parseClubPage,
  parseEvent,
  parseEventPage,
  parseHome,
  parseSitemap,
  parseThread,
  parseWhere,
  readClubFilters,
  readEventFilters,
} from "./discover";

describe("the find-events filters", () => {
  it("are read from the address, dropping anything unknown", () => {
    const f = readEventFilters(new URLSearchParams("q=%20robots%20&when=this_week&type=online&price=gratis&sort=popular&category=7&radius_km=33&utm_source=x"));
    expect(f).toEqual({ q: "robots", when: "this_week", type: "online", price: "", category: "7", sort: "popular", radius_km: null });
  });

  it("make the API query with the stored point and the page, and nothing empty", () => {
    const q = eventsQuery({ q: "", when: "today", type: "", price: "free", category: "3", sort: "distance", radius_km: 25 }, { lat: 18.52, lng: 73.86 }, { offset: 24, limit: 12 });
    expect(q).toEqual({ when: "today", price: "free", category: "3", sort: "distance", lat: 18.52, lng: 73.86, radius_km: 25, offset: 24, limit: 12 });
  });

  it("leave the location out when none is stored, so the server guesses", () => {
    const q = eventsQuery({ when: "nonsense", radius_km: 7 }, null);
    expect(q).toEqual({ offset: 0, limit: 12 });
  });

  it("go back into the address in a stable order, only what is set", () => {
    const s = filtersToSearch({ q: "ai", when: "", type: "online", price: "", category: "", sort: "", radius_km: null });
    expect(s.toString()).toBe("q=ai&type=online");
  });
});

describe("the find-clubs filters", () => {
  it("read and build the clubs query", () => {
    const f = readClubFilters(new URLSearchParams("q=drone&interest=12&sort=nearby&radius_km=50"));
    expect(f).toEqual({ q: "drone", interest: "12", sort: "nearby", radius_km: 50 });
    expect(clubsQuery(f, { lat: 1, lng: 2 })).toEqual({ q: "drone", interest: "12", sort: "nearby", radius_km: 50, lat: 1, lng: 2, offset: 0, limit: 12 });
    expect(readClubFilters(new URLSearchParams("sort=distance")).sort).toBe("");
  });
});

describe("reading the responses", () => {
  it("fills a sparse event card with safe defaults", () => {
    expect(parseEvent({ id: 9 })).toMatchObject({
      id: 9,
      name: "Untitled event",
      poster: null,
      starts_at: null,
      is_online: false,
      has_fee: false,
      fee: null,
      category: null,
      club: null,
      going: 0,
      status: "upcoming",
    });
    expect(parseEvent({ id: 9, status: "exploded", going: "12", fee: "199.00" })).toMatchObject({ status: "upcoming", going: 12, fee: 199 });
    // The card links to /events/{slug}, so the slug has to come through.
    expect(parseEvent({ id: 9, slug: "hack-night-04" }).slug).toBe("hack-night-04");
    expect(parseEvent({ id: 9 }).slug).toBeNull();
  });

  it("drops rows it cannot link to", () => {
    expect(parseEvent(null)).toBeNull();
    expect(parseEvent({ name: "No id" })).toBeNull();
    expect(parseThread({ body: "no id" })).toBeNull();
  });

  it("never crashes on a home response with missing or wrong-typed parts", () => {
    const h = parseHome({ near: [{ id: 1 }, null, { nope: true }], clubs: "oops", stats: null, where: { city: "Pune", lat: "18.5", lng: 73.8 } });
    expect(h.near).toHaveLength(1);
    expect(h.clubs).toEqual([]);
    expect(h.threads).toEqual([]);
    expect(h.stats).toEqual({ upcoming_events: 0, clubs: 0, cities: 0 });
    expect(h.where).toEqual({ city: "Pune", region: null, lat: 18.5, lng: 73.8, source: "ip" });
    expect(isEmptyHome(parseHome(undefined))).toBe(true);
    expect(isEmptyHome(h)).toBe(false);
  });

  it("knows where it is from the server's word, or says none", () => {
    expect(parseWhere({ city: "Kochi", source: "browser", lat: 9.9, lng: 76.2 }).source).toBe("browser");
    expect(parseWhere(null)).toEqual({ city: null, region: null, lat: null, lng: null, source: "none" });
  });

  it("reads a poll, and a poll without options as a plain post", () => {
    const t = parseThread({
      id: "t1",
      club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: { thumbnail: "https://x/t.jpg" } },
      body: "Which night?",
      kind: "poll",
      poll: { options: [{ id: "a", label: "Fri", votes: 3, share: 75 }, { id: "b", label: "Sat", votes: 1, share: 25 }], votes: 4, voted_option_id: null },
      likes: 2,
    });
    expect(t.kind).toBe("poll");
    expect(t.poll.options.map((o) => o.share)).toEqual([75, 25]);
    expect(t.comments).toBe(0);
    expect(parseThread({ id: "t2", kind: "poll", poll: { options: [] } }).kind).toBe("post");
  });

  it("reads a club page, and says nothing when the club itself is missing", () => {
    expect(parseClubPage({ upcoming: [] })).toBeNull();
    const p = parseClubPage({ club: { slug: "c", name: "C", socials: { instagram: "https://instagram.com/c" } }, team: [{ name: "Asha", links: null }, { role: "no name" }], partners: "x" });
    expect(p.club.socials.instagram).toBe("https://instagram.com/c");
    expect(p.team).toEqual([{ name: "Asha", role: null, photo: null, links: { instagram: null, linkedin: null, x: null, website: null } }]);
    expect(p.partners).toEqual([]);
    expect(p.upcoming).toEqual([]);
  });
});

describe("reading an event's page", () => {
  it("reads every part of a full event, and leaves this event out of its own 'more' row", () => {
    const p = parseEventPage(fullEvent());
    expect(p.event).toMatchObject({ id: 123, slug: "hack-night-04", fee: 250, prize_amount: 50000, capacity: 120, seats_left: 18, lat: 18.5293, status: "upcoming", registration_open: true });
    expect(p.event.category).toEqual({ id: 9, name: "Hackathon" });
    expect(p.club.name).toBe("Circuit Society");
    expect(p.speakers.map((s) => s.name)).toEqual(["Ananya Iyer", "Rahul Menon"]);
    expect(p.agenda.items).toHaveLength(2);
    expect(p.team_source).toBe("event");
    expect(p.more_from_club.map((e) => e.slug)).toEqual(["solder-sprint"]);
    expect(p.similar[0].slug).toBe("ctf-night");
  });

  it("turns the zeros of an unfilled form into nothing, never 0", () => {
    const { event } = parseEventPage(sparseEvent());
    expect(event).toMatchObject({ fee: null, prize_amount: null, capacity: null, seats_left: null, going: 0, about: null, lat: null, lng: null });
    expect(parseEventPage(sparseEvent({ event: { ...sparseEvent().event, lat: 0, lng: 0 } })).event.lat).toBeNull();
  });

  it("says nothing without the event itself, and copes with wrong-typed parts", () => {
    expect(parseEventPage({ club: { name: "x" } })).toBeNull();
    const p = parseEventPage({ event: { id: 5, status: "weird", agenda: null }, speakers: "x", agenda: { items: [{ title: "no time" }, { starts_at: "2026-10-18T10:00:00Z", title: "ok" }] }, team: [{ name: "A" }], team_source: "bogus" });
    expect(p.event.status).toBe("upcoming");
    expect(p.speakers).toEqual([]);
    expect(p.agenda.items.map((i) => i.title)).toEqual(["ok"]);
    expect(p.team_source).toBe("none");
  });

  it("reads the sitemap, dropping rows without a slug", () => {
    expect(parseSitemap({ events: [{ slug: "a", updated_at: "2026-10-16T10:00:00Z" }, { slug: null }], clubs: "x" })).toEqual({ events: [{ slug: "a", updated_at: "2026-10-16T10:00:00Z" }], clubs: [] });
  });
});

describe("the calls", () => {
  let adapter;
  beforeEach(() => {
    localStorage.setItem("access_token", "from-a-registration");
    adapter = vi.fn();
    apiClient.defaults.adapter = adapter;
  });
  afterEach(() => {
    localStorage.clear();
    delete apiClient.defaults.adapter;
  });

  it("ask for events as a visitor, with the filters as the query", async () => {
    adapter.mockImplementation(async (config) => ({ data: { items: [{ id: 1, name: "Hack Night" }], total: 1, where: { city: "Pune" } }, status: 200, headers: {}, config }));
    const page = await discoverApi.events({ when: "today" }, { lat: 18.5, lng: 73.8 }, { offset: 0, limit: 12 });
    const config = adapter.mock.calls[0][0];
    expect(config.url).toBe("/api/v1/discover/events");
    expect(config.params).toEqual({ when: "today", lat: 18.5, lng: 73.8, offset: 0, limit: 12 });
    expect(config.headers.Authorization).toBeUndefined();
    expect(page.items[0].name).toBe("Hack Night");
    expect(page.where.city).toBe("Pune");
  });

  it("looks an event up once for its slug and its id, and remembers it for a minute", async () => {
    forgetEvents();
    adapter.mockImplementation(async (config) => ({ data: fullEvent(), status: 200, headers: {}, config }));
    const [a, b] = await Promise.all([discoverApi.event("123"), discoverApi.event("123")]);
    expect(a).toBe(b);
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].url).toBe("/api/v1/discover/events/123");
    expect(adapter.mock.calls[0][0].headers.Authorization).toBeUndefined();
    // The page it redirects to asks by slug: already known.
    expect((await discoverApi.event("hack-night-04")).event.id).toBe(123);
    expect(adapter).toHaveBeenCalledTimes(1);
    // A retry asks again.
    await discoverApi.event("hack-night-04", { fresh: true });
    expect(adapter).toHaveBeenCalledTimes(2);
    forgetEvents();
  });

  it("says an event that isn't public is not found, and doesn't remember a failure", async () => {
    forgetEvents();
    adapter.mockImplementation(async (config) => {
      const e = new Error("404");
      e.config = config;
      e.response = { status: 404, config };
      throw e;
    });
    await expect(discoverApi.event("nope")).rejects.toMatchObject({ notFound: true });
    adapter.mockImplementation(async (config) => ({ data: sparseEvent({ event: { ...sparseEvent().event, slug: "nope" } }), status: 200, headers: {}, config }));
    expect((await discoverApi.event("nope")).event.slug).toBe("nope");
    forgetEvents();
  });

  it("tells a missing club apart from a failure", async () => {
    adapter.mockImplementation(async (config) => {
      const e = new Error("404");
      e.config = config;
      e.response = { status: 404, config };
      throw e;
    });
    await expect(discoverApi.club("nobody")).rejects.toMatchObject({ notFound: true });
    adapter.mockImplementation(async (config) => {
      const e = new Error("Network Error");
      e.config = config;
      throw e;
    });
    await expect(discoverApi.club("somebody")).rejects.toMatchObject({ notFound: false });
  });
});
