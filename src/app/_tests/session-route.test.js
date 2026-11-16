// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionRoutes, laterSession } from "@/server/session/session";
import { cookieNames, parseSession } from "@/server/session/cookies";
import { resetRefreshesForTests } from "@/server/session/refresh";

/*
 * /api/session (src/server/session/session.js): tokens a browser kept in
 * localStorage handed over into the cookies once, the guest forgotten, and
 * signing out, which ends the session on the API too.
 */

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.c2ln`;
const NOW = Date.UTC(2026, 10, 20, 10, 0, 0);
const sec = (ms) => Math.floor(ms / 1000);
const access = ({ sid = "s1", user = 7, exp = sec(NOW) + 3600 } = {}) => jwt({ user_id: user, token_type: "access_token", sid, exp });
const refresh = ({ sid = "s1", user = 7, gen = 0, exp = sec(NOW) + 30 * 86400 } = {}) => jwt({ user_id: user, token_type: "refresh_token", sid, gen, exp });
const names = cookieNames(true);

let calls;
const fetchImpl = vi.fn(async (url, init = {}) => {
  const u = new URL(url);
  calls.push({ method: init.method, path: u.pathname, auth: new Headers(init.headers).get("authorization"), body: init.body });
  if (u.pathname === "/api/v1/auth/refresh") return Response.json({ access_token: access({ exp: sec(NOW) + 3600 }), refresh_token: refresh({ gen: 5 }) });
  return Response.json({ ended: true });
});
const routes = createSessionRoutes({ fetchImpl, apiBase: "http://backend:8000", now: () => NOW });

function ask(method, { body, cookies = {}, site = "same-origin", origin = "https://myotherapp.in" } = {}) {
  const h = new Headers({ host: "myotherapp.in", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.9", "content-type": "application/json" });
  if (site) h.set("sec-fetch-site", site);
  if (origin && method !== "GET") h.set("origin", origin);
  const jar = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (jar) h.set("cookie", jar);
  return routes[method](new Request("https://myotherapp.in/api/session", { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }));
}
const setCookies = (res) =>
  Object.fromEntries(
    res.headers.getSetCookie().map((line) => {
      const [pair, ...attrs] = line.split("; ");
      const i = pair.indexOf("=");
      return [pair.slice(0, i), { value: pair.slice(i + 1), maxAge: Number(attrs.find((a) => a.startsWith("Max-Age="))?.slice(8)) }];
    }),
  );

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SESSION_COOKIE", "on");
  calls = [];
  resetRefreshesForTests();
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/session", () => {
  it("is not there when the build keeps tokens in localStorage", async () => {
    vi.stubEnv("NEXT_PUBLIC_SESSION_COOKIE", "off");
    expect((await ask("GET")).status).toBe(404);
    expect((await ask("POST", { body: { action: "adopt" } })).status).toBe(404);
  });

  it("says who is signed in, never the tokens", async () => {
    const a = access();
    const res = await ask("GET", { cookies: { [names.session]: `${a}~${refresh()}`, [names.guest]: access({ sid: "g" }) } });
    const data = await res.json();
    expect(data).toEqual({ signedIn: true, sid: "s1", user: 7, guest: true });
    expect(JSON.stringify(data)).not.toContain(a);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses what another site (or host) asks", async () => {
    expect((await ask("GET", { site: "same-site" })).status).toBe(403);
    expect((await ask("POST", { body: { action: "adopt" }, origin: "https://evil.example", site: null })).status).toBe(403);
    expect((await ask("DELETE", { origin: null, site: null })).status).toBe(403);
  });
});

describe("handing over tokens kept in localStorage", () => {
  it("keeps them in the cookies and answers who they are", async () => {
    const a = access();
    const r = refresh();
    const g = access({ sid: "g", user: 99, exp: sec(NOW) + 1800 });
    const res = await ask("POST", { body: { action: "adopt", session: { access_token: a, refresh_token: r }, guest: { access_token: g, refresh_token: "x" } } });
    expect(await res.json()).toEqual({ signedIn: true, sid: "s1", user: 7, guest: true });
    const set = setCookies(res);
    expect(parseSession(set[names.session].value)).toEqual({ access: a, refresh: r });
    expect(set[names.guest]).toEqual({ value: g, maxAge: 1800 });
    expect(calls).toEqual([]);
  });

  it("takes an expired access token (the gateway renews it), never an expired refresh token or something that isn't one", async () => {
    const ok = await ask("POST", { body: { action: "adopt", session: { access_token: access({ exp: sec(NOW) - 100 }), refresh_token: refresh() } } });
    expect((await ok.json()).signedIn).toBe(true);
    for (const session of [
      { access_token: access(), refresh_token: refresh({ exp: sec(NOW) - 1 }) },
      { access_token: access(), refresh_token: access() },
      { access_token: "abc", refresh_token: refresh() },
      { access_token: access(), refresh_token: `${refresh()}~x` },
      null,
    ]) {
      const res = await ask("POST", { body: { action: "adopt", session } });
      expect((await res.json()).signedIn).toBe(false);
      expect(res.headers.getSetCookie()).toEqual([]);
    }
  });

  it("keeps the cookie it already holds for the same sign-in when that is the later one", async () => {
    const held = { access: access(), refresh: refresh({ gen: 4 }) };
    const older = { access_token: access({ exp: sec(NOW) + 100 }), refresh_token: refresh({ gen: 2 }) };
    const res = await ask("POST", { body: { action: "adopt", session: older }, cookies: { [names.session]: `${held.access}~${held.refresh}` } });
    expect((await res.json()).signedIn).toBe(true);
    expect(res.headers.getSetCookie()).toEqual([]);

    const newer = { access_token: access(), refresh_token: refresh({ gen: 6 }) };
    const res2 = await ask("POST", { body: { action: "adopt", session: newer }, cookies: { [names.session]: `${held.access}~${held.refresh}` } });
    expect(parseSession(setCookies(res2)[names.session].value).refresh).toBe(newer.refresh_token);
  });

  it("takes the handed-over sign-in over another one the cookie holds", () => {
    const held = { access: access({ sid: "old" }), refresh: refresh({ sid: "old", gen: 9 }) };
    const given = { access: access({ sid: "new" }), refresh: refresh({ sid: "new", gen: 0 }) };
    expect(laterSession(held, given)).toBe(given);
    expect(laterSession(null, given)).toBe(given);
  });

  it("refuses a body that isn't a request it takes", async () => {
    expect((await ask("POST", { body: { action: "steal" } })).status).toBe(400);
    const raw = await routes.POST(new Request("https://myotherapp.in/api/session", { method: "POST", headers: { origin: "https://myotherapp.in", "sec-fetch-site": "same-origin", host: "myotherapp.in" }, body: "not json" }));
    expect(raw.status).toBe(400);
  });
});

describe("forgetting the guest", () => {
  it("clears the guest cookie only", async () => {
    const res = await ask("POST", { body: { action: "forget-guest" }, cookies: { [names.session]: `${access()}~${refresh()}`, [names.guest]: access({ sid: "g" }) } });
    expect(await res.json()).toMatchObject({ signedIn: true, guest: false });
    const set = setCookies(res);
    expect(set[names.guest]).toEqual({ value: "", maxAge: 0 });
    expect(set[names.session]).toBeUndefined();
  });
});

describe("signing out", () => {
  it("ends the session on the API with its own token, then clears the cookies", async () => {
    const a = access();
    const res = await ask("DELETE", { cookies: { [names.session]: `${a}~${refresh()}`, [names.payAs]: access({ sid: "p" }), [names.guest]: access({ sid: "g" }) } });
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ method: "DELETE", path: "/api/v1/auth/sessions/s1", auth: `Bearer ${a}`, body: undefined }]);
    const set = setCookies(res);
    expect(set[names.session]).toEqual({ value: "", maxAge: 0 });
    expect(set[names.payAs]).toEqual({ value: "", maxAge: 0 });
    // The guest token a registration left stays, as it always has: signing out drops the account.
    expect(set[names.guest]).toBeUndefined();
  });

  it("renews a token that has run out first, so the end reaches the API", async () => {
    await ask("DELETE", { cookies: { [names.session]: `${access({ exp: sec(NOW) - 60 })}~${refresh()}` } });
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/auth/refresh", "/api/v1/auth/sessions/s1"]);
  });

  it("signs out here even when the API can't be reached", async () => {
    fetchImpl.mockImplementationOnce(async () => {
      throw new TypeError("fetch failed");
    });
    const res = await ask("DELETE", { cookies: { [names.session]: `${access()}~${refresh()}` } });
    expect(res.status).toBe(200);
    expect(setCookies(res)[names.session]).toEqual({ value: "", maxAge: 0 });
  });
});
