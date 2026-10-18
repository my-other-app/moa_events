// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseHome } from "@/api/parse";
import { everyoneHome, km, nearAnswer, sameTown } from "./home";

describe("the home page for everyone", () => {
  it("has no near, no distances and nobody's place; the most followed clubs when given", () => {
    const home = parseHome({
      where: { city: "Ashburn", lat: 39, lng: -77, source: "ip" },
      near: [{ id: 1, distance_km: 1 }],
      this_week: [{ id: 2, distance_km: 12000 }],
      online: [{ id: 3 }],
      popular: [{ id: 4, distance_km: 5 }],
      clubs: [{ id: 5, slug: "a", distance_km: 3 }],
    });
    const everyone = everyoneHome(home, [{ id: 6, slug: "b", distance_km: 9 }]);
    expect(everyone.where.source).toBe("none");
    expect(everyone.near).toEqual([]);
    expect([...everyone.this_week, ...everyone.online, ...everyone.popular].map((e) => e.distance_km)).toEqual([null, null, null]);
    expect(everyone.clubs.map((c) => [c.slug, c.distance_km])).toEqual([["b", null]]);
    expect(everyoneHome(home, []).clubs.map((c) => c.slug)).toEqual(["a"]);
  });
});

describe("near one visitor", () => {
  const home = (where) => parseHome({ where, near: [{ id: 1 }], clubs: [{ id: 5, slug: "a", distance_km: 3 }] });

  it("names the place the API names, else the guess's city, and says how the visitor was placed", () => {
    expect(nearAnswer(home({ city: "Kochi", lat: 9.9, lng: 76.2, source: "browser" }), { label: "Ernakulam", source: "ip" }).where).toEqual({
      city: "Kochi",
      region: null,
      lat: 9.9,
      lng: 76.2,
      source: "ip",
    });
    expect(nearAnswer(home({ lat: 9.9, lng: 76.2, source: "browser" }), { label: "Ernakulam", source: "browser" }).where).toMatchObject({ city: "Ernakulam", source: "browser" });
    // The API placed them itself (by their address).
    expect(nearAnswer(home({ city: "Pune", lat: 18.5, lng: 73.8, source: "ip" })).where).toMatchObject({ city: "Pune", source: "ip" });
  });

  it("is nothing for a visitor nobody could place", () => {
    expect(nearAnswer(home({ source: "none" }))).toEqual({ where: expect.objectContaining({ source: "none" }), near: [], clubs: [] });
    expect(nearAnswer(null)).toEqual({ where: expect.objectContaining({ source: "none" }), near: [], clubs: [] });
  });

  it("calls a shared point by the guess's town only when it is the same town", () => {
    expect(Math.round(km({ lat: 18.52, lng: 73.86 }, { lat: 19.08, lng: 72.88 }))).toBe(120);
    const guess = { lat: 9.93, lng: 76.27, city: "Kochi" };
    expect(sameTown({ lat: 10.02, lng: 76.34 }, guess)).toBe("Kochi");
    expect(sameTown({ lat: 18.52, lng: 73.86 }, guess)).toBeNull();
    expect(sameTown({ lat: 9.93, lng: 76.27 }, null)).toBeNull();
  });
});
