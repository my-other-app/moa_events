// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeFetch } from "@/test/next";

/*
 * /api/near: what is near one visitor, for the home page's island. Placed
 * by the point they shared, else by Vercel's guess (its geo headers), else
 * by their address when it can go to the API, else nowhere.
 */
const S3 = "https://b.s3.amazonaws.com/p.png?Signature=x&Expires=1";
let fetch;
let where;
beforeEach(() => {
  where = { city: null, region: null, lat: 9.93, lng: 76.27, source: "browser" };
  fetch = fakeFetch((url) => {
    if (url.pathname !== "/api/v1/discover/home") return { status: 404, body: {} };
    const lat = url.searchParams.get("lat");
    return {
      body: {
        where: lat ? { ...where, lat: Number(lat), lng: Number(url.searchParams.get("lng")) } : { city: "Pune", lat: 18.52, lng: 73.86, source: "ip" },
        near: [{ id: 9, slug: "near-event", name: "Near event", poster: S3, distance_km: 2.4, club: { id: 1, name: "C", slug: "c", logo: S3 } }],
        clubs: [{ id: 1, slug: "c", name: "C", logo: S3, cover: S3, distance_km: 1.2 }],
      },
    };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const GEO = { "x-vercel-ip-latitude": "9.9312", "x-vercel-ip-longitude": "76.2673", "x-vercel-ip-city": "Kochi", "x-forwarded-for": "49.37.10.2" };
const near = async (query = "", headers = {}) => (await import("../api/near/route.js")).GET(new NextRequest(`https://myotherapp.in/api/near${query}`, { headers }));

describe("/api/near", () => {
  it("places a visitor by Vercel's guess: the point to the API, the guess's city as the name, kept at the edge per place", async () => {
    const res = await near("", GEO);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    expect(res.headers.get("vary")).toBe("X-Vercel-IP-Latitude, X-Vercel-IP-Longitude, X-Vercel-IP-City");
    const body = await res.json();
    expect(Object.fromEntries(new URL(fetch.calls[0].url).searchParams)).toEqual({ lat: "9.9312", lng: "76.2673" });
    expect(body.where).toEqual({ city: "Kochi", region: null, lat: 9.9312, lng: 76.2673, source: "ip" });
    expect(body.near.map((e) => [e.slug, e.distance_km])).toEqual([["near-event", 2.4]]);
    expect(body.clubs.map((c) => c.slug)).toEqual(["c"]);
    // Pictures on the site's stable addresses.
    expect(JSON.stringify(body)).not.toMatch(/Signature=|Expires=/);
    expect(body.near[0].poster.medium).toBe("/media/events/near-event/poster?size=medium");
    expect(body.clubs[0].cover.original).toBe("/media/clubs/c/cover");
    // No token: the visitor's address doesn't go.
    expect(fetch.calls[0].init.headers).toEqual({ Accept: "application/json" });
  });

  it("calls only the clubs within 50 km near; the rest come apart, nearest first, as the API sends them or not", async () => {
    const club = (id, slug, distance_km) => ({ id, slug, name: slug, logo: S3, cover: S3, distance_km });
    vi.stubGlobal(
      "fetch",
      fakeFetch(() => ({
        body: { where: { city: "Kochi", lat: 9.93, lng: 76.27, source: "ip" }, near: [], clubs: [club(1, "c", 1.2), club(2, "far", 126.2)], clubs_more: [club(3, "farther", 411.7)] },
      }))
    );
    const body = await (await near("", GEO)).json();
    expect(body.clubs.map((c) => [c.slug, c.distance_km])).toEqual([["c", 1.2]]);
    expect(body.clubs_more.map((c) => [c.slug, c.distance_km])).toEqual([["far", 126.2], ["farther", 411.7]]);
    expect(body.clubs_more[0].cover.original).toBe("/media/clubs/far/cover");
  });

  it("takes a point the visitor shared over the guess, and keeps that answer theirs", async () => {
    where = { city: "Ernakulam", region: "Kerala", lat: 0, lng: 0, source: "browser" };
    const res = await near("?lat=10.0159&lng=76.3419", GEO);
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
    expect(res.headers.get("vary") || "").not.toMatch(/X-Vercel/);
    expect(Object.fromEntries(new URL(fetch.calls[0].url).searchParams)).toEqual({ lat: "10.016", lng: "76.342" });
    expect((await res.json()).where).toMatchObject({ city: "Ernakulam", source: "browser" });
  });

  it("names a shared point by the guess's town when the API names none and it is the same town", async () => {
    const res = await near("?lat=10.0159&lng=76.3419", GEO);
    expect((await res.json()).where).toMatchObject({ city: "Kochi", source: "browser" });
    fetch.calls.length = 0;
    const far = await near("?lat=18.52&lng=73.86", GEO);
    expect((await far.json()).where.city).toBeNull();
  });

  it("without a guess, lets the API place the visitor by their address, once it can go along", async () => {
    vi.stubEnv("API_SITE_TOKEN", "s3cret");
    const res = await near("", { "x-forwarded-for": "49.37.10.2" });
    expect(res.headers.get("cache-control")).toBe("private, max-age=60");
    expect(new URL(fetch.calls[0].url).search).toBe("");
    expect(fetch.calls[0].init.headers).toEqual({ Accept: "application/json", "X-Site-Token": "s3cret", "X-Visitor-IP": "49.37.10.2" });
    expect((await res.json()).where).toMatchObject({ city: "Pune", source: "ip" });
  });

  it("answers nowhere, without asking, when nothing places the visitor (the API would place this server)", async () => {
    const res = await near("", { "x-forwarded-for": "49.37.10.2" });
    expect(await res.json()).toEqual({ where: { city: null, region: null, lat: null, lng: null, source: "none" }, near: [], clubs: [], clubs_more: [] });
    expect(fetch.calls).toHaveLength(0);
    // Nonsense coordinates are no point.
    await near("?lat=abc&lng=1");
    expect(fetch.calls).toHaveLength(0);
  });

  it("says so (503, not kept) when the API is down", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 502, body: {} })));
    const res = await near("", GEO);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
