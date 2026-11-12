// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DOCS_SLUGS } from "@/content/developers/nav";
import { fakeFetch } from "@/test/next";

/*
 * Who gets into the private developer docs (src/developers/gate.js;
 * feature-register/private-dev-docs-contract.md, decisions 2 and 3), with
 * the API's docs check mocked:
 *   - src/proxy.js, before anything under /developers/ is rendered or read:
 *     no good docs cookie, the docs' 404 (noindex, private, no-store);
 *   - the API is asked at most every 5 minutes per token, so a link taken
 *     away stops working within 5 minutes, and an expired one at once;
 *   - /developers/access?t= sets the cookie and sends you to the quick
 *     start; /developers/sign-out clears it;
 *   - robots.txt keeps /developers/ out, and leaves /developers open.
 */
const ACCESS = "/api/v1/developers/access";
const GOOD = `moa_docs_${"G".repeat(43)}`;
const OTHER = `moa_docs_${"O".repeat(43)}`;
const T0 = Date.parse("2026-11-12T10:00:00+05:30");
const MIN = 60_000;

const PRIVATE_PATHS = [...DOCS_SLUGS.map((s) => `/developers/${s}`), "/developers/openapi.json", "/developers/postman_collection.json", "/developers/nope", "/developers/reference/", "/developers/a/b"];

/** What the API says about each token now: a function of the token, changed by the tests. */
let verdict;
let fetch;
const ok = (expiresAt, extra = {}) => ({ body: { ok: true, kind: "club", expires_at: new Date(expiresAt).toISOString(), club: { id: 311, name: "Circuit Society" }, ...extra } });
const refused = { status: 404, body: { ok: false } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  verdict = (token) => (token === GOOD ? ok(T0 + 7 * 24 * 60 * MIN) : refused);
  fetch = fakeFetch((u, init) => (u.pathname === ACCESS ? verdict(init?.headers?.["MOA-Docs-Token"]) : undefined));
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function fresh(file) {
  vi.resetModules();
  return import(file);
}

const request = (path, { cookie = null, headers = {} } = {}) => new NextRequest(`https://myotherapp.in${path}`, { headers: { ...headers, ...(cookie ? { cookie: `moa_docs=${cookie}` } : {}) } });
const passes = (res) => res.headers.get("x-middleware-next") === "1";
const checks = () => fetch.calls.filter((c) => new URL(c.url).pathname === ACCESS).length;

async function expectPrivate404(res) {
  expect(res.status).toBe(404);
  expect(passes(res)).toBe(false);
  expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect(res.headers.get("cdn-cache-control")).toBe("no-store");
  expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  const body = await res.text();
  expect(body).toContain('<meta name="robots" content="noindex, nofollow">');
  expect(body).toContain("These docs are private.");
  expect(body).toContain("If your club has API access, open them from your dashboard: Settings → Integrations.");
  expect(body).toContain('<a href="/developers">About the MyOtherApp API</a>');
  expect(body).not.toMatch(/quick start|webhook|openapi|scope/i);
}

describe("src/proxy.js: before anything under /developers/ is rendered", () => {
  it("runs on /developers/ and below only; /developers itself, the link and signing out are open", async () => {
    const { proxy, config } = await fresh("../../proxy.js");
    expect(config.matcher).toEqual(["/developers/:path+"]);
    for (const path of ["/developers", "/developers/access?t=nope", "/developers/sign-out", "/events"]) expect(passes(await proxy(request(path)))).toBe(true);
    expect(checks()).toBe(0);
    const { isGatedDocsPath } = await import("@/developers/gate");
    expect(isGatedDocsPath("/developers")).toBe(false);
    expect(isGatedDocsPath("/developers/")).toBe(false);
    expect(isGatedDocsPath("/developers/access")).toBe(false);
    expect(isGatedDocsPath("/developers/access/")).toBe(false);
    expect(isGatedDocsPath("/developers/sign-out")).toBe(false);
    expect(isGatedDocsPath("/developers/access/x")).toBe(true);
    for (const path of PRIVATE_PATHS) expect(isGatedDocsPath(path)).toBe(true);
  });

  it.each(PRIVATE_PATHS)("%s without a docs cookie: the docs' 404, never the page, the API never asked", async (path) => {
    const { proxy } = await fresh("../../proxy.js");
    await expectPrivate404(await proxy(request(path)));
    await expectPrivate404(await proxy(request(path, { cookie: "not-a-docs-token" })));
    expect(checks()).toBe(0);
  });

  it("with a token the API refuses: the same 404, for the page and the downloads alike", async () => {
    const { proxy } = await fresh("../../proxy.js");
    for (const path of PRIVATE_PATHS) await expectPrivate404(await proxy(request(path, { cookie: OTHER })));
    // A refused token is remembered for a minute, not asked about on every page.
    expect(checks()).toBe(1);
    vi.setSystemTime(T0 + MIN + 1);
    await expectPrivate404(await proxy(request("/developers/errors", { cookie: OTHER })));
    expect(checks()).toBe(2);
  });

  it("a good cookie lets every private address through, noindex, asking the API once in 5 minutes", async () => {
    vi.stubEnv("API_SITE_TOKEN", "site-token-0123456789abcdefghijklmnopqrstuv");
    const { proxy } = await fresh("../../proxy.js");
    for (const path of PRIVATE_PATHS) {
      const res = await proxy(request(path, { cookie: GOOD, headers: { "x-forwarded-for": "198.51.100.4" } }));
      expect(passes(res)).toBe(true);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect(checks()).toBe(1);
    const [call] = fetch.calls;
    expect(call.url).toBe("https://api.myotherapp.in/api/v1/developers/access");
    expect(call.init.headers).toMatchObject({ "MOA-Docs-Token": GOOD, "X-Site-Token": "site-token-0123456789abcdefghijklmnopqrstuv", "X-Visitor-IP": "198.51.100.4" });
  });

  it("an access taken away ends within the 5 minutes: remembered until then, a 404 once the answer is 5 minutes old", async () => {
    const { proxy } = await fresh("../../proxy.js");
    expect(passes(await proxy(request("/developers/quick-start", { cookie: GOOD })))).toBe(true);
    // The link is revoked (or the club's access turned off) in the dashboard.
    verdict = () => refused;
    vi.setSystemTime(T0 + 4 * MIN + 59_000);
    expect(passes(await proxy(request("/developers/webhooks", { cookie: GOOD })))).toBe(true);
    expect(checks()).toBe(1);
    vi.setSystemTime(T0 + 5 * MIN);
    await expectPrivate404(await proxy(request("/developers/webhooks", { cookie: GOOD })));
    expect(checks()).toBe(2);
    await expectPrivate404(await proxy(request("/developers/openapi.json", { cookie: GOOD })));
    await expectPrivate404(await proxy(request("/developers/postman_collection.json", { cookie: GOOD })));
  });

  it("an expired link stops at its expiry, to the second, whatever was remembered", async () => {
    verdict = (token) => (token === GOOD ? ok(T0 + 2 * MIN) : refused);
    const { proxy } = await fresh("../../proxy.js");
    expect(passes(await proxy(request("/developers/reference", { cookie: GOOD })))).toBe(true);
    vi.setSystemTime(T0 + 2 * MIN - 1);
    expect(passes(await proxy(request("/developers/reference", { cookie: GOOD })))).toBe(true);
    expect(checks()).toBe(1);
    // Past its expiry, even an API that (wrongly) still says yes isn't believed.
    vi.setSystemTime(T0 + 2 * MIN);
    await expectPrivate404(await proxy(request("/developers/reference", { cookie: GOOD })));
  });

  it("an API that can't be asked (down, a 5xx, busy): a 503, never the page, and nothing remembered", async () => {
    const { proxy } = await fresh("../../proxy.js");
    for (const answer of [new TypeError("fetch failed"), { status: 502, body: {} }, { status: 429, body: {} }]) {
      verdict = () => answer;
      const res = await proxy(request("/developers/quick-start", { cookie: GOOD }));
      expect(res.status).toBe(503);
      expect(passes(res)).toBe(false);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(res.headers.get("retry-after")).toBe("30");
    }
    expect(checks()).toBe(3);
    verdict = (token) => (token === GOOD ? ok(T0 + 7 * 24 * 60 * MIN) : refused);
    expect(passes(await proxy(request("/developers/quick-start", { cookie: GOOD })))).toBe(true);
  });

  it("a page's requests that arrive together wait for one answer from the API", async () => {
    const { proxy } = await fresh("../../proxy.js");
    const all = await Promise.all(PRIVATE_PATHS.map((path) => proxy(request(path, { cookie: GOOD }))));
    expect(all.every(passes)).toBe(true);
    expect(checks()).toBe(1);
  });

  it("remembers a bounded number of tokens (a thousand in the site)", async () => {
    const { createDocsGate } = await fresh("@/developers/gate");
    const gate = createDocsGate({ ask: async () => ({ state: "denied" }), maxRemembered: 3 });
    for (const c of "abcde") await gate.check(`moa_docs_${c.repeat(43)}`);
    expect(gate.size()).toBe(3);
  });
});

describe("/developers/access?t=", () => {
  const cookieOf = (res) => res.headers.get("set-cookie") || "";

  it("a good link: the cookie (httpOnly, Secure, SameSite=Lax, on /developers, no longer than the link) and a 303 to the quick start", async () => {
    const { GET } = await fresh("../developers/access/route.js");
    const res = await GET(request(`/developers/access?t=${GOOD}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/developers/quick-start");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const set = cookieOf(res);
    expect(set).toMatch(new RegExp(`^moa_docs=${GOOD};`));
    expect(set).toMatch(/; Path=\/developers(;|$)/);
    expect(set).toMatch(/; HttpOnly(;|$)/i);
    expect(set).toMatch(/; Secure(;|$)/i);
    expect(set).toMatch(/; SameSite=Lax(;|$)/i);
    expect(Number(set.match(/Max-Age=(\d+)/)[1])).toBe(7 * 24 * 60 * 60);
    expect(checks()).toBe(1);
  });

  it("at most 30 days, whatever the link says", async () => {
    verdict = () => ok(T0 + 90 * 24 * 60 * MIN);
    const { GET } = await fresh("../developers/access/route.js");
    const set = cookieOf(await GET(request(`/developers/access?t=${GOOD}`)));
    expect(Number(set.match(/Max-Age=(\d+)/)[1])).toBe(30 * 24 * 60 * 60);
  });

  it("asks the API now, even when a good answer is remembered: a revoked link opened again is refused at once", async () => {
    const { GET } = await fresh("../developers/access/route.js");
    expect((await GET(request(`/developers/access?t=${GOOD}`))).status).toBe(303);
    verdict = () => refused;
    vi.setSystemTime(T0 + 1000);
    const res = await GET(request(`/developers/access?t=${GOOD}`));
    await expectPrivate404(res);
    expect(checks()).toBe(2);
  });

  it("a link the API refuses, an expired one, no token, or one that isn't a token: the docs' 404 and no cookie", async () => {
    const { GET } = await fresh("../developers/access/route.js");
    for (const path of [`/developers/access?t=${OTHER}`, "/developers/access", "/developers/access?t=", "/developers/access?t=hello", `/developers/access?t=moa_docs_${"x".repeat(300)}`]) {
      const res = await GET(request(path));
      expect(cookieOf(res)).toBe("");
      await expectPrivate404(res);
    }
    // Only the one that looks like a token was asked about.
    expect(checks()).toBe(1);
    verdict = () => ok(T0 - 1000);
    const res = await GET(request(`/developers/access?t=${GOOD}`));
    expect(cookieOf(res)).toBe("");
    await expectPrivate404(res);
  });

  it("an API that can't be asked: a 503 to try again, and no cookie", async () => {
    verdict = () => new TypeError("fetch failed");
    const { GET } = await fresh("../developers/access/route.js");
    const res = await GET(request(`/developers/access?t=${GOOD}`));
    expect(res.status).toBe(503);
    expect(cookieOf(res)).toBe("");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("/developers/sign-out", () => {
  it("clears the docs cookie and goes back to /developers", async () => {
    const { GET } = await fresh("../developers/sign-out/route.js");
    const res = await GET(request("/developers/sign-out", { cookie: GOOD }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/developers");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const set = res.headers.get("set-cookie");
    expect(set).toMatch(/^moa_docs=;/);
    expect(set).toMatch(/; Path=\/developers(;|$)/);
    expect(set).toMatch(/Max-Age=0/);
    expect(checks()).toBe(0);
  });

  it("a prefetch (the browser's or Next's) signs no one out", async () => {
    const { GET } = await fresh("../developers/sign-out/route.js");
    for (const headers of [{ "sec-purpose": "prefetch;prerender" }, { purpose: "prefetch" }, { "next-router-prefetch": "1" }]) {
      const res = await GET(request("/developers/sign-out", { cookie: GOOD, headers }));
      expect(res.status).toBe(204);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});

describe("robots.txt and the sitemap", () => {
  it("robots.txt keeps every page under /developers/ out, and leaves /developers open", async () => {
    const { DISALLOW, ALLOW, robots } = await fresh("@/seo/robots");
    expect(DISALLOW).toContain("/developers/");
    expect(DISALLOW).not.toContain("/developers");
    expect(ALLOW).toContain("/");
    expect(robots().rules[0].disallow).toContain("/developers/");
  });

  it("the sitemap lists /developers and none of the private pages", async () => {
    const { STATIC_PAGES } = await fresh("@/seo/sitemap");
    const docs = STATIC_PAGES.map(([path]) => path).filter((p) => p.startsWith("/developers"));
    expect(docs).toEqual(["/developers"]);
  });
});
