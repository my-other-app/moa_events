// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGateway, upstreamPath } from "@/server/session/gateway";
import { cookieNames, parseSession, readCookies, serializeCookie } from "@/server/session/cookies";
import { resetRefreshesForTests } from "@/server/session/refresh";

/*
 * The site's gateway (src/server/session/gateway.js), when the build keeps a
 * visitor's tokens in HttpOnly cookies: which token a call goes with, how a
 * session is renewed and ended, and that no token ever reaches the page.
 */

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(claims)}.c2ln`;
const NOW = Date.UTC(2026, 10, 20, 10, 0, 0);
const sec = (ms) => Math.floor(ms / 1000);
const access = ({ sid = "s1", user = 7, exp = sec(NOW) + 3600, n = 0 } = {}) => jwt({ user_id: user, token_type: "access_token", sid, exp, n });
const refresh = ({ sid = "s1", user = 7, gen = 0, exp = sec(NOW) + 30 * 86400 } = {}) => jwt({ user_id: user, token_type: "refresh_token", sid, gen, exp });

const API = "http://backend:8000";
const SITE = "https://myotherapp.in";
const names = cookieNames(true);

let calls;
let routes;
const fetchImpl = vi.fn(async (url, init = {}) => {
  const u = new URL(url);
  const headers = new Headers(init.headers);
  const call = { method: init.method || "GET", path: u.pathname, search: u.search, auth: headers.get("authorization"), headers, body: init.body };
  calls.push(call);
  for (const [match, reply] of routes) if (match(call)) return reply(call);
  return Response.json({ message: "Not found" }, { status: 404 });
});
const on = (method, path, reply) => routes.push([(c) => c.method === method && c.path === path, reply]);

const gateway = createGateway({ fetchImpl, apiBase: API, now: () => NOW, timeoutMs: 200 });

function ask(path, { method = "GET", cookies = {}, auth = null, body, headers = {}, site = "same-origin", origin = SITE } = {}) {
  const h = new Headers({ host: "myotherapp.in", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.9", "user-agent": "TestBrowser/1", ...headers });
  if (site) h.set("sec-fetch-site", site);
  if (origin && method !== "GET" && method !== "HEAD") h.set("origin", origin);
  if (auth) h.set("x-moa-auth", auth);
  const jar = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (jar) h.set("cookie", jar);
  return gateway(new Request(`${SITE}/api/gateway${path}`, { method, headers: h, body }));
}

const sessionCookie = (a = access(), r = refresh()) => ({ [names.session]: `${a}~${r}` });
/** The cookies an answer sets, by name: {value, maxAge, attributes}. */
function setCookies(res) {
  const out = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split("; ");
    const i = pair.indexOf("=");
    out[pair.slice(0, i)] = { value: pair.slice(i + 1), maxAge: Number(attrs.find((a) => a.startsWith("Max-Age="))?.slice(8)), attrs };
  }
  return out;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SESSION_COOKIE", "on");
  calls = [];
  routes = [];
  fetchImpl.mockClear();
  resetRefreshesForTests();
});
afterEach(() => vi.unstubAllEnvs());

describe("when the build keeps tokens in localStorage", () => {
  it("answers nothing at all", async () => {
    vi.stubEnv("NEXT_PUBLIC_SESSION_COOKIE", "");
    const res = await ask("/api/v1/events/info/68", { cookies: sessionCookie() });
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("who may use it", () => {
  it("refuses a request another site, or another myotherapp.in host, started", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const res = await ask("/api/v1/events/info/68", { site, cookies: sessionCookie() });
      expect(res.status).toBe(403);
      expect((await res.json()).error_code).toBe("CROSS_ORIGIN_REFUSED");
    }
    expect(calls).toEqual([]);
  });

  it("refuses a change that doesn't name this origin, or names another", async () => {
    expect((await ask("/api/v1/clubs/follow/3", { method: "POST", origin: "https://circuit.myotherapp.in", site: null })).status).toBe(403);
    expect((await ask("/api/v1/clubs/follow/3", { method: "POST", origin: null, site: null })).status).toBe(403);
    expect((await ask("/api/v1/clubs/follow/3", { method: "POST", origin: "null", site: "same-origin" })).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("answers a preflight itself, with no CORS at all", async () => {
    const res = await ask("/api/v1/events/info/68", { method: "OPTIONS", site: null });
    expect(res.status).toBe(204);
    expect([...res.headers.keys()].some((k) => k.startsWith("access-control-"))).toBe(false);
    expect(calls).toEqual([]);
  });

  it("passes on /api/v1/ only, never the renewal or sign-out routes, an event stream or a way out of the API", () => {
    expect(upstreamPath("/api/gateway/api/v1/events/info/68")).toBe("/api/v1/events/info/68");
    for (const bad of [
      "/api/gateway/api/v1/auth/refresh",
      "/api/gateway/api/v1/auth/logout",
      "/api/gateway/api/v1/events/68/live/stream",
      "/api/gateway/api/v1/%2e%2e/admin",
      "/api/gateway/api/v1/a/%2E%2E/%2e%2e/x",
      "/api/gateway/api/v1/a%2fb",
      "/api/gateway/openapi.json",
      "/api/gateway/api/v2/x",
      "/api/gateway",
      "/api/other/api/v1/x",
    ]) {
      expect(upstreamPath(bad)).toBeNull();
    }
  });
});

describe("which token goes", () => {
  it("sends the account's token when signed in, never the guest's beside it, and nothing else of the browser's", async () => {
    const a = access();
    on("GET", "/api/v1/events/info/68", () => Response.json({ id: 68 }, { headers: { "set-cookie": "access_token=x; HttpOnly", "access-control-allow-origin": "https://myotherapp.in", etag: '"e1"' } }));
    const res = await ask("/api/v1/events/info/68?x=1", { cookies: { ...sessionCookie(a), [names.guest]: access({ sid: "g", user: 99 }), other: "1" }, headers: { "x-site-token": "nope", authorization: "Bearer page-script", "if-none-match": '"e0"', "x-live-key": "k1", "x-live-version": "2" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 68 });
    const [call] = calls;
    expect(call.search).toBe("?x=1");
    expect(call.auth).toBe(`Bearer ${a}`);
    expect(call.headers.get("cookie")).toBeNull();
    expect(call.headers.get("x-site-token")).toBeNull();
    expect(call.headers.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(call.headers.get("x-real-ip")).toBe("203.0.113.9");
    expect(call.headers.get("user-agent")).toBe("TestBrowser/1");
    expect(call.headers.get("if-none-match")).toBe('"e0"');
    expect(call.headers.get("x-live-key")).toBe("k1");
    // The live room's client version goes on, so the API answers this release's bodies.
    expect(call.headers.get("x-live-version")).toBe("2");
    expect(res.headers.get("x-moa-as")).toBe("user");
    expect(res.headers.get("etag")).toBe('"e1"');
    // Nothing of the API's cookies or CORS comes back.
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("sends the guest token when signed out, and none on a `user` call", async () => {
    const g = access({ sid: "g", user: 99 });
    on("GET", "/api/v1/events/info/68", () => Response.json({ id: 68 }));
    const res = await ask("/api/v1/events/info/68", { cookies: { [names.guest]: g } });
    expect(calls[0].auth).toBe(`Bearer ${g}`);
    expect(res.headers.get("x-moa-as")).toBe("guest");
    expect(res.headers.get("x-moa-session")).toBe("none");
    await ask("/api/v1/threads/t1", { auth: "user", cookies: { [names.guest]: g } });
    expect(calls[1].auth).toBeNull();
  });

  it("sends nothing on a `none` call, signed in or not", async () => {
    on("POST", "/api/v1/auth/password/forgot", () => Response.json({ sent: true }));
    await ask("/api/v1/auth/password/forgot", { method: "POST", auth: "none", cookies: sessionCookie(), body: "{}" });
    expect(calls[0].auth).toBeNull();
  });

  it("says when there is neither a session nor a guest", async () => {
    on("GET", "/api/v1/events/info/68", () => Response.json({ id: 68 }));
    const res = await ask("/api/v1/events/info/68");
    expect(res.headers.get("x-moa-as")).toBe("visitor");
    expect(res.headers.get("x-moa-session")).toBe("none");
    expect(res.headers.get("x-moa-guest")).toBe("none");
  });

  it("passes the body and its type on unchanged", async () => {
    on("POST", "/api/v1/support/uploads", (c) => Response.json({ got: c.headers.get("content-type"), size: c.body.byteLength }));
    const res = await ask("/api/v1/support/uploads", { method: "POST", cookies: sessionCookie(), body: "--b\r\nhello\r\n--b--", headers: { "content-type": "multipart/form-data; boundary=b" } });
    expect(await res.json()).toEqual({ got: "multipart/form-data; boundary=b", size: 17 });
  });
});

describe("keeping the session alive", () => {
  it("renews a token about to run out first, and keeps the new pair in the cookie", async () => {
    const old = access({ exp: sec(NOW) + 20 });
    const r1 = refresh({ gen: 0 });
    const a2 = access({ n: 2 });
    const r2 = refresh({ gen: 1 });
    on("POST", "/api/v1/auth/refresh", (c) => (new URLSearchParams(c.body).get("token") === r1 ? Response.json({ access_token: a2, refresh_token: r2 }) : Response.json({}, { status: 401 })));
    on("GET", "/api/v1/user/profile/me", () => Response.json({ id: 7 }));
    const res = await ask("/api/v1/user/profile/me", { cookies: sessionCookie(old, r1) });
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/auth/refresh", "/api/v1/user/profile/me"]);
    expect(calls[0].headers.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(calls[1].auth).toBe(`Bearer ${a2}`);
    const set = setCookies(res);
    expect(parseSession(set[names.session].value)).toEqual({ access: a2, refresh: r2 });
    expect(set[names.session].attrs).toEqual(expect.arrayContaining(["Path=/", "HttpOnly", "SameSite=Lax", "Secure"]));
    expect(set[names.session].maxAge).toBe(30 * 86400);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // The new tokens are never in the answer.
    expect(JSON.stringify(await res.json())).not.toContain(a2);
  });

  it("renews once for many calls at once, and a call that set out with the old cookie a moment later gets the same pair", async () => {
    const old = access({ exp: sec(NOW) + 5 });
    const r1 = refresh();
    const a2 = access({ n: 2 });
    const r2 = refresh({ gen: 1 });
    let release;
    const gate = new Promise((r) => (release = r));
    on("POST", "/api/v1/auth/refresh", async () => {
      await gate;
      return Response.json({ access_token: a2, refresh_token: r2 });
    });
    on("GET", "/api/v1/events/list", () => Response.json({ items: [] }));
    const many = [1, 2, 3].map(() => ask("/api/v1/events/list", { cookies: sessionCookie(old, r1) }));
    await new Promise((r) => setTimeout(r, 10));
    release();
    const answers = await Promise.all(many);
    const late = await ask("/api/v1/events/list", { cookies: sessionCookie(old, r1) });
    expect(calls.filter((c) => c.path === "/api/v1/auth/refresh")).toHaveLength(1);
    for (const res of [...answers, late]) expect(parseSession(setCookies(res)[names.session].value)).toEqual({ access: a2, refresh: r2 });
    expect(calls.filter((c) => c.path === "/api/v1/events/list").every((c) => c.auth === `Bearer ${a2}`)).toBe(true);
  });

  it("renews once when the API refuses the token, and sends the call again", async () => {
    const a1 = access();
    const a2 = access({ n: 2 });
    on("GET", "/api/v1/user/following", (c) => (c.auth === `Bearer ${a2}` ? Response.json({ items: [] }) : Response.json({ message: "expired" }, { status: 401 })));
    on("POST", "/api/v1/auth/refresh", () => Response.json({ access_token: a2, refresh_token: refresh({ gen: 1 }) }));
    const res = await ask("/api/v1/user/following", { cookies: sessionCookie(a1) });
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/user/following", "/api/v1/auth/refresh", "/api/v1/user/following"]);
  });

  it("ends the session when the API refuses the renewal: a read goes on as a visitor, with the reason", async () => {
    on("GET", "/api/v1/events/info/68", (c) => (c.auth ? Response.json({}, { status: 401 }) : Response.json({ id: 68 })));
    on("POST", "/api/v1/auth/refresh", () => Response.json({ message: "used twice", error_code: "SESSION_REUSED" }, { status: 401 }));
    const res = await ask("/api/v1/events/info/68", { cookies: sessionCookie() });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-moa-as")).toBe("visitor");
    expect(res.headers.get("x-moa-session")).toBe("ended; reason=reused");
    expect(setCookies(res)[names.session]).toMatchObject({ value: "", maxAge: 0 });
    expect(calls.at(-1).auth).toBeNull();
  });

  it("refuses a change once the session can't be kept alive, rather than sending it as a guest", async () => {
    const g = access({ sid: "g", user: 99 });
    on("POST", "/api/v1/auth/refresh", () => Response.json({ message: "signed out" }, { status: 401 }));
    on("POST", "/api/v1/events/registration/68/register", () => Response.json({ ok: true }));
    const res = await ask("/api/v1/events/registration/68/register", { method: "POST", cookies: { ...sessionCookie(access({ exp: sec(NOW) - 5 })), [names.guest]: g }, body: "{}" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error_code: "SIGNED_OUT" });
    expect(res.headers.get("x-moa-session")).toBe("ended");
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/auth/refresh"]);
  });

  it("ends the session when the API refuses even a fresh token (ended elsewhere)", async () => {
    on("GET", "/api/v1/user/following", (c) => (c.auth ? Response.json({}, { status: 401 }) : Response.json({ message: "sign in" }, { status: 401 })));
    on("POST", "/api/v1/auth/refresh", () => Response.json({ access_token: access({ n: 3 }), refresh_token: refresh({ gen: 2 }) }));
    const res = await ask("/api/v1/user/following", { cookies: sessionCookie() });
    expect(res.headers.get("x-moa-session")).toBe("ended");
    expect(setCookies(res)[names.session]).toMatchObject({ value: "", maxAge: 0 });
  });

  it("keeps the session when the API can't be asked to renew: its refusal stands", async () => {
    on("GET", "/api/v1/user/following", () => Response.json({ message: "expired" }, { status: 401 }));
    on("POST", "/api/v1/auth/refresh", () => new Response("down", { status: 502 }));
    const res = await ask("/api/v1/user/following", { cookies: sessionCookie() });
    expect(res.status).toBe(401);
    expect(res.headers.get("x-moa-session")).toBeNull();
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("signs a club's account out here, with a word why; a read goes on as a visitor", async () => {
    on("GET", "/api/v1/events/info/68", (c) => (c.auth ? Response.json({ message: "Club is not verified", error_code: "CLUB_NOT_VERIFIED" }, { status: 403 }) : Response.json({ id: 68 })));
    const res = await ask("/api/v1/events/info/68", { cookies: sessionCookie() });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-moa-session")).toBe("ended; reason=club");
  });
});

describe("checking a sign-in (`session` calls)", () => {
  it("passes a club's refusal on as it came, so the sheet can say so, and ends the session", async () => {
    on("GET", "/api/v1/user/profile/me", (c) => (c.auth ? Response.json({ message: "Club is not verified", error_code: "CLUB_NOT_VERIFIED" }, { status: 403 }) : Response.json({}, { status: 401 })));
    const res = await ask("/api/v1/user/profile/me", { auth: "session", cookies: sessionCookie() });
    expect(res.status).toBe(403);
    expect((await res.json()).error_code).toBe("CLUB_NOT_VERIFIED");
    expect(res.headers.get("x-moa-session")).toBe("ended; reason=club");
    expect(calls).toHaveLength(1);
  });

  it("never goes on as a visitor when the session can't be renewed", async () => {
    on("GET", "/api/v1/user/profile/me", () => Response.json({}, { status: 401 }));
    on("POST", "/api/v1/auth/refresh", () => Response.json({}, { status: 401 }));
    const res = await ask("/api/v1/user/profile/me", { auth: "session", cookies: sessionCookie() });
    expect(res.status).toBe(401);
    expect((await res.json()).error_code).toBe("SIGNED_OUT");
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/user/profile/me", "/api/v1/auth/refresh"]);
  });
});

describe("the guest token", () => {
  it("is forgotten once refused, and the call goes once more as a plain visitor", async () => {
    on("GET", "/api/v1/events/info/68", (c) => (c.auth ? Response.json({}, { status: 401 }) : Response.json({ id: 68 })));
    const res = await ask("/api/v1/events/info/68", { cookies: { [names.guest]: access({ sid: "g" }) } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-moa-guest")).toBe("gone");
    expect(setCookies(res)[names.guest]).toMatchObject({ value: "", maxAge: 0 });
  });

  it("a registration hands back becomes the guest cookie, and leaves the answer", async () => {
    const g = access({ sid: "g9", user: 99, exp: sec(NOW) + 7200 });
    on("POST", "/api/v1/events/registration/68/register", () => Response.json({ ticket_id: "MOA1", auth_token: { access_token: g, refresh_token: refresh({ sid: "g9" }), token_type: "Bearer" } }));
    const res = await ask("/api/v1/events/registration/68/register", { method: "POST", body: JSON.stringify({ full_name: "A" }), headers: { "content-type": "application/json" } });
    const data = await res.json();
    expect(data).toEqual({ ticket_id: "MOA1", auth_token: { kept: "guest" } });
    expect(res.headers.get("x-moa-guest")).toBe("kept");
    const set = setCookies(res);
    expect(set[names.guest].value).toBe(g);
    expect(set[names.guest].maxAge).toBe(7200);
  });

  it("for someone signed in who claimed a place for another address, becomes the pay-as cookie, used only to pay", async () => {
    const g = access({ sid: "g9", user: 99 });
    on("POST", "/api/v1/waitlist/offers/tok/claim", () => Response.json({ ticket_id: "MOA2", pay_amount: 500, auth_token: { access_token: g, refresh_token: refresh({ sid: "g9" }) } }));
    const res = await ask("/api/v1/waitlist/offers/tok/claim", { method: "POST", cookies: sessionCookie(), body: "{}" });
    expect((await res.json()).auth_token).toEqual({ kept: "pay_as" });
    const set = setCookies(res);
    expect(set[names.payAs].value).toBe(g);
    expect(set[names.payAs].maxAge).toBe(3600);
    expect(set[names.guest]).toBeUndefined();

    on("POST", "/api/v1/payments/orders", (c) => Response.json({ id: 1, as: c.auth }));
    const paid = await ask("/api/v1/payments/orders?checkout=2", { method: "POST", auth: "pay-as", cookies: { ...sessionCookie(), [names.payAs]: g }, body: "{}" });
    expect((await paid.json()).as).toBe(`Bearer ${g}`);
    expect(paid.headers.get("x-moa-as")).toBe("pay-as");
  });
});

describe("signing in", () => {
  it.each(["/api/v1/auth/google", "/api/v1/auth/token", "/api/v1/user/register", "/api/v1/auth/password/reset"])("%s: the tokens become the session cookie and leave the answer", async (path) => {
    const a = access({ sid: "new", user: 8 });
    const r = refresh({ sid: "new", user: 8 });
    on("POST", path, () => Response.json({ username: "asha", access_token: a, refresh_token: r, token_type: "Bearer" }));
    const res = await ask(path, { method: "POST", auth: "none", body: "{}" });
    const data = await res.json();
    expect(data).toEqual({ username: "asha", token_type: "Bearer", session: { sid: "new", user: 8 } });
    expect(JSON.stringify(data)).not.toMatch(/access_token|refresh_token/);
    expect(res.headers.get("x-moa-session")).toBe("started");
    expect(parseSession(setCookies(res)[names.session].value)).toEqual({ access: a, refresh: r });
    expect(calls[0].auth).toBeNull();
  });

  it("takes tokens out of any other answer too, without making them a session", async () => {
    on("GET", "/api/v1/odd", () => Response.json({ access_token: access(), refresh_token: refresh(), other: 1 }));
    const res = await ask("/api/v1/odd", { cookies: {} });
    expect(await res.json()).toEqual({ other: 1 });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("passes a refused sign-in on as it came (a second factor asked for)", async () => {
    on("POST", "/api/v1/auth/token", () => Response.json({ message: "code", error_code: "TOTP_REQUIRED" }, { status: 401 }));
    const res = await ask("/api/v1/auth/token", { method: "POST", auth: "none", body: "username=a&password=b", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(res.status).toBe(401);
    expect((await res.json()).error_code).toBe("TOTP_REQUIRED");
    expect(new URLSearchParams(new TextDecoder().decode(calls[0].body)).get("username")).toBe("a");
  });
});

describe("what passes through", () => {
  it("a picture, its cache rules, and a 304", async () => {
    on("GET", "/api/v1/events/tickets/MOA1/image", (c) =>
      c.headers.get("if-none-match") === '"v1"' ? new Response(null, { status: 304, headers: { etag: '"v1"' } }) : new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300", etag: '"v1"' } }),
    );
    const res = await ask("/api/v1/events/tickets/MOA1/image", { cookies: sessionCookie() });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
    const again = await ask("/api/v1/events/tickets/MOA1/image", { cookies: sessionCookie(), headers: { "if-none-match": '"v1"' } });
    expect(again.status).toBe(304);
  });

  it("points a redirect into the API at the gateway, so the browser follows it here; any other passes as it came", async () => {
    on("GET", "/api/v1/events/list/", () => new Response(null, { status: 307, headers: { location: "https://backend:8000/api/v1/events/list?is_registered=true" } }));
    const res = await ask("/api/v1/events/list/", { cookies: sessionCookie() });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/api/gateway/api/v1/events/list?is_registered=true");
    on("GET", "/api/v1/certificates/c1/file", () => new Response(null, { status: 307, headers: { location: "https://bucket.s3.amazonaws.com/c1.pdf?X-Amz-Signature=x" } }));
    expect((await ask("/api/v1/certificates/c1/file")).headers.get("location")).toBe("https://bucket.s3.amazonaws.com/c1.pdf?X-Amz-Signature=x");
    on("GET", "/api/v1/rel", () => new Response(null, { status: 302, headers: { location: "/api/v1/other" } }));
    expect((await ask("/api/v1/rel")).headers.get("location")).toBe("/api/gateway/api/v1/other");
  });

  it("says plainly when the API takes too long, or can't be reached", async () => {
    on("GET", "/api/v1/slow", () => new Promise((_, reject) => setTimeout(() => reject(new Error("aborted")), 400)));
    const slow = await ask("/api/v1/slow");
    expect(slow.status).toBe(504);
    expect((await slow.json()).error_code).toBe("UPSTREAM_TIMEOUT");
    on("GET", "/api/v1/down", () => {
      throw new TypeError("fetch failed");
    });
    const down = await ask("/api/v1/down");
    expect(down.status).toBe(502);
  });

  it("refuses a body bigger than the proxy in front allows", async () => {
    const res = await ask("/api/v1/support/uploads", { method: "POST", body: "x", headers: { "content-length": String(11 * 1024 * 1024) } });
    expect(res.status).toBe(413);
    expect(calls).toEqual([]);
  });
});

describe("the cookies", () => {
  it("are __Host- on https, plain on a developer's http", () => {
    expect(cookieNames(true)).toEqual({ session: "__Host-moa_session", guest: "__Host-moa_guest", payAs: "__Host-moa_payas" });
    expect(cookieNames(false).session).toBe("moa_session");
    expect(serializeCookie("__Host-moa_session", "a~b", { maxAge: 10, secure: true })).toBe("__Host-moa_session=a~b; Path=/; Max-Age=10; HttpOnly; SameSite=Lax; Secure");
    expect(readCookies("a=1; b=2; a=3")).toEqual({ a: "1", b: "2" });
  });

  it("are never read under their plain names on https (another host could have set those)", async () => {
    on("GET", "/api/v1/events/info/68", () => Response.json({ id: 68 }));
    await ask("/api/v1/events/info/68", { cookies: { moa_session: `${access()}~${refresh()}` } });
    expect(calls[0].auth).toBeNull();
  });

  it("ignore anything that isn't a token", async () => {
    on("GET", "/api/v1/events/info/68", () => Response.json({ id: 68 }));
    await ask("/api/v1/events/info/68", { cookies: { [names.session]: "x~y", [names.guest]: "<script>" } });
    expect(calls[0].auth).toBeNull();
  });
});
