import { describe, expect, it } from "vitest";
import { addMonths, dayName, dayRange, eventDays, isDay, istDay, lastOfMonth, monthLabel, monthWeeks, rangeLabel, shiftMonths, weekdayIndex } from "./days";

describe("days in India", () => {
  it("knows which day it is in India, whatever the clock says", () => {
    // 20:00 UTC on the 16th is 01:30 on the 17th in India.
    expect(istDay("2026-10-16T20:00:00Z")).toBe("2026-10-17");
    expect(istDay("nope")).toBeNull();
  });

  it("checks days and months, leap years included", () => {
    expect(isDay("2028-02-29")).toBe(true);
    expect(isDay("2026-02-29")).toBe(false);
    expect(isDay("2026-1-1")).toBe(false);
    expect(lastOfMonth("2028-02")).toBe("2028-02-29");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(shiftMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("lays a month out in weeks that start on a Monday", () => {
    const weeks = monthWeeks("2026-10");
    // 1 October 2026 is a Thursday.
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weekdayIndex("2026-10-19")).toBe(0);
  });

  it("says days and spans the short way, with the year only when it isn't this one", () => {
    const today = "2026-10-17";
    expect(rangeLabel("2026-10-17", "2026-10-17", today)).toBe("17 Oct");
    expect(rangeLabel("2026-10-17", "2026-10-24", today)).toBe("17–24 Oct");
    expect(rangeLabel("2026-10-28", "2026-11-03", today)).toBe("28 Oct – 3 Nov");
    expect(rangeLabel("2026-12-30", "2027-01-02", today)).toBe("30 Dec 2026 – 2 Jan 2027");
    expect(dayName("2026-10-17")).toBe("Saturday, 17 October 2026");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });

  it("puts picked ends in order and refuses more than a year", () => {
    expect(dayRange("2026-10-24", "2026-10-17")).toEqual({ from: "2026-10-17", to: "2026-10-24" });
    expect(dayRange("", "2026-10-24")).toEqual({ from: "2026-10-24", to: "2026-10-24" });
    expect(dayRange("2026-01-01", "2027-01-02")).toBeNull();
    expect(dayRange("x", "")).toBeNull();
  });

  it("finds the India days an event covers", () => {
    expect(eventDays({ starts_at: "2026-10-17T12:30:00Z", ends_at: "2026-10-19T08:00:00Z" })).toEqual(["2026-10-17", "2026-10-19"]);
    // Ending on the stroke of midnight India time does not spill into the next day.
    expect(eventDays({ starts_at: "2026-10-17T12:30:00Z", ends_at: "2026-10-17T18:30:00Z" })).toEqual(["2026-10-17", "2026-10-17"]);
    expect(eventDays({ starts_at: null })).toBeNull();
  });
});
