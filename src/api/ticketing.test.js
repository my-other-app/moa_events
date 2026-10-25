import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { paymentsApi } from "./payments";
import { ticketingApi } from "./ticketing";
import { accessToken, enableSignIn, resetAuth, signInAs } from "@/test/auth";

/** Signed in, as the site has it: sign-in on, a session in storage. */
const signedIn = (o) => {
  enableSignIn();
  signInAs(o);
};

/*
 * Ticket types, discount codes and the waiting list (the API's
 * docs/TICKETING.md), as the browser calls them: the address, what is sent,
 * which token goes along, and how a refusal comes back. The API is a fake
 * adapter on the real client: nothing leaves the test.
 */
let seen;
const reply = (config, status, data, headers = {}) => {
  if (status < 400) return { data, status, statusText: "OK", headers, config };
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data, headers, config };
  throw error;
};

function serve(answer) {
  apiClient.defaults.adapter = vi.fn(async (config) => {
    seen.push({
      method: config.method,
      url: config.url,
      params: config.params,
      auth: config.headers.Authorization,
      data: config.data ? JSON.parse(config.data) : undefined,
    });
    return answer(config);
  });
}

beforeEach(() => {
  seen = [];
  resetAuth();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  localStorage.clear();
  resetAuth();
  delete apiClient.defaults.adapter;
  vi.restoreAllMocks();
});

const TYPES = {
  types: [{ id: 12, name: "Early bird", price: 199, is_free: false, status: "on_sale", available: 3 }],
  requires_choice: false,
  available: 3,
  sold_out: false,
  waitlist: { enabled: true, offer_hours: 12 },
  viewer_waitlist: [],
};

describe("the event's tickets", () => {
  it("are read for the event, a hidden type when a link names one, as nobody when signed out (never a guest's token)", async () => {
    localStorage.setItem("access_token", "a-guest");
    serve((config) => reply(config, 200, TYPES));
    const t = await ticketingApi.types("hack-night-04", { ticketType: 14 });
    expect(seen).toEqual([{ method: "get", url: "/api/v1/events/hack-night-04/ticket-types", params: { ticket_type: 14 }, auth: undefined, data: undefined }]);
    expect(t.types[0]).toMatchObject({ id: 12, name: "Early bird", available: 3 });
    expect(t.waitlist.offerHours).toBe(12);
  });

  it("go with the account's token when signed in (its own places in line come back)", async () => {
    const token = accessToken();
    signedIn({ access: token });
    serve((config) => reply(config, 200, { ...TYPES, viewer_waitlist: [{ id: "w1", ticket_type_id: 12, status: "waiting", position: 2 }] }));
    const t = await ticketingApi.types(7);
    expect(seen[0]).toMatchObject({ url: "/api/v1/events/7/ticket-types", params: undefined, auth: `Bearer ${token}` });
    expect(t.viewerWaitlist[0]).toMatchObject({ ticketTypeId: 12, position: 2 });
  });

  it("are null from a server without them", async () => {
    serve((config) => reply(config, 200, {}));
    expect(await ticketingApi.types(7)).toBeNull();
  });
});

describe("checking a code", () => {
  it("sends the code and the ticket, with no token, and hands back the price it makes", async () => {
    signedIn();
    serve((config) => reply(config, 200, { code: "EARLY20", ticket_type_id: 12, price: 199, discount: 39.8, amount: 159.2, free: false }));
    const r = await ticketingApi.checkCode(7, { code: "early20", ticketTypeId: 12, email: "asha@example.org" });
    expect(seen).toEqual([
      { method: "post", url: "/api/v1/events/7/discount-codes/check", params: undefined, auth: undefined, data: { code: "early20", ticket_type_id: 12, email: "asha@example.org" } },
    ]);
    expect(r.amount).toBe(159.2);
  });

  it("is refused with the code's reason, and a 429 with how long to wait", async () => {
    serve((config) => reply(config, 409, { message: "Expired", error_code: "DISCOUNT_CODE_EXPIRED", errors: { discount_code: "Expired" } }));
    await expect(ticketingApi.checkCode(7, { code: "OLD" })).rejects.toMatchObject({ status: 409, code: "DISCOUNT_CODE_EXPIRED", network: false });
    serve((config) => reply(config, 429, { message: "Too many" }, { "retry-after": "42" }));
    await expect(ticketingApi.checkCode(7, { code: "OLD" })).rejects.toMatchObject({ status: 429, retryAfter: 42 });
  });
});

describe("the waiting list", () => {
  it("is joined with the ticket and the contact given, WhatsApp only with a phone", async () => {
    serve((config) => reply(config, 201, { id: "w1", ticket_type_id: 12, ticket_type_name: "Early bird", status: "waiting", position: 3, created: true }));
    const entry = await ticketingApi.joinWaitlist(7, { ticketTypeId: 12, name: "Asha Rao", email: "asha@example.org", whatsapp: true });
    expect(seen[0]).toMatchObject({
      method: "post",
      url: "/api/v1/events/7/waitlist",
      auth: undefined,
      data: { ticket_type_id: 12, full_name: "Asha Rao", email: "asha@example.org", whatsapp_opt_in: false },
    });
    expect(entry).toMatchObject({ id: "w1", position: 3, created: true });
  });

  it("is read and left as the signed-in person", async () => {
    const token = accessToken();
    signedIn({ access: token });
    serve((config) => (config.method === "get" ? reply(config, 200, [{ id: "w1", ticket_type_id: 12, status: "offered", offer_expires_at: "2026-11-02T18:00:00+05:30" }]) : reply(config, 200, { left: 1 })));
    expect((await ticketingApi.myWaitlist(7))[0]).toMatchObject({ status: "offered", offerExpiresAt: "2026-11-02T18:00:00+05:30" });
    expect(await ticketingApi.leaveWaitlist(7)).toEqual({ left: 1 });
    expect(seen.map((s) => [s.method, s.url, s.auth])).toEqual([
      ["get", "/api/v1/events/7/waitlist/me", `Bearer ${token}`],
      ["delete", "/api/v1/events/7/waitlist/me", `Bearer ${token}`],
    ]);
  });
});

describe("a claim link", () => {
  const OFFER = {
    id: "o1",
    status: "offered",
    event: { id: 7, slug: "hack-night-04", name: "Hack Night 04", event_datetime: "2026-11-08T18:00:00+05:30" },
    ticket_type: { id: 12, name: "Early bird", price: 199 },
    full_name: "Asha K",
    needs_payment: true,
  };

  it("reads its offer with no token, and a missing one is a 404", async () => {
    signedIn();
    serve((config) => reply(config, 200, OFFER));
    expect(await ticketingApi.offer("tok_abcdefghijklmnop")).toMatchObject({ status: "offered", ticketType: { name: "Early bird" } });
    expect(seen[0]).toMatchObject({ url: "/api/v1/waitlist/offers/tok_abcdefghijklmnop", auth: undefined });
    serve((config) => reply(config, 404, { message: "This link is not valid.", error_code: "OFFER_NOT_FOUND" }));
    await expect(ticketingApi.offer("tok_gone_gone_gone_gone")).rejects.toMatchObject({ status: 404, code: "OFFER_NOT_FOUND" });
  });

  it("claimed signed out, keeps the guest's session to pay with, as the public form does", async () => {
    serve((config) => reply(config, 200, { ticket_id: "MOA9", pay_amount: 199, event_registration_id: "r1", auth_token: { access_token: "guest-a", refresh_token: "guest-r" } }));
    const data = await ticketingApi.claim("tok_abcdefghijklmnop", { full_name: "Asha K" });
    expect(data.event_registration_id).toBe("r1");
    expect(seen[0]).toMatchObject({ method: "post", url: "/api/v1/waitlist/offers/tok_abcdefghijklmnop/claim", data: { full_name: "Asha K" } });
    expect(localStorage.getItem("access_token")).toBe("guest-a");
  });

  it("claimed signed in, never swaps the account's session for a guest's", async () => {
    signedIn();
    serve((config) => reply(config, 200, { ticket_id: "MOA9", pay_amount: 199, event_registration_id: "r1", auth_token: { access_token: "guest-a", refresh_token: "guest-r" } }));
    await ticketingApi.claim("tok_abcdefghijklmnop", { full_name: "Asha K" });
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("is declined with no token", async () => {
    signedIn();
    serve((config) => reply(config, 200, { declined: true }));
    expect(await ticketingApi.decline("tok_abcdefghijklmnop")).toEqual({ declined: true });
    expect(seen[0]).toMatchObject({ method: "post", url: "/api/v1/waitlist/offers/tok_abcdefghijklmnop/decline", auth: undefined });
  });

  it("pays as the guest a claim made for another address than the account's", async () => {
    const token = accessToken();
    signedIn({ access: token });
    serve((config) => reply(config, 200, { razorpay_order_id: "order_1", amount: 19900 }));
    await paymentsApi.createPaymentOrder("7", "r1", { token: "guest-a" });
    await paymentsApi.createPaymentOrder("7", "r2");
    expect(seen.map((s) => [s.url, s.params, s.auth])).toEqual([
      ["/api/v1/payments/orders", { checkout: 2 }, "Bearer guest-a"],
      ["/api/v1/payments/orders", { checkout: 2 }, `Bearer ${token}`],
    ]);
  });
});
