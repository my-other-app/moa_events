import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient from "./client";
import { requestsApi } from "./requests";
import { accessToken, enableSignIn, resetAuth, signInAs } from "@/test/auth";

/*
 * Registration requests (the club confirms each place), as the browser
 * calls them: the address, what is sent, which token goes along, and how a
 * refusal comes back. The API is a fake adapter on the real client: nothing
 * leaves the test.
 */
const TOKEN = "Rq7abcdefghijklmnopqrstuvwxyz012";
const REQUEST = (over = {}) => ({
  id: "r1",
  status: "pending",
  event: { id: 123, slug: "hack-night-04", name: "Hack Night 04", event_datetime: "2026-11-08T18:00:00+05:30", poster: null, club: { name: "Circuit Society", slug: "circuit-society" } },
  ticket_type: null,
  full_name: "Asha Rao",
  submitted_at: "2026-10-26T10:15:00+05:30",
  decided_at: null,
  decline_note: null,
  ticket_id: null,
  pay: null,
  ...over,
});

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
    seen.push({ method: config.method, url: config.url, auth: config.headers.Authorization, data: config.data ? JSON.parse(config.data) : undefined });
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

describe("a request by its link", () => {
  it("is read with no token at all, even signed in: the link is the credential", async () => {
    enableSignIn();
    signInAs({ access: accessToken() });
    serve((config) => reply(config, 200, REQUEST()));
    const r = await requestsApi.byToken(TOKEN);
    expect(seen).toEqual([{ method: "get", url: `/api/v1/registration-requests/${TOKEN}`, auth: undefined, data: undefined }]);
    expect(r).toMatchObject({ id: "r1", status: "pending", event: { name: "Hack Night 04", club: { name: "Circuit Society" } } });
  });

  it("is a 404 when there is none, or the answer isn't one", async () => {
    serve((config) => reply(config, 404, { message: "Not found", error_code: "REQUEST_NOT_FOUND" }));
    await expect(requestsApi.byToken(TOKEN)).rejects.toMatchObject({ status: 404, code: "REQUEST_NOT_FOUND" });
    serve((config) => reply(config, 200, { nonsense: true }));
    await expect(requestsApi.byToken(TOKEN)).rejects.toMatchObject({ status: 404 });
  });

  it("is withdrawn with a POST and no token, answering with the request as it stands", async () => {
    localStorage.setItem("access_token", "guest-a");
    serve((config) => reply(config, 200, REQUEST({ status: "withdrawn" })));
    const r = await requestsApi.withdraw(TOKEN);
    expect(seen).toEqual([{ method: "post", url: `/api/v1/registration-requests/${TOKEN}/withdraw`, auth: undefined, data: {} }]);
    expect(r.status).toBe("withdrawn");
  });

  it("says a refusal with its status and code", async () => {
    serve((config) => reply(config, 409, { message: "Already decided", error_code: "REQUEST_NOT_PENDING" }));
    await expect(requestsApi.withdraw(TOKEN)).rejects.toMatchObject({ status: 409, code: "REQUEST_NOT_PENDING", message: "Already decided" });
    serve((config) => reply(config, 429, { message: "Slow down" }, { "retry-after": "30" }));
    await expect(requestsApi.byToken(TOKEN)).rejects.toMatchObject({ status: 429, retryAfter: 30 });
  });
});

describe("the reader's own requests", () => {
  it("go with the account's token when signed in", async () => {
    enableSignIn();
    const access = accessToken();
    signInAs({ access });
    serve((config) => reply(config, 200, { items: [REQUEST()] }));
    const list = await requestsApi.mine();
    expect(seen).toEqual([{ method: "get", url: "/api/v1/registration-requests/mine", auth: `Bearer ${access}`, data: undefined }]);
    expect(list).toHaveLength(1);
  });

  it("go with the guest token a registration left, signed out", async () => {
    localStorage.setItem("access_token", "guest-a");
    serve((config) => reply(config, 200, { items: [] }));
    expect(await requestsApi.mine()).toEqual([]);
    expect(seen[0].auth).toBe("Bearer guest-a");
  });

  it("are nothing (null) from a server without requests", async () => {
    serve((config) => reply(config, 404, { detail: "Not Found" }));
    expect(await requestsApi.mine()).toBeNull();
    serve((config) => reply(config, 405, { detail: "Method Not Allowed" }));
    expect(await requestsApi.mine()).toBeNull();
  });

  it("throw anything else, for the page to keep quiet about", async () => {
    serve((config) => reply(config, 500, { message: "Internal Server Error" }));
    await expect(requestsApi.mine()).rejects.toMatchObject({ status: 500 });
  });
});
