import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEASE_KEY, withLease, withRefreshLock } from "@/auth/refreshlock";
import { enableSignIn, fakeJwt, resetAuth } from "@/test/auth";

/*
 * Several tabs, one session. The API rotates the refresh token on every
 * refresh: the one sent is spent, answered again with the same pair for 30
 * seconds, and after that taken as stolen (401 SESSION_REUSED, the session
 * ended everywhere). Each "tab" here is a fresh copy of the API client and
 * the session module (as a new page would have), sharing this window's
 * localStorage and navigator.locks, against one made-up API that rotates.
 */

const SID = "sess-1";
// Fixed once, so the same generation is always the same string.
const FRESH = Math.floor(Date.now() / 1000) + 3600;
const PAST = Math.floor(Date.now() / 1000) - 60;
const access = (gen, exp = FRESH) => fakeJwt({ user_id: 7, token_type: "access_token", sid: SID, gen, exp });

const reply = (config, status, data) => {
  if (status >= 400) {
    const error = new Error(`Request failed with status code ${status}`);
    error.config = config;
    error.response = { status, data, config };
    throw error;
  }
  return { data, status, statusText: "OK", headers: {}, config };
};

/**
 * The API's side: refresh rotates (with the 30-second grace and reuse
 * detection), and every other call answers 200 to an access token the
 * session still has, 401 otherwise. `staleAccessRefused` makes it refuse
 * every access token but the newest (to stand for a token that went bad).
 */
function rotatingApi({ grace = 30_000, staleAccessRefused = false, exp = FRESH } = {}) {
  const api = { refreshes: [], calls: [], clock: 0, ended: false };
  let gen = 1;
  let current = "refresh-1";
  let newest = null;
  const spent = new Map();
  const live = new Set();
  api.now = () => Date.now() + api.clock;
  api.advance = (ms) => (api.clock += ms);
  api.issue = (token) => {
    live.add(token);
    newest = token;
    return token;
  };
  api.adapter = vi.fn(async (config) => {
    // The network takes a moment, so tabs' requests overlap.
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (config.url === "/api/v1/auth/refresh") {
      const token = new URLSearchParams(config.data).get("token");
      api.refreshes.push(token);
      if (api.ended) return reply(config, 401, { message: "This session was signed out", error_code: null });
      if (token === current) {
        gen += 1;
        const pair = { access_token: api.issue(access(gen, exp)), refresh_token: `refresh-${gen}`, token_type: "Bearer" };
        spent.set(token, { pair, at: api.now() });
        current = pair.refresh_token;
        return reply(config, 200, pair);
      }
      const was = spent.get(token);
      if (was && api.now() - was.at <= grace) return reply(config, 200, was.pair);
      api.ended = true;
      live.clear();
      return reply(config, 401, {
        message: "This session was ended because its sign-in was used from two places. Sign in again.",
        error_code: "SESSION_REUSED",
      });
    }
    const auth = config.headers.Authorization || null;
    api.calls.push({ url: config.url, method: config.method, auth });
    const token = auth ? auth.replace(/^Bearer /, "") : null;
    if (!token) return reply(config, 200, { visitor: true });
    const ok = live.has(token) && (!staleAccessRefused || token === newest);
    return ok ? reply(config, 200, { ok: true, as: token }) : reply(config, 401, { message: "Token has expired", error_code: "TOKEN_EXPIRED" });
  });
  return api;
}

/** A Web Locks stand-in: one holder per name, the rest queued in order. */
function fakeLocks() {
  const tails = new Map();
  const locks = {
    held: 0,
    request: vi.fn((name, options, callback) => {
      const cb = typeof options === "function" ? options : callback;
      const before = tails.get(name) || Promise.resolve();
      let release;
      const mine = new Promise((resolve) => (release = resolve));
      tails.set(name, before.then(() => mine));
      return before.then(async () => {
        locks.held += 1;
        try {
          return await cb({ name, mode: "exclusive" });
        } finally {
          locks.held -= 1;
          release();
        }
      });
    }),
  };
  return locks;
}

const setLocks = (locks) => Object.defineProperty(window.navigator, "locks", { value: locks, configurable: true, writable: true });

/** A new tab: its own API client and session module, reading the same storage. */
async function openTab(api) {
  vi.resetModules();
  const client = await import("./client");
  const session = await import("@/auth/session");
  client.default.defaults.adapter = api.adapter;
  return { api: client.default, refreshAccess: client.refreshAccess, session };
}

/** Signed in on an earlier visit, as every tab finds it in storage. */
function storeSession({ accessToken, refresh = "refresh-1" }) {
  localStorage.setItem("moa.session", JSON.stringify({ access_token: accessToken, refresh_token: refresh, profile: { id: 7 }, claims: null }));
}

/** What the browser tells every other tab when one writes storage. */
const storageEvent = (key, newValue) => window.dispatchEvent(new StorageEvent("storage", { key, newValue }));

beforeEach(() => {
  resetAuth();
  enableSignIn();
  setLocks(undefined);
});
afterEach(() => {
  setLocks(undefined);
  resetAuth();
});
afterAll(() => {
  delete window.navigator.locks;
  vi.unstubAllEnvs();
});

describe("two tabs, one refresh", () => {
  it.each([
    ["the Web Locks API", () => setLocks(fakeLocks())],
    ["a lease in localStorage, where there are no Web Locks", () => setLocks(undefined)],
  ])("refreshes once, not twice, when both tabs need it at once (%s)", async (_, arrange) => {
    arrange();
    const server = rotatingApi();
    storeSession({ accessToken: server.issue(access(1, PAST)) });
    const a = await openTab(server);
    const b = await openTab(server);

    // Both tabs' tokens have expired: each refreshes before sending.
    const [ra, rb] = await Promise.all([a.api.get("/api/v1/user/following"), b.api.get("/api/v1/user/tickets")]);

    expect(server.refreshes).toEqual(["refresh-1"]);
    expect(server.ended).toBe(false);
    // Both went with the one new token, and both tabs hold the rotated pair.
    expect(ra.data.as).toBe(access(2));
    expect(rb.data.as).toBe(access(2));
    expect(a.session.getSession()).toMatchObject({ access_token: access(2), refresh_token: "refresh-2" });
    expect(b.session.getSession()).toMatchObject({ access_token: access(2), refresh_token: "refresh-2" });
    expect(JSON.parse(localStorage.getItem("moa.session")).refresh_token).toBe("refresh-2");
    expect(localStorage.getItem(LEASE_KEY)).toBeNull();
  });

  it("takes the lock for every refresh, and holds it only while refreshing", async () => {
    const locks = fakeLocks();
    setLocks(locks);
    const server = rotatingApi();
    storeSession({ accessToken: server.issue(access(1, PAST)) });
    const a = await openTab(server);
    await a.refreshAccess();
    expect(locks.request).toHaveBeenCalledWith("moa.refresh", { mode: "exclusive" }, expect.any(Function));
    expect(locks.held).toBe(0);
  });

  it("a tab that slept past the 30 seconds takes the tokens another tab stored, and never sends its spent one", async () => {
    setLocks(fakeLocks());
    const server = rotatingApi();
    storeSession({ accessToken: server.issue(access(1, PAST)) });
    const awake = await openTab(server);
    const asleep = await openTab(server);

    await awake.refreshAccess();
    expect(server.refreshes).toEqual(["refresh-1"]);
    // The sleeping tab heard nothing (no storage event): it still holds refresh-1, now spent.
    expect(asleep.session.getSession().refresh_token).toBe("refresh-1");

    server.advance(5 * 60 * 1000);
    const res = await asleep.api.get("/api/v1/user/following");

    expect(server.refreshes).toEqual(["refresh-1"]);
    expect(server.ended).toBe(false);
    expect(res.data.as).toBe(access(2));
    expect(asleep.session.getSession()).toMatchObject({ access_token: access(2), refresh_token: "refresh-2" });
  });

  it("refreshes with the stored token, not its own, when what another tab stored has expired too", async () => {
    setLocks(fakeLocks());
    // Access tokens that are already past their time when they arrive: every tab must refresh.
    const server = rotatingApi({ exp: PAST });
    storeSession({ accessToken: server.issue(access(1, PAST)) });
    const awake = await openTab(server);
    const asleep = await openTab(server);
    await awake.refreshAccess();
    server.advance(5 * 60 * 1000);

    await asleep.refreshAccess();

    // refresh-2 (the one stored), never refresh-1 (this tab's own, spent long ago).
    expect(server.refreshes).toEqual(["refresh-1", "refresh-2"]);
    expect(server.ended).toBe(false);
    expect(asleep.session.getSession().refresh_token).toBe("refresh-3");
  });

  it("stops at a sign-out another tab made while this one waited for the lock", async () => {
    setLocks(fakeLocks());
    const server = rotatingApi();
    storeSession({ accessToken: server.issue(access(1, PAST)) });
    const tab = await openTab(server);
    localStorage.removeItem("moa.session");
    await expect(tab.refreshAccess()).rejects.toMatchObject({ signedOut: true });
    expect(server.refreshes).toEqual([]);
    expect(tab.session.getSession()).toBeNull();
  });
});

describe("a request refused with a token another tab has replaced", () => {
  it("is sent again once with the stored token, without a refresh", async () => {
    setLocks(fakeLocks());
    const server = rotatingApi({ staleAccessRefused: true });
    storeSession({ accessToken: server.issue(access(1)) });
    const tab = await openTab(server);
    // Another tab refreshed: storage has the new pair; this tab's copy is the old one (not expiring, so no refresh first).
    storeSession({ accessToken: server.issue(access(2)), refresh: "refresh-2" });

    const res = await tab.api.get("/api/v1/user/following");

    expect(res.data.as).toBe(access(2));
    expect(server.calls.map((c) => c.auth)).toEqual([`Bearer ${access(1)}`, `Bearer ${access(2)}`]);
    expect(server.refreshes).toEqual([]);
    expect(tab.session.getSession()).toMatchObject({ access_token: access(2), refresh_token: "refresh-2" });
  });

  it("refreshes once when the token refused is the one stored", async () => {
    setLocks(fakeLocks());
    const server = rotatingApi({ staleAccessRefused: true });
    storeSession({ accessToken: access(1) });
    const tab = await openTab(server);
    const res = await tab.api.get("/api/v1/user/following");
    expect(server.refreshes).toEqual(["refresh-1"]);
    expect(res.data.as).toBe(access(2));
  });

  it("goes on as a visitor when another tab signed out meanwhile, without a refresh", async () => {
    setLocks(fakeLocks());
    const server = rotatingApi();
    storeSession({ accessToken: access(1) });
    const tab = await openTab(server);
    localStorage.removeItem("moa.session");
    const res = await tab.api.get("/api/v1/discover/home");
    expect(res.data.visitor).toBe(true);
    expect(server.refreshes).toEqual([]);
    expect(tab.session.getSession()).toBeNull();
  });
});

describe("SESSION_REUSED", () => {
  it("signs out once, leaves one notice, and never refreshes again", async () => {
    setLocks(fakeLocks());
    const server = rotatingApi();
    storeSession({ accessToken: server.issue(access(1, PAST)) });
    const tab = await openTab(server);
    // Someone else used refresh-1 over 30 seconds ago.
    const thief = await openTab(server);
    await thief.refreshAccess();
    server.advance(31 * 1000);
    storeSession({ accessToken: access(1, PAST) });
    const heard = vi.fn();
    tab.session.subscribe(heard);

    const [read, write] = await Promise.allSettled([
      tab.api.get("/api/v1/discover/home"),
      tab.api.post("/api/v1/clubs/follow/3"),
    ]);

    expect(server.refreshes).toEqual(["refresh-1", "refresh-1"]);
    expect(server.ended).toBe(true);
    expect(tab.session.getSession()).toBeNull();
    expect(localStorage.getItem("moa.session")).toBeNull();
    expect(tab.session.getNotice()).toMatchObject({ reason: "reused" });
    expect(JSON.parse(localStorage.getItem("moa.signedout"))).toMatchObject({ reason: "reused" });
    // A read goes on as a visitor; a write is refused rather than sent as nobody.
    expect(read.value.data.visitor).toBe(true);
    expect(write.reason).toMatchObject({ authExpired: true });

    // Nothing left to refresh with: later requests go as a visitor, and nothing loops.
    const notices = heard.mock.calls.length;
    await tab.api.get("/api/v1/discover/home");
    await expect(tab.refreshAccess()).rejects.toMatchObject({ signedOut: true });
    expect(server.refreshes).toHaveLength(2);
    expect(tab.session.getNotice()).toMatchObject({ reason: "reused" });
    expect(heard.mock.calls.length).toBe(notices);
  });

  /** A refresh answered SESSION_REUSED after `meanwhile` (another tab's write) landed while it was out. */
  async function reusedWhile(meanwhile) {
    setLocks(fakeLocks());
    storeSession({ accessToken: access(1), refresh: "refresh-0" });
    const tab = await openTab(rotatingApi());
    tab.api.defaults.adapter = vi.fn(async (config) => {
      meanwhile();
      tab.session.syncSession();
      return reply(config, 401, { message: "This session was ended", error_code: "SESSION_REUSED" });
    });
    await expect(tab.refreshAccess()).rejects.toMatchObject({ reason: "reused", signedOut: true });
    return tab;
  }

  it("ends the session whichever of its tokens this tab holds now", async () => {
    // The same session's newer tokens, from a tab on an older page that doesn't take the lock.
    const tab = await reusedWhile(() => storeSession({ accessToken: access(3), refresh: "refresh-3" }));
    expect(tab.session.getSession()).toBeNull();
    expect(tab.session.getNotice()).toMatchObject({ reason: "reused" });
  });

  it("leaves a different sign-in alone", async () => {
    const other = fakeJwt({ user_id: 8, token_type: "access_token", sid: "sess-other", exp: FRESH });
    const tab = await reusedWhile(() => storeSession({ accessToken: other, refresh: "refresh-other" }));
    expect(tab.session.getSession()).toMatchObject({ access_token: other });
    expect(tab.session.getNotice()).toBeNull();
  });
});

describe("CLUB_NOT_VERIFIED", () => {
  it("signs a club's account out with a word why, and a read goes on as a visitor", async () => {
    const server = rotatingApi();
    storeSession({ accessToken: access(1) });
    const tab = await openTab(server);
    tab.api.defaults.adapter = vi.fn(async (config) =>
      config.headers.Authorization
        ? reply(config, 403, { message: "Club is not verified", error_code: "CLUB_NOT_VERIFIED" })
        : reply(config, 200, { visitor: true }),
    );
    const res = await tab.api.get("/api/v1/discover/home");
    expect(res.data.visitor).toBe(true);
    expect(tab.session.getSession()).toBeNull();
    expect(tab.session.getNotice()).toMatchObject({ reason: "club" });
  });

  it("from the refresh, too", async () => {
    const server = rotatingApi();
    storeSession({ accessToken: access(1, PAST) });
    const tab = await openTab(server);
    tab.api.defaults.adapter = vi.fn(async (config) => reply(config, 403, { message: "Club is not verified", error_code: "CLUB_NOT_VERIFIED" }));
    await expect(tab.refreshAccess()).rejects.toMatchObject({ signedOut: true, reason: "club" });
    expect(tab.session.getSession()).toBeNull();
    expect(tab.session.getNotice()).toMatchObject({ reason: "club" });
  });
});

describe("another tab's writes (the storage event)", () => {
  it("takes another tab's new tokens, and signs out when it signs out", async () => {
    const server = rotatingApi();
    storeSession({ accessToken: access(1) });
    const tab = await openTab(server);
    const heard = vi.fn();
    tab.session.subscribe(heard);

    storeSession({ accessToken: access(2), refresh: "refresh-2" });
    storageEvent("moa.session", localStorage.getItem("moa.session"));
    expect(tab.session.getSession()).toMatchObject({ access_token: access(2), refresh_token: "refresh-2" });
    expect(heard).toHaveBeenCalled();

    localStorage.removeItem("moa.session");
    storageEvent("moa.session", null);
    expect(tab.session.getSession()).toBeNull();
  });

  it("signs out when another tab clears all of storage", async () => {
    storeSession({ accessToken: access(1) });
    const tab = await openTab(rotatingApi());
    localStorage.clear();
    storageEvent(null, null);
    expect(tab.session.getSession()).toBeNull();
  });

  it("shows the notice another tab left, and drops it when it is dismissed there", async () => {
    storeSession({ accessToken: access(1) });
    const tab = await openTab(rotatingApi());
    localStorage.removeItem("moa.session");
    storageEvent("moa.session", null);
    localStorage.setItem("moa.signedout", JSON.stringify({ reason: "reused", at: Date.now() }));
    storageEvent("moa.signedout", localStorage.getItem("moa.signedout"));
    expect(tab.session.getNotice()).toMatchObject({ reason: "reused" });

    localStorage.removeItem("moa.signedout");
    storageEvent("moa.signedout", null);
    expect(tab.session.getNotice()).toBeNull();
  });

  it("ignores other keys", async () => {
    storeSession({ accessToken: access(1) });
    const tab = await openTab(rotatingApi());
    const heard = vi.fn();
    tab.session.subscribe(heard);
    storageEvent("something.else", "1");
    expect(heard).not.toHaveBeenCalled();
  });

  it("reads storage again when the page comes back from the back-forward cache", async () => {
    storeSession({ accessToken: access(1) });
    const tab = await openTab(rotatingApi());
    storeSession({ accessToken: access(2), refresh: "refresh-2" });
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(tab.session.getSession().refresh_token).toBe("refresh-2");
  });
});

describe("the lock itself", () => {
  it("runs one holder at a time with a lease, and releases it", async () => {
    const order = [];
    const job = (name) => async () => {
      order.push(`${name} in`);
      await new Promise((resolve) => setTimeout(resolve, 15));
      order.push(`${name} out`);
      return name;
    };
    await expect(Promise.all([withLease(job("a")), withLease(job("b"))])).resolves.toEqual(["a", "b"]);
    expect(order).toEqual(["a in", "a out", "b in", "b out"]);
    expect(localStorage.getItem(LEASE_KEY)).toBeNull();
  });

  it("takes over a lease a closed tab left behind once it runs out", async () => {
    localStorage.setItem(LEASE_KEY, JSON.stringify({ id: "gone", until: Date.now() - 1 }));
    await expect(withLease(async () => "mine")).resolves.toBe("mine");
  });

  it("releases the lease when the refresh fails", async () => {
    await expect(withLease(async () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    expect(localStorage.getItem(LEASE_KEY)).toBeNull();
  });

  it("falls back to the lease when the browser refuses the Web Lock", async () => {
    setLocks({ request: vi.fn(() => Promise.reject(new DOMException("denied", "SecurityError"))) });
    await expect(withRefreshLock(async () => "ran")).resolves.toBe("ran");
  });

  it("passes the refresh's own failure through, without running it twice", async () => {
    setLocks(fakeLocks());
    const fn = vi.fn(async () => {
      throw new Error("refused");
    });
    await expect(withRefreshLock(fn)).rejects.toThrow("refused");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
