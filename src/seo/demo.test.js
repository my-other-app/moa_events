// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEMO_CLUB_SLUGS,
  demoSettings,
  isDemoCard,
  isDemoClub,
  isDemoClubPage,
  isDemoEmail,
  isDemoEventPage,
  isDemoSitemapRow,
  isDemoThread,
  realTotal,
  unlessDemo,
  withoutDemo,
} from "./demo";

/* The made-up showcase clubs: one helper decides, one switch turns it off. */
const on = demoSettings({});
const off = demoSettings({ DEMO_NOINDEX: "off" });
const real = { id: 1, slug: "circuit-society", name: "Circuit Society", contact_email: "hello@circuit.club" };
const listed = { id: 7, slug: "borrow-checkers-kochi", name: "Borrow Checkers Kochi" };
const byEmail = { id: 99, slug: "some-new-demo", name: "Somewhere", contact_email: "hello@some-new-demo.demo.myotherapp.in" };

describe("the settings", () => {
  it("is on by default, with the eight seeded clubs", () => {
    expect(on.on).toBe(true);
    expect([...on.slugs]).toEqual([...DEFAULT_DEMO_CLUB_SLUGS]);
    expect(DEFAULT_DEMO_CLUB_SLUGS).toHaveLength(8);
  });

  it("is off with DEMO_NOINDEX=off (or 0, false, no), whatever the case", () => {
    for (const v of ["off", "OFF", "0", "false", " no "]) expect(demoSettings({ DEMO_NOINDEX: v }).on).toBe(false);
    for (const v of ["on", "1", "", "yes"]) expect(demoSettings({ DEMO_NOINDEX: v }).on).toBe(true);
  });

  it("takes its list from DEMO_CLUB_SLUGS when set (empty: by address only)", () => {
    expect([...demoSettings({ DEMO_CLUB_SLUGS: " Neural-Tide , respawn-room,," }).slugs]).toEqual(["neural-tide", "respawn-room"]);
    expect(demoSettings({ DEMO_CLUB_SLUGS: "" }).slugs.size).toBe(0);
  });
});

describe("telling demo content", () => {
  it("knows a demo address, and only that domain", () => {
    expect(isDemoEmail("hello@borrow-checkers-kochi.demo.myotherapp.in")).toBe(true);
    expect(isDemoEmail("HELLO@DEMO.MYOTHERAPP.IN")).toBe(true);
    expect(isDemoEmail("hello@myotherapp.in")).toBe(false);
    expect(isDemoEmail("hello@notdemo.myotherapp.in.example.com")).toBe(false);
    expect(isDemoEmail("hello@xdemo.myotherapp.in")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
  });

  it("knows a club by the API's word, its address or its slug; never with the switch off", () => {
    expect(isDemoClub(listed, on)).toBe(true);
    expect(isDemoClub(byEmail, on)).toBe(true);
    expect(isDemoClub({ ...real, is_demo: true }, on)).toBe(true);
    expect(isDemoClub(real, on)).toBe(false);
    expect(isDemoClub(null, on)).toBe(false);
    for (const club of [listed, byEmail, { ...real, is_demo: true }]) expect(isDemoClub(club, off)).toBe(false);
    // A list of its own replaces the eight.
    expect(isDemoClub(listed, demoSettings({ DEMO_CLUB_SLUGS: "neural-tide" }))).toBe(false);
  });

  it("knows an event card, an event's page, a club's page and a post by their club (an event's page by its own address too)", () => {
    expect(isDemoCard({ id: 73, club: listed }, on)).toBe(true);
    expect(isDemoCard({ id: 1, club: real }, on)).toBe(false);
    expect(isDemoEventPage({ event: { id: 73, contact: { email: null } }, club: listed }, on)).toBe(true);
    expect(isDemoEventPage({ event: { id: 5, contact: { email: "team@x.demo.myotherapp.in" } }, club: { slug: "unlisted" } }, on)).toBe(true);
    expect(isDemoEventPage({ event: { id: 1, contact: { email: "hello@circuit.club" } }, club: real }, on)).toBe(false);
    expect(isDemoClubPage({ club: byEmail }, on)).toBe(true);
    expect(isDemoThread({ id: "t1", club: listed }, on)).toBe(true);
    expect(isDemoThread({ id: "t2", club: real }, off)).toBe(false);
  });

  it("leaves demo items out of a list, unless switched off", () => {
    const cards = [{ id: 1, club: real }, { id: 73, club: listed }, { id: 2, club: { slug: null } }];
    expect(withoutDemo(cards, isDemoCard, on).map((c) => c.id)).toEqual([1, 2]);
    expect(withoutDemo(cards, isDemoCard, off).map((c) => c.id)).toEqual([1, 73, 2]);
  });

  it("counts a list whose shown results are all demo as empty, for indexing", () => {
    expect(realTotal({ items: [{ id: 73, club: listed }], total: 19 }, isDemoCard, on)).toBe(0);
    expect(realTotal({ items: [{ id: 73, club: listed }, { id: 1, club: real }], total: 19 }, isDemoCard, on)).toBe(19);
    expect(realTotal({ items: [{ id: 73, club: listed }], total: 19 }, isDemoCard, off)).toBe(19);
    expect(realTotal({ items: [], total: 0 }, isDemoCard, on)).toBe(0);
  });

  it("knows a sitemap row: a club by its slug, an event by its club or among the listed clubs' events", () => {
    const eventSlugs = new Set(["meetup-29-profiling-in-production"]);
    expect(isDemoSitemapRow("clubs", { slug: "borrow-checkers-kochi" }, { settings: on })).toBe(true);
    expect(isDemoSitemapRow("clubs", { slug: "circuit-society" }, { settings: on })).toBe(false);
    expect(isDemoSitemapRow("events", { slug: "meetup-29-profiling-in-production" }, { settings: on, eventSlugs })).toBe(true);
    expect(isDemoSitemapRow("events", { slug: "anything", club: "neural-tide" }, { settings: on })).toBe(true);
    expect(isDemoSitemapRow("events", { slug: "anything", is_demo: true }, { settings: on })).toBe(true);
    expect(isDemoSitemapRow("events", { slug: "hack-night-04" }, { settings: on, eventSlugs })).toBe(false);
    expect(isDemoSitemapRow("events", { slug: "meetup-29-profiling-in-production" }, { settings: off, eventSlugs })).toBe(false);
  });

  it("adds noindex, follow to a demo page's metadata and nothing else", () => {
    const meta = { title: "X", alternates: { canonical: "https://myotherapp.in/clubs/x" } };
    expect(unlessDemo(meta, true)).toEqual({ ...meta, robots: { index: false, follow: true } });
    expect(unlessDemo(meta, false)).toBe(meta);
  });
});
