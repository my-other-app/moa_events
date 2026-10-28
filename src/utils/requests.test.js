import { describe, expect, it } from "vitest";
import { apiFailure } from "./ticketing";
import {
  approvalNote,
  clubName,
  confirmsEachPlace,
  describeRequestError,
  nobodyGoingLine,
  openRequests,
  parseApproval,
  parseRequest,
  parseRequestList,
  payButton,
  payLine,
  requestPath,
  requiresApproval,
  statusWord,
  tokenFromStatusUrl,
  underReviewNote,
} from "./requests";

/*
 * Registration approval (the club reviews every registration), as the site
 * reads the API: a request's shape (GET /registration-requests/{token}, and
 * each item of /mine), the register call's `approval`, the refusals, and
 * the words people read.
 */
const TOKEN = "Rq7abcdefghijklmnopqrstuvwxyz012";

/** GET /registration-requests/{token}, as the API sends it. */
const REQUEST = (over = {}) => ({
  id: "0b9f3c2a-1111-4c4c-9a9a-000000000001",
  status: "pending",
  event: {
    id: 123,
    slug: "hack-night-04",
    name: "Hack Night 04",
    event_datetime: "2026-11-08T18:00:00+05:30",
    poster: null,
    club: { name: "Circuit Society", slug: "circuit-society" },
  },
  ticket_type: { id: 3, name: "Student" },
  full_name: "Asha Rao",
  submitted_at: "2026-10-26T10:15:00+05:30",
  decided_at: null,
  decline_note: null,
  ticket_id: null,
  pay: null,
  ...over,
});

describe("a request, as the API sends it", () => {
  it("reads every field the status page and My tickets show", () => {
    expect(parseRequest(REQUEST({ token: TOKEN }))).toEqual({
      id: "0b9f3c2a-1111-4c4c-9a9a-000000000001",
      token: TOKEN,
      status: "pending",
      event: {
        id: 123,
        slug: "hack-night-04",
        name: "Hack Night 04",
        starts_at: "2026-11-08T18:00:00+05:30",
        location_name: null,
        is_online: false,
        poster: null,
        club: { name: "Circuit Society", slug: "circuit-society" },
      },
      ticketType: { id: 3, name: "Student" },
      fullName: "Asha Rao",
      submittedAt: "2026-10-26T10:15:00+05:30",
      decidedAt: null,
      declineNote: null,
      closedReason: null,
      ticketId: null,
      pay: null,
    });
  });

  it("reads why a closed one closed, and only for a closed one", () => {
    for (const reason of ["event_ended", "event_deleted", "event_cancelled", "registered_directly"]) {
      expect(parseRequest(REQUEST({ status: "closed", closed_reason: reason })).closedReason).toBe(reason);
    }
    expect(parseRequest(REQUEST({ status: "closed", closed_reason: "something_new" })).closedReason).toBeNull();
    expect(parseRequest(REQUEST({ status: "closed" })).closedReason).toBeNull();
    expect(parseRequest(REQUEST({ status: "pending", closed_reason: "event_ended" })).closedReason).toBeNull();
  });

  it("reads a confirmed paid request's pay link, and a ticket once registered", () => {
    const paying = parseRequest(
      REQUEST({
        status: "approved",
        pay: { amount: "199.0", pay_by: "2026-10-27T10:15:00+05:30", claim_token: "Cl4im-token-abcdefghijklmnop", claim_url: "https://myotherapp.in/claim/Cl4im-token-abcdefghijklmnop" },
      }),
    );
    expect(paying.pay).toEqual({
      amount: 199,
      payBy: "2026-10-27T10:15:00+05:30",
      claimToken: "Cl4im-token-abcdefghijklmnop",
      claimUrl: "https://myotherapp.in/claim/Cl4im-token-abcdefghijklmnop",
    });
    expect(parseRequest(REQUEST({ status: "approved", pay: { amount: 199 } })).pay).toBeNull();
    expect(parseRequest(REQUEST({ status: "approved", ticket_id: "MOA7Q4K2X" })).ticketId).toBe("MOA7Q4K2X");
    expect(parseRequest(REQUEST({ status: "declined", decline_note: "  Full up, sorry.  " })).declineNote).toBe("Full up, sorry.");
  });

  it("keeps a status it doesn't know as 'other', and takes the token from the status link", () => {
    expect(parseRequest(REQUEST({ status: "archived" })).status).toBe("other");
    expect(parseRequest(REQUEST({ status_url: `https://myotherapp.in/requests/${TOKEN}` })).token).toBe(TOKEN);
    expect(parseRequest(REQUEST({ token: "../../etc" })).token).toBeNull();
    expect(parseRequest(REQUEST()).token).toBeNull();
  });

  it("is null when it isn't a request", () => {
    expect(parseRequest(null)).toBeNull();
    expect(parseRequest({ status: "pending" })).toBeNull();
    expect(parseRequest(REQUEST({ event: { id: 1 } }))).toBeNull();
    expect(parseRequest(REQUEST({ ticket_type: null })).ticketType).toBeNull();
    expect(parseRequest(REQUEST({ event: { id: 1, name: "X", club: null } })).event.club).toBeNull();
  });

  it("reads /mine's items, and keeps only the open ones for My tickets", () => {
    const list = parseRequestList({
      items: [
        REQUEST({ id: "a" }),
        REQUEST({ id: "b", status: "approved", pay: { amount: 199, pay_by: null, claim_token: "Cl4im-token-abcdefghijklmnop" } }),
        REQUEST({ id: "c", status: "approved", ticket_id: "MOA1" }),
        REQUEST({ id: "d", status: "declined" }),
        { nonsense: true },
      ],
    });
    expect(list.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(openRequests(list).map((r) => r.id)).toEqual(["a", "b"]);
    expect(parseRequestList([REQUEST()])).toHaveLength(1);
    expect(parseRequestList(null)).toEqual([]);
    expect(openRequests(null)).toEqual([]);
  });
});

describe("the request's address", () => {
  it("is /requests/{token}, from a token or from the API's status link", () => {
    expect(requestPath(TOKEN)).toBe(`/requests/${TOKEN}`);
    expect(requestPath(null)).toBeNull();
    expect(requestPath("short")).toBeNull();
    expect(tokenFromStatusUrl(`https://myotherapp.in/requests/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromStatusUrl(`/requests/${TOKEN}?from=email`)).toBe(TOKEN);
    expect(tokenFromStatusUrl("https://myotherapp.in/events/x")).toBeNull();
    expect(tokenFromStatusUrl("not a url at all")).toBeNull();
  });
});

describe("the register call's answer", () => {
  it("reads `approval`: a request, not a registration", () => {
    const data = {
      approval: { id: "r1", status: "pending", submitted_at: "2026-10-26T10:15:00+05:30", token: TOKEN, status_url: `https://myotherapp.in/requests/${TOKEN}` },
      event_registration_id: null,
    };
    expect(parseApproval(data)).toEqual({ id: "r1", status: "pending", submittedAt: "2026-10-26T10:15:00+05:30", token: TOKEN, path: `/requests/${TOKEN}` });
    expect(parseApproval({ approval: { id: "r1", status_url: `https://myotherapp.in/requests/${TOKEN}` } }).path).toBe(`/requests/${TOKEN}`);
    expect(parseApproval({ approval: { id: "r1" } }).path).toBeNull();
  });

  it("reads a request sent again, signed out, for an address with one open: no link (it was emailed)", () => {
    expect(parseApproval({ approval: { id: "r1", status: "pending", submitted_at: "2026-10-26T10:15:00+05:30", token: null, status_url: null } })).toEqual({
      id: "r1",
      status: "pending",
      submittedAt: "2026-10-26T10:15:00+05:30",
      token: null,
      path: null,
    });
  });

  it("is null for a registration", () => {
    expect(parseApproval({ ticket_id: "MOA1", pay_amount: 0 })).toBeNull();
    expect(parseApproval({ approval: null })).toBeNull();
    expect(parseApproval(null)).toBeNull();
  });

  it("reads a pay link only when one comes with it", () => {
    const pay = { amount: "199", pay_by: "2026-10-27T10:15:00+05:30", claim_token: "Cl4im-token-abcdefghijklmnop" };
    expect(parseApproval({ approval: { id: "r1", status: "approved", token: TOKEN, pay } }).pay).toEqual({
      amount: 199,
      payBy: "2026-10-27T10:15:00+05:30",
      claimToken: "Cl4im-token-abcdefghijklmnop",
    });
    expect(parseApproval({ approval: { id: "r1", status: "approved", token: TOKEN, pay: { amount: 199 } } })).not.toHaveProperty("pay");
  });
});

describe("whether the club reviews every registration", () => {
  it("takes the form's own read first, then its ticketing, then the event page", () => {
    expect(requiresApproval({ requires_approval: true })).toBe(true);
    expect(requiresApproval({ requires_approval: false }, { requires_approval: true })).toBe(false);
    expect(requiresApproval({ ticketing: { requires_approval: true } })).toBe(true);
    expect(requiresApproval(null, { requires_approval: true })).toBe(true);
    expect(requiresApproval({}, {})).toBe(false);
    expect(requiresApproval(null, null)).toBe(false);
  });

  it("names the club, or says the club", () => {
    expect(clubName({ name: "Circuit Society" })).toBe("Circuit Society");
    expect(clubName(null)).toBe("The club");
    expect(clubName({ name: " " }, { start: false })).toBe("the club");
    expect(approvalNote({ name: "Circuit Society" })).toBe("Circuit Society reviews every registration and emails tickets to the people it confirms.");
    expect(approvalNote(null)).toBe("The club reviews every registration and emails tickets to the people it confirms.");
    expect(underReviewNote({ name: "Circuit Society" })).toBe("Circuit Society reviews every registration. If yours is confirmed, your ticket will come by email.");
    expect(underReviewNote(null)).toBe("The club reviews every registration. If yours is confirmed, your ticket will come by email.");
  });
});

describe("the words people read", () => {
  const pay = { amount: 199, payBy: "2026-10-27T10:15:00+05:30", claimToken: "Cl4im-token-abcdefghijklmnop" };
  it("gives each status its chip", () => {
    const r = (over) => parseRequest(REQUEST(over));
    expect(statusWord(r({ status: "pending" }))).toBe("Under review");
    expect(statusWord(r({ status: "approved", ticket_id: "MOA1" }))).toBe("Confirmed");
    expect(statusWord(r({ status: "approved" }))).toBe("Confirmed");
    expect(statusWord(r({ status: "approved", pay: { amount: 199, pay_by: "2026-10-27T10:15:00+05:30", claim_token: pay.claimToken } }))).toBe(
      "Confirmed · pay by Tue, 27 Oct · 10:15 AM IST to get your ticket",
    );
    expect(statusWord(r({ status: "approved", pay: { amount: 199, pay_by: null, claim_token: pay.claimToken } }))).toBe("Confirmed · pay to get your ticket");
    expect(statusWord(r({ status: "declined" }))).toBe("Not confirmed");
    expect(statusWord(r({ status: "withdrawn" }))).toBe("Cancelled");
    expect(statusWord(r({ status: "lapsed" }))).toBe("Expired");
    expect(statusWord(r({ status: "closed", closed_reason: "registered_directly" }))).toBe("Closed");
    expect(statusWord(r({ status: "archived" }))).toBeNull();
    expect(statusWord(null)).toBeNull();
  });

  it("says what a confirmed paid ticket costs and by when", () => {
    expect(payLine(pay)).toBe("Pay ₹199 by Tue, 27 Oct · 10:15 AM IST to get your ticket.");
    expect(payLine({ ...pay, payBy: null })).toBe("Pay ₹199 to get your ticket.");
    expect(payLine(null)).toBe("Pay to get your ticket.");
    expect(payButton(pay)).toBe("Pay ₹199");
    expect(payButton({ ...pay, amount: 0 })).toBe("Pay now");
    expect(payButton(undefined)).toBe("Pay now");
  });
});

describe("what a refusal means", () => {
  const fail = (status, data = {}, headers = {}) => apiFailure({ response: { status, data, headers } });
  it("sorts them for the status page", () => {
    expect(describeRequestError(fail(404, { error_code: "REQUEST_NOT_FOUND" })).kind).toBe("gone");
    expect(describeRequestError(fail(429))).toMatchObject({ kind: "limit", message: "Too many tries in a row. Wait a minute, then try again." });
    expect(describeRequestError(apiFailure(new Error("Network Error"))).kind).toBe("network");
    expect(describeRequestError(fail(409, { error_code: "REQUEST_NOT_PENDING" })).kind).toBe("changed");
    // REQUEST_NOT_WITHDRAWABLE carries the request as it stands.
    const now = describeRequestError(fail(409, { error_code: "REQUEST_NOT_WITHDRAWABLE", errors: { request: REQUEST({ status: "approved", ticket_id: "MOA1" }) } }));
    expect(now).toMatchObject({ kind: "changed", request: { status: "approved", ticketId: "MOA1" } });
    expect(describeRequestError(fail(500)).kind).toBe("message");
  });
});

describe("the public line in place of \"Be the first to register\"", () => {
  it("names the club that reviews every registration, and never a number", () => {
    expect(confirmsEachPlace({ name: "Circuit Society" })).toBe("Circuit Society reviews every registration");
    expect(confirmsEachPlace(null)).toBe("The club reviews every registration");
  });

  it("is the old line for an event without the setting (or an API that doesn't say)", () => {
    expect(nobodyGoingLine({ requires_approval: true }, { name: "Circuit Society" })).toBe("Circuit Society reviews every registration");
    expect(nobodyGoingLine({ requires_approval: false }, { name: "Circuit Society" })).toBe("Be the first to register");
    expect(nobodyGoingLine({}, null)).toBe("Be the first to register");
    expect(nobodyGoingLine(null, null)).toBe("Be the first to register");
  });
});
