// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANYWHERE } from "@/api/parse";
import { fakeFetch } from "@/test/next";
import { getClubs, getComments, getEvents, getHome, getNearHome, getNewestEvents, getPlans, getThreads, placeFor } from "./discover";
import { plansResponse } from "@/test/plansFixture";

/*
 * The server's reads of the discover API: where a list is about, who it
 * is read for, and how the home page is made the same for everyone.
 */
let fetch;
const queryOf = (i = -1) => new URL(fetch.calls.at(i).url).searchParams;
const headersOf = (i = -1) => fetch.calls.at(i).init.headers;
const card = (id, over = {}) => ({ id, slug: `e-${id}`, name: `Event ${id}`, starts_at: "2026-10-30T12:30:00Z", status: "upcoming", ...over });

beforeEach(() => {
  fetch = fakeFetch(() => ({ body: { items: [], total: 0 } }));
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("where a list read asks about", () => {
  it("is a point when there is one, everywhere when the API would otherwise place this server", () => {
    expect(placeFor({ lat: 1, lng: 2 }, null)).toEqual({ lat: 1, lng: 2 });
    expect(placeFor(ANYWHERE, { ip: "49.37.10.2" })).toBe(ANYWHERE);
    expect(placeFor(null, null)).toBe(ANYWHERE);
    expect(placeFor(null, { ip: "49.37.10.2" })).toBe(ANYWHERE); // no token: the address doesn't go
    vi.stubEnv("API_SITE_TOKEN", "s3cret");
    // The visitor's own address goes: the API places them, and near you works from the server.
    expect(placeFor(null, { ip: "49.37.10.2" })).toBeNull();
  });

  it("asks for everywhere (radius 0) without a point, for a visitor the API can't place", async () => {
    await getEvents({ type: "online" });
    expect(Object.fromEntries(queryOf())).toEqual({ type: "online", radius_km: "0", offset: "0", limit: "24" });
    await getClubs({ sort: "nearby" }, { visitor: { ip: "49.37.10.2" } });
    expect(Object.fromEntries(queryOf())).toEqual({ radius_km: "0", offset: "0", limit: "12" });
    expect(headersOf()).toEqual({ Accept: "application/json" });
  });

  it("drops that once the visitor's address goes along: the API places them, with its own radius", async () => {
    vi.stubEnv("API_SITE_TOKEN", "s3cret");
    await getEvents({ sort: "distance" }, { visitor: { ip: "49.37.10.2" } });
    expect(Object.fromEntries(queryOf())).toEqual({ sort: "distance", offset: "0", limit: "24" });
    expect(headersOf()).toMatchObject({ "X-Site-Token": "s3cret", "X-Visitor-IP": "49.37.10.2" });
    // A list the page wants everywhere stays everywhere, whoever reads it.
    await getEvents({ sort: "distance" }, { where: ANYWHERE, visitor: { ip: "49.37.10.2" } });
    expect(Object.fromEntries(queryOf())).toEqual({ radius_km: "0", offset: "0", limit: "24" });
    // A point is a point.
    await getEvents({}, { where: { lat: 9.93, lng: 76.27 }, visitor: { ip: "49.37.10.2" } });
    expect(Object.fromEntries(queryOf())).toEqual({ lat: "9.93", lng: "76.27", offset: "0", limit: "24" });
  });
});

describe("the newest events, for the feeds", () => {
  it("are asked for in that order, everywhere", async () => {
    fetch = fakeFetch(() => ({ body: { items: [card(2), card(1)], total: 2 } }));
    vi.stubGlobal("fetch", fetch);
    const page = await getNewestEvents({ type: "online", sort: "popular" });
    expect(page.items.map((e) => e.id)).toEqual([2, 1]);
    expect(Object.fromEntries(queryOf())).toEqual({ type: "online", radius_km: "0", sort: "newest", offset: "0", limit: "60" });
  });

  it("are null from an API that doesn't know the order (422), and an outage still throws", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 422, body: { detail: "sort" } })));
    expect(await getNewestEvents({})).toBeNull();
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 503, body: {} })));
    await expect(getNewestEvents({})).rejects.toMatchObject({ name: "ApiError", status: 503 });
  });
});

describe("the home page's data", () => {
  const home = (where) => ({
    where,
    near: [card(9, { distance_km: 2 })],
    this_week: [card(1, { distance_km: 12000 })],
    online: [],
    popular: [card(2, { distance_km: 13000 })],
    clubs: [{ id: 5, slug: "near-the-server", name: "Near the server", distance_km: 10 }],
    categories: [{ id: 3, name: "Workshop", upcoming: 4 }],
    threads: [],
    stats: { upcoming_events: 5, clubs: 4, cities: 7 },
  });

  it("is the same for everyone: no near, no distances, and the most followed clubs when the API placed this server", async () => {
    fetch = fakeFetch((url) => {
      if (url.pathname === "/api/v1/discover/home") return { body: home({ city: "Ashburn", lat: 39, lng: -77, source: "ip" }) };
      if (url.pathname === "/api/v1/discover/clubs") return { body: { items: [{ id: 7, slug: "most-followed", name: "Most followed", followers: 900, distance_km: 13000 }], total: 1 } };
      return { status: 404, body: {} };
    });
    vi.stubGlobal("fetch", fetch);
    const data = await getHome();
    expect(data.where).toEqual({ city: null, region: null, lat: null, lng: null, source: "none" });
    expect(data.near).toEqual([]);
    expect([...data.this_week, ...data.popular].map((e) => e.distance_km)).toEqual([null, null]);
    expect(data.clubs.map((c) => [c.slug, c.distance_km])).toEqual([["most-followed", null]]);
    expect(data.stats).toEqual({ upcoming_events: 5, clubs: 4, cities: 7 });
    expect(Object.fromEntries(new URL(fetch.calls[1].url).searchParams)).toEqual({ sort: "popular", radius_km: "0", offset: "0", limit: "8" });
    // Read for nobody: no point, no visitor; cached a minute with the lists.
    expect(new URL(fetch.calls[0].url).search).toBe("");
    expect(fetch.calls[0].init.next).toEqual({ revalidate: 60, tags: ["lists"] });
  });

  it("takes the API's clubs when it placed nobody (an API that knows the site's own reads)", async () => {
    fetch = fakeFetch(() => ({ body: home({ source: "none" }) }));
    vi.stubGlobal("fetch", fetch);
    const data = await getHome();
    expect(fetch.calls).toHaveLength(1);
    expect(data.clubs.map((c) => [c.slug, c.distance_km])).toEqual([["near-the-server", null]]);
  });

  it("near one visitor: at their point, or by their address when it goes along", async () => {
    fetch = fakeFetch(() => ({ body: home({ city: "Kochi", lat: 9.93, lng: 76.27, source: "browser" }) }));
    vi.stubGlobal("fetch", fetch);
    const data = await getNearHome({ lat: 9.93, lng: 76.27 }, { visitor: { ip: "49.37.10.2" } });
    expect(data.near.map((e) => e.id)).toEqual([9]);
    expect(Object.fromEntries(queryOf())).toEqual({ lat: "9.93", lng: "76.27" });
    vi.stubEnv("API_SITE_TOKEN", "s3cret");
    await getNearHome(null, { visitor: { ip: "49.37.10.2" } });
    expect(new URL(fetch.calls.at(-1).url).search).toBe("");
    expect(headersOf()).toMatchObject({ "X-Visitor-IP": "49.37.10.2" });
  });
});

describe("posts and plans", () => {
  it("reads the feed a page at a time, and a post's comments (null when the post is gone)", async () => {
    fetch = fakeFetch((url) => {
      if (url.pathname === "/api/v1/discover/threads") return { body: { items: [{ id: "t1", club: { id: 1, name: "C" }, body: "Hi" }], total: 1 } };
      if (url.pathname === "/api/v1/threads/t1/comments") return { body: [{ id: "c1", body: "Yo", author: { name: "R" } }, { nope: true }] };
      return { status: 404, body: {} };
    });
    vi.stubGlobal("fetch", fetch);
    expect((await getThreads({ offset: 12 })).items.map((t) => t.id)).toEqual(["t1"]);
    expect(Object.fromEntries(queryOf())).toEqual({ offset: "12", limit: "12" });
    expect((await getComments("t1")).map((c) => c.id)).toEqual(["c1"]);
    expect(fetch.calls.at(-1).init.next).toEqual({ revalidate: 60, tags: ["thread:t1"] });
    expect(await getComments("gone")).toBeNull();
    expect(await getComments("../etc")).toBeNull();
  });

  it("reads the plans, kept five minutes", async () => {
    fetch = fakeFetch(() => ({ body: plansResponse() }));
    vi.stubGlobal("fetch", fetch);
    const plans = await getPlans();
    expect(plans.plans.map((p) => p.key)).toContain("growth");
    expect(fetch.calls[0].init.next).toEqual({ revalidate: 300, tags: ["plans"] });
  });
});
