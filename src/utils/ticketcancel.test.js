import { describe, expect, it } from "vitest";
import { describeCancelError, isCancelToken, parseCancelInfo, refusalWords } from "./ticketcancel";
import { maskText } from "@/sentry/options";

/* "Can't come? Give your ticket back" (feature-register/ticket-self-cancel-contract.md), read and said. */
const INFO = (over = {}) => ({
  event: { id: 68, name: "Hack Night 04", slug: "hack-night-04", starts_at: "2026-12-08T18:00:00+05:30", poster: null },
  attendee_name: "Asha Rao",
  ticket_code_masked: "MOA-••••-XY7QZ",
  cancellable: true,
  organiser_email: "hello@circuit.example.org",
  ...over,
});

describe("the link's answer", () => {
  it("reads a ticket that can be given back, and one that can't, with its reason", () => {
    expect(parseCancelInfo(INFO())).toMatchObject({ attendeeName: "Asha Rao", ticketCode: "MOA-••••-XY7QZ", cancellable: true, reason: null, organiserEmail: "hello@circuit.example.org" });
    expect(parseCancelInfo(INFO({ cancellable: false, reason: "paid" }))).toMatchObject({ cancellable: false, reason: "paid" });
    // A reason it doesn't know is no good link.
    expect(parseCancelInfo(INFO({ cancellable: false, reason: "weird" })).reason).toBe("invalid");
    expect(parseCancelInfo(INFO({ organiser_email: "not an email" })).organiserEmail).toBeNull();
    expect(parseCancelInfo({})).toBeNull();
  });

  it("takes only URL-safe tokens", () => {
    expect(isCancelToken("eyJyIjoxMjN9.c2lnbmF0dXJlLXZhbHVl")).toBe(true);
    expect(isCancelToken("short")).toBe(false);
    expect(isCancelToken("abc<script>defghijklmnop")).toBe(false);
  });
});

describe("refusals", () => {
  it("are read from the 409's code, and 404 is no link of ours (or an API without the route)", () => {
    expect(describeCancelError({ status: 409, code: "PAID" })).toEqual({ kind: "reason", reason: "paid" });
    expect(describeCancelError({ status: 409, code: "already_cancelled" })).toEqual({ kind: "reason", reason: "already_cancelled" });
    expect(describeCancelError({ status: 409, errors: { reason: "checked_in" } })).toEqual({ kind: "reason", reason: "checked_in" });
    expect(describeCancelError({ status: 409 })).toEqual({ kind: "reason", reason: "already_cancelled" });
    expect(describeCancelError({ status: 404 })).toEqual({ kind: "invalid" });
    expect(describeCancelError({ status: 429 }).kind).toBe("limit");
    expect(describeCancelError({ network: true }).kind).toBe("network");
  });

  it("are said in plain words; paid points to the organiser for a refund", () => {
    expect(refusalWords("paid", "hello@circuit.example.org").text).toBe(
      "Paid tickets can't be given back here, and nothing is refunded automatically. Write to hello@circuit.example.org for a refund.",
    );
    expect(refusalWords("paid").text).toMatch(/Write to the organisers for a refund/);
    for (const r of ["started", "checked_in", "already_cancelled", "not_allowed", "invalid"]) expect(refusalWords(r).title).toBeTruthy();
  });
});

describe("Sentry", () => {
  it("masks the link's token on the site and the API, and still masks a ticket's id", () => {
    expect(maskText("https://myotherapp.in/tickets/cancel?t=eyJyIjoxMjN9.c2lnbmF0dXJl")).toBe("https://myotherapp.in/tickets/cancel?t=[code]");
    expect(maskText("https://myotherapp.in/tickets/cancel?utm_source=email&t=eyJyIjoxMjN9.c2lnbmF0dXJl#x")).toBe("https://myotherapp.in/tickets/cancel?utm_source=email&t=[code]#x");
    expect(maskText("POST https://api.myotherapp.in/api/v1/tickets/cancel/eyJyIjoxMjN9.c2lnbmF0dXJl")).toBe("POST https://api.myotherapp.in/api/v1/tickets/cancel/[code]");
    expect(maskText("https://myotherapp.in/tickets/MOA-1A2B3-XY7QZ")).toBe("https://myotherapp.in/tickets/[code]");
    expect(maskText("/tickets/cancel-1")).toBe("/tickets/[code]");
  });
});
