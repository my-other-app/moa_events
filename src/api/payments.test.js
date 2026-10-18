import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { paymentsApi } from "./payments";

/**
 * Making the order: every one says `checkout=2`, so the server hands back an
 * order on a club's own Razorpay account (with that account's key_id) instead
 * of refusing it. The body is the one it always was.
 */
let seen;
const reply = (config, status, data) => {
  if (status < 400) return { data, status, statusText: "OK", headers: {}, config };
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data, config };
  throw error;
};

function serve(answer) {
  apiClient.defaults.adapter = vi.fn(async (config) => {
    seen.push({ method: config.method, url: config.url, params: config.params, uri: apiClient.getUri(config), data: config.data });
    return answer(config);
  });
}

beforeEach(() => {
  seen = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  localStorage.clear();
  delete apiClient.defaults.adapter;
  vi.restoreAllMocks();
});

describe("paymentsApi.createPaymentOrder", () => {
  it("asks for the order with checkout=2 and the same body as ever, and returns key_id and gateway", async () => {
    const order = { id: 9, razorpay_order_id: "order_1", amount: 25000, currency: "INR", status: "created", key_id: "rzp_test_club_not_real", gateway: "club" };
    serve((config) => reply(config, 200, order));

    const data = await paymentsApi.createPaymentOrder("62", "reg-1");

    expect(data).toEqual(order);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("post");
    expect(seen[0].url).toBe("/api/v1/payments/orders");
    expect(seen[0].params).toEqual({ checkout: 2 });
    expect(seen[0].uri).toMatch(/\/api\/v1\/payments\/orders\?checkout=2$/);
    expect(JSON.parse(seen[0].data)).toEqual({
      source: "event_registration",
      payload: { event_id: "62", event_registration_id: "reg-1" },
    });
  });

  it("shows the server's words for 409 UPDATE_APP_TO_PAY, keeping the website link", async () => {
    serve((config) =>
      reply(config, 409, {
        message: "Update the MyOtherApp app to pay for this event, or pay on the website.",
        error_code: "UPDATE_APP_TO_PAY",
        errors: { web_url: "https://myotherapp.in/events/quiet-evening" },
      })
    );

    const error = await paymentsApi.createPaymentOrder("62", "reg-1").catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Update the MyOtherApp app to pay for this event, or pay on the website.");
    expect(error.code).toBe("UPDATE_APP_TO_PAY");
    expect(error.webUrl).toBe("https://myotherapp.in/events/quiet-evening");
  });

  it("keeps the server's message and its code for any other refusal", async () => {
    serve((config) => reply(config, 503, { message: "Payments are down for a moment.", error_code: "GATEWAY_UNAVAILABLE" }));
    const error = await paymentsApi.createPaymentOrder("62", "reg-1").catch((e) => e);
    expect(error.message).toBe("Payments are down for a moment.");
    expect(error).toMatchObject({ code: "GATEWAY_UNAVAILABLE", status: 503, stage: "order", network: false });
  });

  it.each([
    [409, "ALREADY_PAID", "This registration is already paid for.", { event_registration_id: "already paid" }],
    [422, "NOTHING_TO_PAY", "There is nothing to pay for this registration.", { event_registration_id: "nothing to pay" }],
    [409, "EVENT_ENDED", "This event is over; it can no longer be paid for.", null],
    [400, "EVENT_FULL", "Event is full", { max_participants: 60 }],
    [404, "REGISTRATION_NOT_FOUND", "Registration not found", { event_registration_id: "event_registration_id is invalid" }],
    [404, "EVENT_NOT_FOUND", "Event not found", { event_id: "event_id is invalid" }],
  ])("reads a %i %s refusal by its code", async (status, code, message, errors) => {
    serve((config) => reply(config, status, { message, errors, error_code: code, track_id: null }));
    const error = await paymentsApi.createPaymentOrder("62", "reg-1").catch((e) => e);
    expect(error).toMatchObject({ code, status, message, stage: "order", errors });
    // Finishing a payment asks with checkout=2 too.
    expect(seen[0].params).toEqual({ checkout: 2 });
  });

  it("says when nothing answered at all", async () => {
    apiClient.defaults.adapter = vi.fn(async (config) => {
      const error = new Error("Network Error");
      error.config = config;
      throw error;
    });
    const error = await paymentsApi.createPaymentOrder("62", "reg-1").catch((e) => e);
    expect(error).toMatchObject({ code: null, status: 0, network: true, message: "Failed to create payment order" });
  });
});

describe("paymentsApi.verifyPayment", () => {
  it("sends the order and the payment, and returns what the server says", async () => {
    serve((config) => reply(config, 200, { payment_status: "captured" }));
    expect(await paymentsApi.verifyPayment("order_1", "pay_1")).toEqual({ payment_status: "captured" });
    expect(seen[0]).toMatchObject({ method: "post", url: "/api/v1/payments/verify" });
    expect(JSON.parse(seen[0].data)).toEqual({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" });
  });

  it.each([
    [404, "ORDER_NOT_FOUND", "Payment order not found"],
    [409, "ALREADY_PAID", "This order is already paid."],
    [400, "PAYMENT_ORDER_MISMATCH", "This payment does not belong to the specified order."],
    [400, "UNSUPPORTED_PAYMENT_METHOD", "This payment method is not supported."],
    [404, "PAYMENT_NOT_FOUND", "Payment not found"],
  ])("reads a %i %s refusal by its code", async (status, code, message) => {
    serve((config) => reply(config, status, { message, errors: null, error_code: code }));
    const error = await paymentsApi.verifyPayment("order_1", "pay_1").catch((e) => e);
    expect(error).toMatchObject({ code, status, message, stage: "verify" });
  });

  it("reads an older server's {detail} too", async () => {
    serve((config) => reply(config, 404, { detail: "Payment not found" }));
    const error = await paymentsApi.verifyPayment("order_1", "pay_1").catch((e) => e);
    expect(error).toMatchObject({ code: null, status: 404, message: "Payment not found" });
  });
});
