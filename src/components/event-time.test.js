import { describe, expect, it } from "vitest";

// The event page shows the start in India time, whatever the visitor's clock.
const IST_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

describe("the event start time", () => {
  it("reads an IST timestamp as it is", () => {
    expect(IST_TIME.format(new Date("2026-10-18T17:11:35+05:30"))).toBe("5:11 PM");
  });
  it("turns a UTC timestamp into India time", () => {
    expect(IST_TIME.format(new Date("2026-10-18T12:30:00Z"))).toBe("6:00 PM");
  });
});
