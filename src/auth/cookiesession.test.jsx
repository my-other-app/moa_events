import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import apiClient from "@/api/client";
import { eventsApi } from "@/api/events";
import { paymentsApi } from "@/api/payments";
import { payAsToken } from "@/utils/payment";
import { PAY_AS } from "./cookiemode";
import { ticketingApi } from "@/api/ticketing";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./context";
import { getNotice, getSession, hasGuest, reloadSessionForTests, whenAdopted } from "./session";
import { PROFILE, accessToken, enableSignIn, resetAuth, stubGoogle } from "@/test/auth";

/*
 * When the build keeps tokens in HttpOnly cookies (NEXT_PUBLIC_SESSION_COOKIE=on):
 * page script never holds one. Calls that need a token go through the
 * site's gateway, which says what it did; localStorage keeps only who is
 * signed in; tokens kept from before are handed over once, then cleared.
 */

let seen;
let routes;
let site;
const reply = (config, status, data, headers = {}) => {
  if (status >= 400) {
    const error = new Error(`Request failed with status code ${status}`);
    error.config = config;
    error.response = { status, data, config, headers };
    throw error;
  }
  return { data, status, statusText: "OK", headers, config };
};
const on = (method, url, answer) => routes.unshift([(c) => c.method === method && c.url === url, answer]);
const via = (c) => (c.baseURL === "/api/gateway" ? "site" : "api");
const SIGNED_IN = { "x-moa-as": "user" };

/** The site's own /api/session, as fetch sees it. */
function stubSiteSession(answer = () => Response.json({ signedIn: true, sid: "s1", user: 7, guest: false })) {
  site = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init = {}) => {
      const call = { url, method: init.method, body: init.body ? JSON.parse(init.body) : null };
      site.push(call);
      return answer(call);
    }),
  );
}

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <output data-testid="status">{auth.status}</output>
      <output data-testid="who">{auth.user ? `${auth.user.name} <${auth.user.email}>` : ""}</output>
      <button type="button" onClick={() => auth.openSignIn({ reason: "tickets" })}>
        Open sign-in
      </button>
      <button type="button" onClick={auth.signOut}>
        Sign me out
      </button>
    </div>
  );
}
const show = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
const status = () => screen.getByTestId("status").textContent;

/** Signed in on an earlier visit, in cookie mode: only who it is is stored here. */
function signedInByCookie(over = {}) {
  localStorage.setItem("moa.session", JSON.stringify({ cookie: true, sid: "s1", user: 7, profile: PROFILE, claims: null, ...over }));
  reloadSessionForTests();
}

const noTokensStored = () => {
  for (let i = 0; i < localStorage.length; i++) {
    const v = localStorage.getItem(localStorage.key(i)) || "";
    expect(v).not.toMatch(/access_token|refresh_token|eyJ/);
  }
  expect(localStorage.getItem("access_token")).toBeNull();
  expect(localStorage.getItem("refresh_token")).toBeNull();
};

beforeEach(() => {
  resetAuth();
  vi.stubEnv("NEXT_PUBLIC_SESSION_COOKIE", "on");
  enableSignIn();
  reloadSessionForTests();
  window.scrollTo = vi.fn();
  stubSiteSession();
  seen = [];
  routes = [];
  apiClient.defaults.adapter = vi.fn(async (config) => {
    const call = { method: config.method, url: config.url, via: via(config), mode: config.headers["X-Moa-Auth"], auth: config.headers.Authorization, data: config.data };
    seen.push(call);
    for (const [match, answer] of routes) if (match(config)) return answer(config, call);
    return reply(config, 404, { message: "Not found" });
  });
});
afterEach(() => {
  delete apiClient.defaults.adapter;
  vi.stubEnv("NEXT_PUBLIC_SESSION_COOKIE", "");
  resetAuth();
  vi.unstubAllGlobals();
});
afterAll(() => vi.unstubAllEnvs());

describe("signing in, in cookie mode", () => {
  it("goes through the site, which keeps the tokens: only who signed in is stored here", async () => {
    const google = stubGoogle();
    on("post", "/api/v1/auth/google", (c, call) => {
      expect(call).toMatchObject({ via: "site", mode: "none" });
      expect(JSON.parse(c.data)).toEqual({ id_token: google.credential, platform: "web" });
      return reply(c, 200, { token_type: "Bearer", session: { sid: "s1", user: 7 } }, { "x-moa-session": "started", "x-moa-as": "visitor" });
    });
    on("get", "/api/v1/user/profile/me", (c, call) => {
      expect(call).toMatchObject({ via: "site", mode: "session" });
      return reply(c, 200, PROFILE, SIGNED_IN);
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Open sign-in" }));
    const sheet = await screen.findByRole("dialog", { name: "Sign in to see your tickets" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));
    await waitFor(() => expect(status()).toBe("signed-in"));
    expect(screen.getByTestId("who").textContent).toBe("Asha Rao <asha@example.org>");
    expect(JSON.parse(localStorage.getItem("moa.session"))).toMatchObject({ cookie: true, sid: "s1", user: 7, profile: { id: 7 } });
    noTokensStored();
    expect(seen.every((r) => r.auth === undefined)).toBe(true);
    // Google vouched for the address: the guest's cookie goes too.
    expect(site).toContainEqual({ url: "/api/session", method: "POST", body: { action: "forget-guest" } });
  });

  it("refuses a club's account the way it always has, and ends what the sign-in started", async () => {
    stubGoogle();
    on("post", "/api/v1/auth/google", (c) => reply(c, 200, { session: { sid: "s9", user: 70 } }));
    on("get", "/api/v1/user/profile/me", (c) => reply(c, 403, { message: "Club is not verified", error_code: "CLUB_NOT_VERIFIED" }, { "x-moa-session": "ended; reason=club", "x-moa-as": "user" }));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Open sign-in" }));
    const sheet = await screen.findByRole("dialog", { name: "Sign in to see your tickets" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));
    await waitFor(() => expect(site.some((c) => c.method === "DELETE")).toBe(true));
    expect(status()).toBe("signed-out");
    expect(getSession()).toBeNull();
    expect(localStorage.getItem("moa.session")).toBeNull();
  });

  it("signs out through the site's server, which ends the session on the API", async () => {
    signedInByCookie();
    on("get", "/api/v1/user/profile/me", (c) => reply(c, 200, PROFILE, SIGNED_IN));
    show();
    await waitFor(() => expect(status()).toBe("signed-in"));
    fireEvent.click(screen.getByRole("button", { name: "Sign me out" }));
    await waitFor(() => expect(status()).toBe("signed-out"));
    expect(site).toContainEqual({ url: "/api/session", method: "DELETE", body: null });
    expect(localStorage.getItem("moa.session")).toBeNull();
  });
});

describe("which way a call goes, in cookie mode", () => {
  it("signed in: through the gateway, with no token of its own", async () => {
    signedInByCookie();
    on("get", "/api/v1/events/info/68", (c) => reply(c, 200, { id: 68 }, SIGNED_IN));
    await apiClient.get("/api/v1/events/info/68");
    await apiClient.get("/api/v1/threads/t1", { userOnly: true }).catch(() => {});
    await apiClient.get("/api/v1/events/68/live/banner", { skipAuth: true }).catch(() => {});
    expect(seen.map(({ via, mode, auth }) => ({ via, mode, auth }))).toEqual([
      { via: "site", mode: "auto", auth: undefined },
      { via: "site", mode: "user", auth: undefined },
      { via: "api", mode: undefined, auth: undefined },
    ]);
  });

  it("a visitor: reads straight to the API, as always; a change through the gateway (it may hand back a guest token)", async () => {
    on("get", "/api/v1/events/info/68", (c) => reply(c, 200, { id: 68 }));
    on("post", "/api/v1/events/registration/68/register", (c) => reply(c, 200, { ticket_id: "MOA1", auth_token: { kept: "guest" } }, { "x-moa-guest": "kept", "x-moa-as": "visitor", "x-moa-session": "none" }));
    await apiClient.get("/api/v1/events/info/68");
    const done = await eventsApi.registerForEvent(68, { full_name: "Asha" });
    expect(done.ticket_id).toBe("MOA1");
    expect(seen.map(({ via, mode }) => [via, mode])).toEqual([
      ["api", undefined],
      ["site", "auto"],
    ]);
    // The guest token is in its cookie: here, only a note that there is one.
    expect(hasGuest()).toBe(true);
    noTokensStored();
    // From now on the guest's reads go through the gateway, which adds it.
    await apiClient.get("/api/v1/events/info/68");
    expect(seen.at(-1)).toMatchObject({ via: "site", mode: "auto" });
  });

  it("forgets the guest when the gateway says its token is gone", async () => {
    localStorage.setItem("moa.guest", "1");
    on("get", "/api/v1/events/info/68", (c) => reply(c, 200, { id: 68 }, { "x-moa-guest": "gone", "x-moa-as": "visitor" }));
    expect(hasGuest()).toBe(true);
    await apiClient.get("/api/v1/events/info/68");
    expect(hasGuest()).toBe(false);
  });
});

describe("the session ending, in cookie mode", () => {
  it("signs every tab out when the gateway ended the session, and says why", async () => {
    signedInByCookie();
    on("get", "/api/v1/events/info/68", (c) => reply(c, 200, { id: 68 }, { "x-moa-session": "ended; reason=reused", "x-moa-as": "visitor" }));
    await apiClient.get("/api/v1/events/info/68");
    expect(getSession()).toBeNull();
    expect(getNotice()).toMatchObject({ reason: "reused" });
  });

  it("signs out quietly when the cookie is simply gone", async () => {
    signedInByCookie();
    on("get", "/api/v1/events/info/68", (c) => reply(c, 200, { id: 68 }, { "x-moa-session": "none", "x-moa-as": "visitor" }));
    await apiClient.get("/api/v1/events/info/68");
    expect(getSession()).toBeNull();
    expect(getNotice()).toBeNull();
  });

  it("never signs out a session made after the call set out", async () => {
    on("get", "/api/v1/events/info/68", (c) => {
      // Signed in meanwhile, in another tab.
      localStorage.setItem("moa.session", JSON.stringify({ cookie: true, sid: "s2", user: 7, profile: PROFILE }));
      reloadSessionForTests();
      return reply(c, 200, { id: 68 }, { "x-moa-session": "none" });
    });
    localStorage.setItem("moa.guest", "1");
    await apiClient.get("/api/v1/events/info/68");
    expect(getSession()).toMatchObject({ sid: "s2" });
  });

  it("refuses a change with `authExpired` once the session can't be kept alive", async () => {
    signedInByCookie();
    on("post", "/api/v1/events/registration/68/register", (c) => reply(c, 401, { message: "Your sign-in has expired. Sign in again.", error_code: "SIGNED_OUT" }, { "x-moa-session": "ended" }));
    const error = await eventsApi.registerForEvent(68, { full_name: "Asha" }).catch((e) => e);
    expect(error.authExpired).toBe(true);
    expect(getSession()).toBeNull();
  });
});

describe("paying for a claim made for another address, in cookie mode", () => {
  it("pays as the claim's guest, whose token the gateway kept", async () => {
    signedInByCookie();
    on("post", "/api/v1/waitlist/offers/tok/claim", (c) => reply(c, 200, { ticket_id: "MOA2", pay_amount: 500, event_registration_id: 9, auth_token: { kept: "pay_as" } }, SIGNED_IN));
    on("post", "/api/v1/payments/orders", (c) => reply(c, 200, { id: 1, razorpay_order_id: "order_1" }, { "x-moa-as": "pay-as" }));
    const data = await ticketingApi.claim("tok", { full_name: "Asha" });
    expect(hasGuest()).toBe(false);
    const token = payAsToken(data.auth_token);
    expect(token).toBe(PAY_AS);
    await paymentsApi.createPaymentOrder("68", "9", { token });
    expect(seen.at(-1)).toMatchObject({ via: "site", mode: "pay-as", auth: undefined });
    // The token itself, as before, when the build keeps tokens in localStorage.
    expect(payAsToken({ access_token: "a.b.c" })).toBe("a.b.c");
    expect(payAsToken(null)).toBeNull();
  });
});

describe("tokens kept in localStorage before, in cookie mode", () => {
  const legacy = () => {
    const access = accessToken({ sid: "s1" });
    localStorage.setItem("moa.session", JSON.stringify({ access_token: access, refresh_token: "r.e.f", profile: PROFILE, claims: null }));
    localStorage.setItem("access_token", "g.u.est");
    localStorage.setItem("refresh_token", "g.r.ef");
    return access;
  };

  it("are handed to the site's server once, then cleared here; the person stays signed in throughout", async () => {
    stubSiteSession(() => Response.json({ signedIn: true, sid: "s1", user: 7, guest: true }));
    const access = legacy();
    reloadSessionForTests();
    // Signed in at once, from what was kept, while it is handed over.
    expect(getSession()).toMatchObject({ cookie: true, sid: "s1", user: 7, profile: { id: 7 } });
    await whenAdopted();
    expect(site).toEqual([
      { url: "/api/session", method: "POST", body: { action: "adopt", session: { access_token: access, refresh_token: "r.e.f" }, guest: { access_token: "g.u.est" } } },
    ]);
    expect(JSON.parse(localStorage.getItem("moa.session"))).toMatchObject({ cookie: true, sid: "s1", user: 7 });
    noTokensStored();
    expect(hasGuest()).toBe(true);
    expect(getSession()).toMatchObject({ sid: "s1" });
  });

  it("stay here, untouched, when the site's server can't be reached; this page shows nobody signed in", async () => {
    stubSiteSession(() => {
      throw new TypeError("fetch failed");
    });
    const access = legacy();
    reloadSessionForTests();
    await whenAdopted();
    expect(getSession()).toBeNull();
    expect(JSON.parse(localStorage.getItem("moa.session")).access_token).toBe(access);
    expect(localStorage.getItem("access_token")).toBe("g.u.est");
  });

  it("are dropped when the server says they can't be used any more", async () => {
    stubSiteSession(() => Response.json({ signedIn: false, sid: null, user: null, guest: false }));
    legacy();
    reloadSessionForTests();
    await whenAdopted();
    expect(getSession()).toBeNull();
    expect(localStorage.getItem("moa.session")).toBeNull();
    noTokensStored();
    expect(hasGuest()).toBe(false);
  });

  it("are waited for before a call goes, so it goes signed in", async () => {
    let release;
    stubSiteSession(
      () =>
        new Promise((resolve) => {
          release = () => resolve(Response.json({ signedIn: true, sid: "s1", user: 7, guest: false }));
        }),
    );
    legacy();
    reloadSessionForTests();
    on("get", "/api/v1/user/following", (c) => reply(c, 200, { items: [] }, SIGNED_IN));
    const call = apiClient.get("/api/v1/user/following");
    await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual([]);
    release();
    await call;
    expect(seen[0]).toMatchObject({ via: "site", mode: "auto" });
  });
});
