import { describe, expect, it } from "vitest";
import { apiFailure } from "./ticketing";
import {
  approvalNote,
  clubName,
  describeRequestError,
  openRequests,
  parseApproval,
  parseRequest,
  parseRequestList,
  requestPath,
  requiresApproval,
  tokenFromStatusUrl,
} from "./requests";

/*
 * Registration approval (the club confirms each place), as the site reads
 * the API: a request's shape (GET /registration-requests/{token}, and each
 * item of /mine), the register call's `approval`, and the refusals.
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
      ticketId: null,
      pay: null,
    });
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
});

describe("whether the club confirms each place", () => {
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
    expect(approvalNote({ name: "Circuit Society" })).toBe("Circuit Society confirms each place. You’ll get your ticket by email when they do.");
    expect(approvalNote(null)).toBe("The club confirms each place. You’ll get your ticket by email when they do.");
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
