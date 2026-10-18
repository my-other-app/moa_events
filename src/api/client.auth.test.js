import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import apiClient, { refreshAccess } from "./client";
import { eventsApi } from "./events";
import { getSession } from "@/auth/session";
import { accessToken, enableSignIn, resetAuth, signInAs } from "@/test/auth";

/**
 * The account's token and a guest's never trample each other: signed in, the
 * account's goes with everything (refreshed once when it is refused);
 * signed out, the guest token works as it always has.
 */

let seen;
let routes;
const reply = (config, status, data) => {
  if (status >= 400) {
    const error = new Error(`Request failed with status code ${status}`);
    error.config = config;
    error.response = { status, data, config };
    throw error;
  }
  return { data, status, statusText: "OK", headers: {}, config };
};

beforeEach(() => {
  resetAuth();
  enableSignIn();
  seen = [];
  routes = [];
  apiClient.defaults.adapter = vi.fn(async (config) => {
    const auth = config.headers.Authorization;
    const body = typeof config.data === "string" ? config.data : config.data instanceof URLSearchParams ? config.data.toString() : null;
    seen.push({ method: config.method, url: config.url, auth, body });
    for (const [match, answer] of routes) if (match(config)) return answer(config, auth, body);
    return reply(config, 404, { message: "Not found" });
  });
});
afterEach(() => {
  delete apiClient.defaults.adapter;
  resetAuth();
});
afterAll(() => vi.unstubAllEnvs());

const on = (method, url, answer) => routes.push([(c) => c.method === method && c.url === url, answer]);
const BODY = { full_name: "Asha Rao", email: "asha@example.org", phone: "9876543210" };

describe("which token goes", () => {
  it("sends the account's token when signed in, never the guest token beside it", async () => {
    const access = accessToken();
    signInAs({ access });
    localStorage.setItem("access_token", "old-guest");
    on("get", "/api/v1/events/info/68", (c) => reply(c, 200, { id: 68 }));
    await apiClient.get("/api/v1/events/info/68");
    expect(seen[0].auth).toBe(`Bearer ${access}`);
  });

  it("sends the guest token when signed out, as before", async () => {
    localStorage.setItem("access_token", "guest-1");
    on("get", "/api/v1/events/info/68", (c) => reply(c, 200, { id: 68 }));
    await apiClient.get("/api/v1/events/info/68");
    expect(seen[0].auth).toBe("Bearer guest-1");
  });

  it("keeps the guest token off a signed-in reader's request (`userOnly`)", async () => {
    localStorage.setItem("access_token", "guest-1");
    on("get", "/api/v1/threads/t1", (c) => reply(c, 200, { id: "t1" }));
    await apiClient.get("/api/v1/threads/t1", { userOnly: true });
    expect(seen[0].auth).toBeUndefined();
  });

  it("ignores a stored session when the build has no Google client id", async () => {
    signInAs();
    resetAuthEnvOnly();
    on("get", "/api/v1/events/info/68", (c) => reply(c, 200, { id: 68 }));
    await apiClient.get("/api/v1/events/info/68");
    expect(seen[0].auth).toBeUndefined();
    expect(getSession()).toBeNull();
  });
});

function resetAuthEnvOnly() {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
}

describe("registering while signed in", () => {
  it("goes with the account's token and stores no guest token", async () => {
    const access = accessToken();
    signInAs({ access });
    on("post", "/api/v1/events/registration/62/register", (c) =>
      // Even if a token came back, a signed-in registration never keeps one.
      reply(c, 200, { ticket_id: "MOA1", pay_amount: 0, auth_token: { access_token: "guest-x", refresh_token: "guest-x-r" } }),
    );
    const data = await eventsApi.registerForEvent("62", BODY);
    expect(data.ticket_id).toBe("MOA1");
    expect(seen).toHaveLength(1);
    expect(seen[0].auth).toBe(`Bearer ${access}`);
    expect(JSON.parse(seen[0].body)).toEqual(BODY);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(getSession().access_token).toBe(access);
  });

  it("never falls back to a guest registration when the sign-in can't be renewed", async () => {
    signInAs({ access: "dead-access", refresh: "dead-refresh" });
    on("post", "/api/v1/events/registration/62/register", (c, auth) =>
      auth ? reply(c, 401, { message: "Token has expired" }) : reply(c, 200, { ticket_id: "GUEST" }),
    );
    on("post", "/api/v1/auth/refresh", (c) => reply(c, 401, { message: "Token has been revoked, please log in again" }));
    await expect(eventsApi.registerForEvent("62", BODY)).rejects.toMatchObject({ authExpired: true, status: 401, network: false });
    // Sent once as the account, refused; never again without a token.
    expect(seen.filter((r) => r.url.endsWith("/register")).map((r) => r.auth)).toEqual(["Bearer dead-access"]);
    expect(getSession()).toBeNull();
  });
});

describe("refreshing the account's token", () => {
  it("refreshes once on a 401 and sends the request again with the new token", async () => {
    signInAs({ access: "access-1", refresh: "refresh-1" });
    on("get", "/api/v1/user/profile/me", (c, auth) =>
      auth === "Bearer access-2" ? reply(c, 200, { id: 7 }) : reply(c, 401, { message: "Token has expired" }),
    );
    on("post", "/api/v1/auth/refresh", (c, auth, body) => {
      expect(auth).toBeUndefined();
      expect(body).toBe("token=refresh-1");
      return reply(c, 200, { access_token: "access-2", refresh_token: "refresh-2", token_type: "Bearer" });
    });
    // Two at once still make one refresh.
    const [a, b] = await Promise.all([apiClient.get("/api/v1/user/profile/me"), apiClient.get("/api/v1/user/profile/me")]);
    expect(a.data.id).toBe(7);
    expect(b.data.id).toBe(7);
    expect(seen.filter((r) => r.url === "/api/v1/auth/refresh")).toHaveLength(1);
    expect(getSession().access_token).toBe("access-2");
    // The refresh token rotates: the one sent is spent, the one that came back is kept.
    expect(getSession().refresh_token).toBe("refresh-2");
  });

  it("stores the rotated refresh token, in memory and in storage, and sends it next time", async () => {
    signInAs({ access: "access-1", refresh: "refresh-1" });
    let n = 1;
    on("post", "/api/v1/auth/refresh", (c, auth, body) => {
      expect(body).toBe(`token=refresh-${n}`);
      n += 1;
      return reply(c, 200, { access_token: `access-${n}`, refresh_token: `refresh-${n}`, token_type: "Bearer" });
    });
    await expect(refreshAccess()).resolves.toBe("access-2");
    expect(getSession()).toMatchObject({ access_token: "access-2", refresh_token: "refresh-2" });
    expect(JSON.parse(localStorage.getItem("moa.session"))).toMatchObject({ access_token: "access-2", refresh_token: "refresh-2" });
    // The next refresh goes with the new token, never the spent one.
    await expect(refreshAccess()).resolves.toBe("access-3");
    expect(seen.filter((r) => r.url === "/api/v1/auth/refresh").map((r) => r.body)).toEqual(["token=refresh-1", "token=refresh-2"]);
    expect(getSession().refresh_token).toBe("refresh-3");
  });

  it("keeps the refresh token it has when an older server sends none back", async () => {
    signInAs({ access: "access-1", refresh: "refresh-1" });
    on("post", "/api/v1/auth/refresh", (c) => reply(c, 200, { access_token: "access-2", token_type: "Bearer" }));
    await refreshAccess();
    expect(getSession()).toMatchObject({ access_token: "access-2", refresh_token: "refresh-1" });
  });

  it("refreshes before sending when the token has already expired", async () => {
    const stale = accessToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    signInAs({ access: stale, refresh: "refresh-1" });
    on("post", "/api/v1/auth/refresh", (c) => reply(c, 200, { access_token: "access-2", refresh_token: "refresh-2" }));
    on("get", "/api/v1/user/following", (c) => reply(c, 200, { items: [] }));
    await apiClient.get("/api/v1/user/following");
    expect(seen.map((r) => r.url)).toEqual(["/api/v1/auth/refresh", "/api/v1/user/following"]);
    expect(seen[1].auth).toBe("Bearer access-2");
    expect(getSession().refresh_token).toBe("refresh-2");
  });

  it("signs out when the refresh is refused, and a public read goes on as a visitor", async () => {
    signInAs({ access: "access-1", refresh: "refresh-1" });
    localStorage.setItem("access_token", "never-sent");
    on("get", "/api/v1/discover/home", (c, auth) => (auth ? reply(c, 401, { message: "Token has expired" }) : reply(c, 200, { ok: true })));
    on("post", "/api/v1/auth/refresh", (c) => reply(c, 401, { message: "This session was signed out" }));
    const res = await apiClient.get("/api/v1/discover/home");
    expect(res.data.ok).toBe(true);
    expect(getSession()).toBeNull();
    expect(seen.map((r) => [r.url, r.auth])).toEqual([
      ["/api/v1/discover/home", "Bearer access-1"],
      ["/api/v1/auth/refresh", undefined],
      ["/api/v1/discover/home", undefined],
    ]);
  });

  it("keeps the session through a refresh that fails for want of a connection", async () => {
    signInAs({ access: "access-1", refresh: "refresh-1" });
    on("post", "/api/v1/auth/refresh", (c) => {
      const e = new Error("Network Error");
      e.config = c;
      throw e;
    });
    await expect(refreshAccess()).rejects.toMatchObject({ signedOut: false });
    expect(getSession().access_token).toBe("access-1");
  });
});
