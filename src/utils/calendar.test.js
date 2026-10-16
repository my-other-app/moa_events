import { describe, expect, it } from "vitest";
import { buildIcs, calendarTimes, foldLine, googleCalendarUrl, icsFilename, icsHref, icsText, utcStamp } from "./calendar";

const start = new Date("2026-10-18T12:30:00Z");
const end = new Date("2026-10-18T15:30:00Z");

describe("add to calendar", () => {
  it("writes times in UTC, the way calendars read them", () => {
    expect(utcStamp(start)).toBe("20261018T123000Z");
    // An IST time with its offset lands on the same instant.
    expect(utcStamp(new Date("2026-10-18T18:00:00+05:30"))).toBe("20261018T123000Z");
  });

  it("gives an event with no end two hours, and ignores an end before the start", () => {
    expect(calendarTimes("2026-10-18T18:00:00+05:30", null).end.toISOString()).toBe("2026-10-18T14:30:00.000Z");
    expect(calendarTimes("2026-10-18T18:00:00+05:30", new Date("2026-10-18T10:00:00Z")).end.toISOString()).toBe("2026-10-18T14:30:00.000Z");
    expect(calendarTimes(null, null)).toBeNull();
    expect(calendarTimes("not a date", null)).toBeNull();
  });

  it("makes a Google Calendar link with the title, the times, the details and the place", () => {
    const url = new URL(googleCalendarUrl({ title: "Hack Night 04 & friends", start, end, details: "Bring a laptop", location: "Lab 3B, COEP" }));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Hack Night 04 & friends");
    expect(url.searchParams.get("dates")).toBe("20261018T123000Z/20261018T153000Z");
    expect(url.searchParams.get("details")).toBe("Bring a laptop");
    expect(url.searchParams.get("location")).toBe("Lab 3B, COEP");
  });

  it("escapes what .ics text fields can't hold as is", () => {
    expect(icsText("a, b; c\\d\nnext")).toBe("a\\, b\\; c\\\\d\\nnext");
    expect(icsText("line\r\nbreak")).toBe("line\\nbreak");
  });

  it("folds long lines at 75 bytes, counting multi-byte characters by their bytes", () => {
    const line = `DESCRIPTION:${"₹".repeat(60)}`;
    const folded = foldLine(line).split("\r\n");
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
    expect(foldLine("SHORT:line")).toBe("SHORT:line");
  });

  it("builds a whole .ics file with CRLF line ends", () => {
    const ics = buildIcs({ uid: "event-123@myotherapp.in", title: "Hack Night; 04", start, end, description: "Line one\nLine two", location: "Lab 3B, COEP", url: "https://myotherapp.in/events/hack-night-04", now: start });
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("DTSTART:20261018T123000Z");
    expect(lines).toContain("DTEND:20261018T153000Z");
    expect(lines).toContain("DTSTAMP:20261018T123000Z");
    expect(lines).toContain("SUMMARY:Hack Night\\; 04");
    expect(lines).toContain("DESCRIPTION:Line one\\nLine two");
    expect(lines).toContain("LOCATION:Lab 3B\\, COEP");
    expect(lines).toContain("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(icsHref(ics).startsWith("data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR")).toBe(true);
  });

  it("names the file after the event", () => {
    expect(icsFilename("hack-night-04")).toBe("hack-night-04.ics");
    expect(icsFilename("Hack Night: 04!")).toBe("hack-night-04.ics");
    expect(icsFilename("")).toBe("event.ics");
  });
});
