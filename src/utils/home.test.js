// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseHome } from "@/api/parse";
import { NEAR_KM, everyoneHome, km, nearAnswer, sameTown } from "./home";

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
    expect(everyone.clubs_more).toEqual([]);
    expect(everyoneHome(home, []).clubs.map((c) => c.slug)).toEqual(["a"]);
  });
});

describe("near one visitor", () => {
  const home = (where) => parseHome({ where, near: [{ id: 1, distance_km: 2 }], clubs: [{ id: 5, slug: "a", distance_km: 3 }] });

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
    const nowhere = { where: expect.objectContaining({ source: "none" }), near: [], clubs: [], clubs_more: [] };
    expect(nearAnswer(home({ source: "none" }))).toEqual(nowhere);
    expect(nearAnswer(null)).toEqual(nowhere);
  });

  it("calls a shared point by the guess's town only when it is the same town", () => {
    expect(Math.round(km({ lat: 18.52, lng: 73.86 }, { lat: 19.08, lng: 72.88 }))).toBe(120);
    const guess = { lat: 9.93, lng: 76.27, city: "Kochi" };
    expect(sameTown({ lat: 10.02, lng: 76.34 }, guess)).toBe("Kochi");
    expect(sameTown({ lat: 18.52, lng: 73.86 }, guess)).toBeNull();
    expect(sameTown({ lat: 9.93, lng: 76.27 }, null)).toBeNull();
  });
});

describe("near is within 50 km", () => {
  const at = { city: "Thiruvananthapuram", lat: 8.52, lng: 76.94, source: "browser" };
  const c = (slug, distance_km) => ({ id: slug.length, slug, name: slug, distance_km });
  const slugs = (list) => list.map((x) => x.slug);

  it("calls only the clubs within 50 km near, and lists the API's further ones after them, nearest first", () => {
    expect(NEAR_KM).toBe(50);
    const answer = nearAnswer(parseHome({ where: at, clubs: [c("tide", 5), c("verandah", 8.6)], clubs_more: [c("kandal", 411.7), c("ponnila", 126.2)] }));
    expect(slugs(answer.clubs)).toEqual(["tide", "verandah"]);
    expect(answer.clubs_more.map((x) => [x.slug, x.distance_km])).toEqual([["ponnila", 126.2], ["kandal", 411.7]]);
  });

  it("never calls a far club near, from an API that sent the nearest eight however far", () => {
    const answer = nearAnswer(parseHome({ where: at, clubs: [c("tide", 5), c("verandah", 8.6), c("ponnila", 126.2), c("borrow", 174.3), c("kandal", 411.7)] }));
    expect(slugs(answer.clubs)).toEqual(["tide", "verandah"]);
    expect(slugs(answer.clubs_more)).toEqual(["ponnila", "borrow", "kandal"]);
    // 50 km is near; a step past it is not.
    const edge = nearAnswer(parseHome({ where: at, clubs: [c("edge", 50), c("past", 50.1)] }));
    expect([slugs(edge.clubs), slugs(edge.clubs_more)]).toEqual([["edge"], ["past"]]);
  });

  it("calls none of the most followed near: they come with no distance", () => {
    const answer = nearAnswer(parseHome({ where: { ...at, city: "Mumbai", lat: 19.08, lng: 72.88 }, clubs: [c("kandal", null), c("tide", null)], clubs_more: [c("kandal", 840.2)] }));
    expect(answer.clubs).toEqual([]);
    expect(slugs(answer.clubs_more)).toEqual(["kandal"]);
  });

  it("keeps only in-person events within 50 km in the near rail", () => {
    const answer = nearAnswer(parseHome({ where: at, near: [{ id: 1, distance_km: 4.7 }, { id: 2, is_online: true }, { id: 3, distance_km: 126.2 }, { id: 4 }] }));
    expect(answer.near.map((e) => e.id)).toEqual([1]);
  });
});
