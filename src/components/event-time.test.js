import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDate, formatTime, formatWhen, timeAgo, TZ } from "@/utils/format";
import { dateTile, scheduleLines, shortDate, whenLine } from "@/utils/eventpage";

/*
 * The site's own time helpers (src/utils/format.js, src/utils/eventpage.js):
 * every time is said in India time, the way the clubs set it, whatever the
 * offset the API wrote it in and whatever the visitor's clock. The clock
 * here is California's, so a helper that leaned on it would show it.
 */
const VISITOR_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  process.env.TZ = VISITOR_TZ;
});

describe("the event start time", () => {
  it("is India's", () => {
    expect(TZ).toBe("Asia/Kolkata");
    // The visitor's clock really is elsewhere: 12:30 UTC is 5:30 AM there.
    expect(new Date("2026-10-18T12:30:00Z").getHours()).toBe(5);
  });

  it("reads an IST timestamp as it is", () => {
    expect(formatTime("2026-10-18T17:11:35+05:30")).toBe("5:11 PM");
    expect(formatWhen("2026-10-18T17:11:35+05:30")).toBe("Sun, 18 Oct · 5:11 PM");
  });

  it("turns a UTC timestamp (Z or +00:00) into India time", () => {
    expect(formatTime("2026-10-18T12:30:00Z")).toBe("6:00 PM");
    expect(formatTime("2026-10-18T12:30:00+00:00")).toBe("6:00 PM");
    expect(formatWhen("2026-10-18T12:30:00Z")).toBe("Sun, 18 Oct · 6:00 PM");
    expect(formatDate("2026-10-18T12:30:00Z")).toBe("18 Oct 2026");
  });

  it("puts a start after India's midnight on India's day, not UTC's", () => {
    // 19:00 UTC on the 18th is 12:30 AM on the 19th in India.
    const late = "2026-10-18T19:00:00Z";
    expect(formatTime(late)).toBe("12:30 AM");
    expect(formatWhen(late)).toBe("Mon, 19 Oct · 12:30 AM");
    expect(formatDate(late)).toBe("19 Oct 2026");
    expect(shortDate(late)).toBe("19 Oct");
    expect(dateTile(late)).toEqual({ month: "OCT", day: "19" });
  });

  it("says nothing for a missing or broken time", () => {
    for (const bad of [null, undefined, "", "garbage"]) {
      expect(formatTime(bad)).toBe("");
      expect(formatWhen(bad)).toBe("");
      expect(formatDate(bad)).toBe("");
      expect(shortDate(bad)).toBe("");
      expect(whenLine(bad)).toBe("");
      expect(dateTile(bad)).toBeNull();
    }
  });
});

describe("when, in a line", () => {
  it("adds the year only when it isn't this one (India's)", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(whenLine("2026-10-18T12:30:00Z", now)).toBe("Sun, 18 Oct · 6:00 PM");
    expect(whenLine("2027-01-09T04:30:00Z", now)).toBe("Sat, 9 Jan · 10:00 AM · 2027");
    // New Year's Eve in UTC is already New Year's Day in India.
    expect(whenLine("2026-12-31T19:00:00Z", new Date("2027-01-05T00:00:00Z"))).toBe("Fri, 1 Jan · 12:30 AM");
  });

  it("runs an evening over midnight as two days, both ends in India time", () => {
    const evening = { starts_at: "2026-10-18T17:00:00Z", duration_hours: 3 };
    expect(scheduleLines(evening, new Date("2026-10-16T12:00:00Z"))).toEqual({ day: "Sun, 18 Oct – Mon, 19 Oct", time: "Starts 10:30 PM · ends 1:30 AM IST" });
  });

  it("keeps an evening inside India's day as one", () => {
    const evening = { starts_at: "2026-10-18T12:30:00Z", ends_at: "2026-10-18T15:30:00Z" };
    expect(scheduleLines(evening, new Date("2026-10-16T12:00:00Z"))).toEqual({ day: "Sunday, 18 October", time: "6:00 PM – 9:00 PM IST" });
  });
});

describe("how long ago", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");

  it("counts minutes, hours and days, then gives the date", () => {
    expect(timeAgo("2026-10-16T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-10-16T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-16T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-14T12:00:00Z", now)).toBe("2d ago");
    expect(timeAgo("2026-10-01T09:00:00Z", now)).toBe("1 Oct");
    expect(timeAgo("2025-10-01T09:00:00Z", now)).toBe("1 Oct 2025");
  });

  it("never says the future is ago", () => {
    expect(timeAgo("2026-10-16T12:05:00Z", now)).toBe("just now");
  });

  it("dates and years by India's calendar", () => {
    // 31 Dec 19:00 UTC is 1 Jan in India: this year's, so no year.
    expect(timeAgo("2026-12-31T19:00:00Z", Date.parse("2027-01-09T00:00:00Z"))).toBe("1 Jan");
    expect(timeAgo("2026-12-20T19:00:00Z", Date.parse("2027-01-09T00:00:00Z"))).toBe("21 Dec 2026");
  });
});
