import { describe, expect, it } from "vitest";
import { eventEnd, eventPath, eventUrl, registerState, scheduleLines, seatsLeft, summary } from "./eventpage";

const event = (over = {}) => ({
  id: 123,
  slug: "hack-night-04",
  starts_at: "2026-10-18T18:00:00+05:30",
  ends_at: null,
  duration_hours: null,
  capacity: null,
  going: 0,
  seats_left: null,
  status: "upcoming",
  registration_open: true,
  reg_opens_at: null,
  reg_closes_at: null,
  ...over,
});
const NOW = new Date("2026-10-16T12:00:00Z").getTime();

describe("the event page's arithmetic", () => {
  it("addresses an event by its slug, or its id while it has none", () => {
    expect(eventPath(event())).toBe("/events/hack-night-04");
    expect(eventPath(event({ slug: null }), "register")).toBe("/events/123/register");
    expect(eventUrl(event())).toBe("https://myotherapp.in/events/hack-night-04");
  });

  it("works out the end from the duration when there is no end", () => {
    expect(eventEnd(event({ duration_hours: 3 })).toISOString()).toBe("2026-10-18T15:30:00.000Z");
    expect(eventEnd(event())).toBeNull();
  });

  it("says when in India time, over one day or several", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(scheduleLines(event({ ends_at: "2026-10-18T21:00:00+05:30" }), now)).toEqual({ day: "Sunday, 18 October", time: "6:00 PM – 9:00 PM IST" });
    expect(scheduleLines(event({ ends_at: "2026-10-19T13:00:00+05:30" }), now)).toEqual({ day: "Sun, 18 Oct – Mon, 19 Oct", time: "Starts 6:00 PM · ends 1:00 PM IST" });
    expect(scheduleLines(event(), new Date("2025-06-01T00:00:00Z")).day).toBe("Sunday, 18 October 2026");
    expect(scheduleLines(event({ starts_at: null }), now)).toBeNull();
  });

  it("counts seats only when there is a limit", () => {
    expect(seatsLeft(event())).toBeNull();
    expect(seatsLeft(event({ capacity: 60, going: 40 }))).toBe(20);
    expect(seatsLeft(event({ capacity: 60, going: 40, seats_left: 5 }))).toBe(5);
  });

  it("picks the register button's state from the status and whether registration is open", () => {
    const kind = (over) => registerState(event(over), NOW);
    expect(kind({})).toMatchObject({ kind: "open", label: "Register", href: "/events/hack-night-04/register" });
    expect(kind({ status: "closing_soon", reg_closes_at: "2026-10-17T23:59:00+05:30" })).toMatchObject({ kind: "open", tone: "warn", note: "Closing soon · closes Sat, 17 Oct · 11:59 PM" });
    expect(kind({ capacity: 60, seats_left: 3 })).toMatchObject({ kind: "open", note: "Only 3 seats left", tone: "warn" });
    expect(kind({ registration_open: false, reg_opens_at: "2026-10-25T10:00:00+05:30" })).toMatchObject({ kind: "soon", label: "Registration opens 25 Oct" });
    expect(kind({ registration_open: false, reg_opens_at: "2026-10-01T10:00:00+05:30" })).toMatchObject({ kind: "closed", label: "Registration closed" });
    expect(kind({ registration_open: false })).toMatchObject({ kind: "closed" });
    expect(kind({ status: "full" })).toMatchObject({ kind: "full", label: "Event full" });
    expect(kind({ capacity: 60, seats_left: 0 })).toMatchObject({ kind: "full" });
    expect(kind({ status: "live" })).toMatchObject({ kind: "live", eyebrow: "Happening now", href: "/events/hack-night-04/live", also: { label: "Register" } });
    expect(kind({ status: "live", registration_open: false }).also).toBeNull();
    expect(kind({ status: "ended" })).toMatchObject({ kind: "ended", label: "This event has ended", note: "Ended 18 Oct 2026" });
  });

  it("shortens text for previews at a word", () => {
    expect(summary("short")).toBe("short");
    expect(summary("one two three four five six", 15)).toBe("one two three…");
    expect(summary("  lines\n\nand   spaces ")).toBe("lines and spaces");
  });
});
