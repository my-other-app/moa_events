import { describe, expect, it } from "vitest";
import { parseEventPage } from "@/api/parse";
import { fullEvent } from "@/test/eventFixture";
import { availability, eventStatus } from "@/seo/jsonld";
import { cancelledLine, isCancelled, parseCancellation } from "./cancelled";
import { registerState } from "./eventpage";
import { statusPill } from "./format";

/*
 * A cancelled event (the API's club tools): its page still opens and says
 * so, `status: "cancelled"` with `cancellation: {reason, cancelled_at}`.
 */
const cancelled = (over = {}) =>
  parseEventPage(
    fullEvent({
      event: {
        ...fullEvent().event,
        status: "cancelled",
        registration_open: true,
        cancellation: { reason: "The venue flooded.", cancelled_at: "2026-10-12T10:00:00+05:30" },
        ...over,
      },
    }),
  ).event;

describe("a cancelled event's page", () => {
  it("keeps the status and the club's reason; registration is closed whatever else is said", () => {
    const e = cancelled();
    expect(e.status).toBe("cancelled");
    expect(e.registration_open).toBe(false);
    expect(e.cancellation).toEqual({ reason: "The venue flooded.", cancelled_at: "2026-10-12T10:00:00+05:30" });
    expect(isCancelled(e)).toBe(true);
  });

  it("says it is cancelled even without a reason, and other events carry nothing new", () => {
    expect(cancelled({ cancellation: null }).cancellation).toEqual({ reason: null, cancelled_at: null });
    expect(parseEventPage(fullEvent()).event).not.toHaveProperty("cancellation");
    expect(parseEventPage(fullEvent()).event.status).toBe("upcoming");
  });

  it("puts the register button out of reach, and the pill on the poster", () => {
    const state = registerState(cancelled());
    expect(state).toEqual({ kind: "cancelled", label: "Event cancelled", note: "Cancelled on 12 Oct 2026" });
    expect(state.href).toBeUndefined();
    expect(statusPill(cancelled())).toEqual({ label: "Cancelled", tone: "cancelled" });
  });

  it("tells search engines it was cancelled", () => {
    expect(eventStatus(cancelled())).toBe("EventCancelled");
    expect(availability(cancelled({ reg_opens_at: "2099-01-01T10:00:00+05:30" }))).toBe("SoldOut");
  });
});

describe("the cancellation itself", () => {
  it("reads only what makes sense", () => {
    expect(parseCancellation({ reason: "  Rain  ", cancelled_at: "2026-10-12T10:00:00+05:30" })).toEqual({ reason: "Rain", cancelled_at: "2026-10-12T10:00:00+05:30" });
    expect(parseCancellation({ reason: "", cancelled_at: "not a date" })).toEqual({ reason: null, cancelled_at: null });
    expect(parseCancellation(null)).toBeNull();
    expect(parseCancellation([])).toBeNull();
  });

  it("says when", () => {
    expect(cancelledLine({ cancelled_at: "2026-10-12T10:00:00+05:30" })).toBe("Cancelled on 12 Oct 2026");
    expect(cancelledLine(null)).toBe("Cancelled by the organisers");
  });
});
