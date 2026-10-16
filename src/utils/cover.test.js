import { describe, expect, it } from "vitest";
import { COVER_MOTIFS, COVER_PALETTES, coverLook, dateParts, eventHref, faceLook, heroPicks, initials, seatsInfo, seedOf } from "./cover";

describe("the generated cover", () => {
  it("is the same for the same event, and the colour moves from one event to the next", () => {
    expect(coverLook({ id: 60, category: { id: 1 } })).toEqual(coverLook({ id: 60, category: { id: 1 } }));
    expect(coverLook({ id: 60 }).palette).not.toBe(coverLook({ id: 61 }).palette);
    expect(COVER_PALETTES).toContain(coverLook({ id: "abc" }).palette);
    expect(COVER_MOTIFS).toContain(coverLook({ id: "abc", category: { id: "x" } }).motif);
  });

  it("keeps each category to its own few shapes", () => {
    const shapes = new Set(Array.from({ length: 30 }, (_, i) => coverLook({ id: i, category: { id: 1 } }).motif));
    expect(shapes.size).toBeGreaterThan(1);
    expect(shapes.size).toBeLessThanOrEqual(3);
  });

  it("hashes text ids and reads numeric ones as numbers", () => {
    expect(seedOf(68)).toBe(68);
    expect(seedOf("68")).toBe(68);
    expect(seedOf("letmegoo-33b259")).toBe(seedOf("letmegoo-33b259"));
    expect(seedOf(null)).toBe(seedOf(""));
  });

  it("gives faces a colour that reads on the card", () => {
    expect(faceLook("Asha Rao").palette.name).not.toBe("paper");
    expect(faceLook("Asha Rao")).toEqual(faceLook("asha rao"));
  });
});

describe("the pieces of a card", () => {
  it("says the day and month in India time", () => {
    // 20:00 UTC on the 16th is already the 17th in India.
    expect(dateParts("2026-10-16T20:00:00Z")).toEqual({ day: "17", month: "Oct", weekday: "Sat" });
    expect(dateParts("nope")).toBeNull();
    expect(dateParts(null)).toBeNull();
  });

  it("links by slug, then by id", () => {
    expect(eventHref({ id: 68, slug: "hack-night" })).toBe("/events/hack-night");
    expect(eventHref({ id: 68, slug: "  " })).toBe("/68");
    expect(eventHref({ id: 68 })).toBe("/68");
    expect(eventHref({ id: 68, slug: "a b" })).toBe("/events/a%20b");
  });

  it("knows how full an event is, and stays quiet when it can't tell", () => {
    expect(seatsInfo({ capacity: null, going: 3 })).toBeNull();
    expect(seatsInfo({ capacity: 0, going: 3 })).toBeNull();
    expect(seatsInfo({ capacity: 100, going: 3, status: "ended" })).toBeNull();
    expect(seatsInfo({ capacity: 100, going: 0 })).toMatchObject({ kind: "open", left: 100 });
    expect(seatsInfo({ capacity: 100, going: 40 })).toMatchObject({ kind: "bar", left: 60, pct: 40 });
    expect(seatsInfo({ capacity: 100, going: 90 })).toMatchObject({ kind: "few", left: 10 });
    expect(seatsInfo({ capacity: 20, going: 15 })).toMatchObject({ kind: "few", left: 5 });
    expect(seatsInfo({ capacity: 100, going: 120 })).toMatchObject({ kind: "full", left: 0 });
    expect(seatsInfo({ capacity: 100, going: 10, status: "full" })).toMatchObject({ kind: "full" });
  });

  it("makes initials", () => {
    expect(initials("Asha Rao")).toBe("AR");
    expect(initials("  kerala startup   mission ")).toBe("KM");
    expect(initials("madonna")).toBe("M");
    expect(initials("")).toBe("?");
  });
});

describe("the hero's picks", () => {
  const e = (id, over = {}) => ({ id, name: `E${id}`, starts_at: `2026-10-${10 + id}T10:00:00Z`, status: "upcoming", poster: null, ...over });

  it("puts what is live first, then events with a poster, then the soonest, never twice and never one that is over", () => {
    const home = {
      near: [e(5), e(1, { status: "ended" })],
      this_week: [e(4, { poster: "p.jpg" }), e(5)],
      popular: [e(3), e(9, { status: "live" })],
      online: [e(2)],
    };
    expect(heroPicks(home).map((x) => x.id)).toEqual([9, 4, 2]);
    expect(heroPicks(home, 5).map((x) => x.id)).toEqual([9, 4, 2, 3, 5]);
    expect(heroPicks(null)).toEqual([]);
    expect(heroPicks({ near: [] })).toEqual([]);
  });
});
