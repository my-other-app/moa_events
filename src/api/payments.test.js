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

  it("keeps the server's message for any other refusal", async () => {
    serve((config) => reply(config, 503, { message: "Payments are down for a moment.", error_code: "GATEWAY_UNAVAILABLE" }));
    const error = await paymentsApi.createPaymentOrder("62", "reg-1").catch((e) => e);
    expect(error.message).toBe("Payments are down for a moment.");
    expect(error.code).toBeUndefined();
  });
});
