import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "./client";
import {
  clubsQuery,
  discoverApi,
  eventsQuery,
  filtersToSearch,
  isEmptyHome,
  parseClubPage,
  parseEvent,
  parseHome,
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
