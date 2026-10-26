import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { eventsApi } from "./events";

/**
 * The register call and the guest session it leaves in the browser. Once the
 * person signs in to the app, that guest is folded into their account and its
 * token stops working; the next registration must still go through.
 */
const BODY = { full_name: "Asha Rao", email: "asha@example.org", phone: "98765 43210", additional_details: {} };
const URL = "/api/v1/events/registration/62/register";

let adapter;
let seen;
const reply = (config, status, data) => {
  if (status < 400) return { data, status, statusText: "OK", headers: {}, config };
  const error = new Error(`Request failed with status code ${status}`);
  error.config = config;
  error.response = { status, data, config };
  throw error;
};

beforeEach(() => {
  seen = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  localStorage.clear();
  delete apiClient.defaults.adapter;
  vi.restoreAllMocks();
});

function serve(answer) {
  adapter = vi.fn(async (config) => {
    // Read now: the retry reuses this config object.
    seen.push({ url: config.url, auth: config.headers.Authorization, data: config.data });
    return answer(config);
  });
  apiClient.defaults.adapter = adapter;
}

describe("registering with a guest token the server no longer takes", () => {
  it("drops the stored token and sends the same registration once more without it, then keeps the new guest's token", async () => {
    localStorage.setItem("access_token", "folded-guest");
    localStorage.setItem("refresh_token", "folded-guest-refresh");
    serve((config) =>
      config.headers.Authorization
        ? reply(config, 401, { message: "Could not validate credentials" })
        : reply(config, 200, { ticket_id: "MOA1", pay_amount: 0, auth_token: { access_token: "fresh-guest", refresh_token: "fresh-guest-refresh" } })
    );
    const data = await eventsApi.registerForEvent("62", BODY);
    expect(data.ticket_id).toBe("MOA1");
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(seen.map((s) => s.url)).toEqual([URL, URL]);
    expect(seen.map((s) => s.auth)).toEqual(["Bearer folded-guest", undefined]);
    // Byte for byte the same registration, both times.
    expect(seen[1].data).toBe(seen[0].data);
    expect(JSON.parse(seen[0].data)).toEqual(BODY);
    expect(localStorage.getItem("access_token")).toBe("fresh-guest");
    expect(localStorage.getItem("refresh_token")).toBe("fresh-guest-refresh");
  });

  it("tries only once more: a second 401 is the answer, not a loop", async () => {
    localStorage.setItem("access_token", "folded-guest");
    serve((config) => reply(config, 401, { message: "Not allowed" }));
    await expect(eventsApi.registerForEvent("62", BODY)).rejects.toMatchObject({ status: 401, message: "Not allowed" });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("doesn't retry a 401 when no token was sent", async () => {
    serve((config) => reply(config, 401, { message: "Not allowed" }));
    await expect(eventsApi.registerForEvent("62", BODY)).rejects.toMatchObject({ status: 401 });
    expect(adapter).toHaveBeenCalledTimes(1);
  });
});

describe("a guest token sent with a different email", () => {
  it("stores the fresh guest's token the server hands back in place of the old one", async () => {
    localStorage.setItem("access_token", "first-person");
    localStorage.setItem("refresh_token", "first-person-refresh");
    serve((config) => reply(config, 200, { ticket_id: "MOA2", pay_amount: 0, auth_token: { access_token: "second-person", refresh_token: "second-person-refresh" } }));
    await eventsApi.registerForEvent("62", { ...BODY, email: "someone.else@example.org" });
    expect(seen[0].auth).toBe("Bearer first-person");
    expect(localStorage.getItem("access_token")).toBe("second-person");
    expect(localStorage.getItem("refresh_token")).toBe("second-person-refresh");
  });

  it("keeps the stored token when the server hands none back (a signed-in guest)", async () => {
    localStorage.setItem("access_token", "same-person");
    serve((config) => reply(config, 200, { ticket_id: "MOA3", pay_amount: 250, event_registration_id: "reg-1" }));
    await eventsApi.registerForEvent("62", BODY);
    expect(localStorage.getItem("access_token")).toBe("same-person");
  });
});

describe("a request instead of a registration (the club confirms each place)", () => {
  const APPROVAL = { id: "r1", status: "pending", submitted_at: "2026-10-26T10:15:00+05:30", token: "Rq7abcdefghijklmnopqrstuvwxyz012", status_url: "https://myotherapp.in/requests/Rq7abcdefghijklmnopqrstuvwxyz012" };

  it("keeps a new guest's token exactly as a registration's", async () => {
    serve((config) =>
      reply(config, 200, { approval: APPROVAL, event_registration_id: null, auth_token: { access_token: "request-guest", refresh_token: "request-guest-refresh" } })
    );
    const data = await eventsApi.registerForEvent("62", { ...BODY, accepts_approval: true });
    expect(data.approval).toEqual(APPROVAL);
    expect(JSON.parse(seen[0].data)).toEqual({ ...BODY, accepts_approval: true });
    expect(localStorage.getItem("access_token")).toBe("request-guest");
    expect(localStorage.getItem("refresh_token")).toBe("request-guest-refresh");
  });

  it("leaves the stored token when none comes back", async () => {
    localStorage.setItem("access_token", "same-guest");
    serve((config) => reply(config, 200, { approval: APPROVAL, event_registration_id: null }));
    await eventsApi.registerForEvent("62", { ...BODY, accepts_approval: true });
    expect(seen[0].auth).toBe("Bearer same-guest");
    expect(localStorage.getItem("access_token")).toBe("same-guest");
  });
});

describe("what a refusal carries to the form", () => {
  it.each([
    [409, "REQUEST_DECLINED", "The club has declined a request from you for this event."],
    [409, "APPROVAL_REQUIRED", "This event needs the club to confirm each place. Update the app, or register on myotherapp.in."],
    [409, "ALREADY_REGISTERED", "This email is already registered for this event. Your ticket was sent to it; sign in to the MyOtherApp app with this email to see it."],
    [409, "REGISTRATION_AWAITING_PAYMENT", "This email already has a registration for this event that is waiting for payment."],
    [400, "CLUB_EMAIL", "This email belongs to a club's account. Register with your own email."],
  ])("%i %s: the status, the code and the server's words", async (status, code, message) => {
    serve((config) => reply(config, status, { message, error_code: code, errors: null, track_id: null }));
    await expect(eventsApi.registerForEvent("62", BODY)).rejects.toMatchObject({ status, message, data: { error_code: code }, network: false });
  });

  it("no answer at all is marked as such", async () => {
    serve(() => {
      throw new Error("Network Error");
    });
    await expect(eventsApi.registerForEvent("62", BODY)).rejects.toMatchObject({ network: true, status: 0 });
  });
});
