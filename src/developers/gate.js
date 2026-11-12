/**
 * Who may read the private developer docs (feature-register/private-dev-docs-contract.md).
 *
 * Only /developers itself is public. Every other page under /developers,
 * and the two downloads (openapi.json, postman_collection.json), are for
 * people holding a docs link that the API made: the owner or an admin of
 * a club with API access, a MyOtherApp admin, or a partner app's
 * developers. Without one they answer 404, so nothing confirms what exists.
 *
 *   1. /developers/access?t=<token> asks the API whether the link is good
 *      (GET /api/v1/developers/access, the token in MOA-Docs-Token: never
 *      in an address the API's logs keep), then keeps the token in an
 *      httpOnly cookie on /developers that lasts no longer than the link
 *      (30 days at most), and sends the visitor to the quick start.
 *   2. Every private request (src/proxy.js first, then the page or file
 *      itself, so neither is the only check) reads the cookie and asks the
 *      API again at most every 5 minutes per token: the answer is kept in
 *      this process's memory, so an access taken away ends within 5
 *      minutes. A link's own expiry is kept to the second.
 *
 * No "server-only" and no next/headers here: src/proxy.js imports this
 * module, and so do the pages (through src/server/devdocs.js).
 */
import { DEFAULT_API_BASE_URL } from "@/config";

export const DOCS_COOKIE = "moa_docs";
export const DOCS_COOKIE_PATH = "/developers";
/** Where a good link lands, so the token leaves the address bar. */
export const DOCS_HOME = "/developers/quick-start";
export const DOCS_PUBLIC = "/developers";
export const ACCESS_PATH = "/developers/access";
export const SIGN_OUT_PATH = "/developers/sign-out";
/** The API's check for a docs link (not in the OpenAPI document), and the header the token goes in. */
export const ACCESS_CHECK_PATH = "/api/v1/developers/access";
export const DOCS_TOKEN_HEADER = "MOA-Docs-Token";

/** How long an answer is believed: a good one 5 minutes, a refused one a minute. */
export const ALLOW_TTL_MS = 5 * 60_000;
export const DENY_TTL_MS = 60_000;
/** The cookie lasts no longer than the link, and 30 days at most. */
export const MAX_COOKIE_AGE_S = 30 * 24 * 60 * 60;
const MAX_REMEMBERED = 1000;
const CHECK_TIMEOUT_MS = 4000;

/** The API's tokens: moa_docs_ and 32 random url-safe bytes (120 characters at most). Anything else is never sent to the API. */
const TOKEN = /^moa_docs_[A-Za-z0-9_-]{16,111}$/;
export const isDocsToken = (t) => typeof t === "string" && TOKEN.test(t);

/** The addresses under /developers/ that are open to anyone: the link itself, and signing out. */
const OPEN = new Set([ACCESS_PATH, SIGN_OUT_PATH]);

/** True for every address under /developers/ but the link and signing out. /developers itself is public. */
export function isGatedDocsPath(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "");
  return p.startsWith(`${DOCS_PUBLIC}/`) && !OPEN.has(p);
}

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim().replace(/\/+$/, "") : null);

/** The API's origin and the site's server credential, read when asked (as src/server/api.js reads them). */
export function apiEnv(env = process.env) {
  return { base: clean(env.API_BASE_URL) || clean(env.NEXT_PUBLIC_API_BASE_URL) || DEFAULT_API_BASE_URL, siteToken: clean(env.API_SITE_TOKEN) };
}

const IP = /^[0-9A-Fa-f.:]{2,45}$/;

/** The visitor's address, as src/server/visitor.js reads it: X-Forwarded-For's first hop, else X-Real-IP. */
export function forwardedIp(headers) {
  const get = (name) => (typeof headers?.get === "function" ? headers.get(name) : null) || "";
  const first = get("x-forwarded-for").split(",")[0].trim();
  if (IP.test(first)) return first;
  const real = get("x-real-ip").trim();
  return IP.test(real) ? real : null;
}

/**
 * Ask the API about a token, once:
 *   {state: "ok", access: {kind, expires_at, club?, partner_app?}}
 *   {state: "denied"}   unknown, expired, revoked or no longer allowed (a 404)
 *   {state: "error"}    no answer, a 5xx, a 429: nothing is known
 * The token goes in MOA-Docs-Token. Sent with the site's server credential
 * (X-Site-Token) when it is set, and then the visitor's address
 * (X-Visitor-IP): the API counts its 30 checks a minute per visitor, not
 * for the whole site.
 */
export async function askApi(token, { base, siteToken = null, visitorIp = null, fetchImpl = globalThis.fetch, timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  const url = new URL(ACCESS_CHECK_PATH, `${base || DEFAULT_API_BASE_URL}/`);
  const headers = { Accept: "application/json", [DOCS_TOKEN_HEADER]: token };
  if (siteToken) {
    headers["X-Site-Token"] = siteToken;
    if (visitorIp) headers["X-Visitor-IP"] = visitorIp;
  }
  let res;
  try {
    res = await fetchImpl(url.toString(), { headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { state: "error" };
  }
  if (res.status === 429 || res.status >= 500) return { state: "error" };
  if (res.status !== 200) return { state: "denied" };
  let body;
  try {
    body = await res.json();
  } catch {
    return { state: "error" };
  }
  if (!body || body.ok !== true) return { state: "denied" };
  const { kind = null, expires_at = null, club = null, partner_app = null } = body;
  return { state: "ok", access: { kind, expires_at, club, partner_app } };
}

const expiryOf = (access) => {
  const t = Date.parse(access?.expires_at ?? "");
  return Number.isFinite(t) ? t : null;
};

/**
 * The memory of answers, per token. `ask(token, ctx)` is askApi's shape.
 *   check(token, {now, visitorIp, fresh}) → askApi's answer; a token that
 *   doesn't look like one is denied without asking. `fresh` asks again
 *   whatever is remembered (the access link does). Requests for the same
 *   token while the API is being asked wait for that one answer (a page's
 *   prefetches arrive together).
 */
export function createDocsGate({ ask, allowTtlMs = ALLOW_TTL_MS, denyTtlMs = DENY_TTL_MS, maxRemembered = MAX_REMEMBERED } = {}) {
  const memo = new Map();
  const asking = new Map();
  const remember = (token, answer, until) => {
    memo.delete(token);
    memo.set(token, { answer, until });
    while (memo.size > maxRemembered) memo.delete(memo.keys().next().value);
    return answer;
  };
  async function askNow(token, now, visitorIp) {
    const answer = await ask(token, { visitorIp });
    if (answer.state === "error") return answer;
    if (answer.state !== "ok") return remember(token, { state: "denied" }, now + denyTtlMs);
    const expires = expiryOf(answer.access);
    if (expires !== null && expires <= now) return remember(token, { state: "denied" }, now + denyTtlMs);
    return remember(token, answer, Math.min(now + allowTtlMs, expires ?? Infinity));
  }
  async function check(token, { now = Date.now(), visitorIp = null, fresh = false } = {}) {
    if (!isDocsToken(token)) return { state: "denied" };
    const hit = memo.get(token);
    if (hit && !fresh && now < hit.until) {
      const expires = expiryOf(hit.answer.access);
      if (hit.answer.state !== "ok" || expires === null || now < expires) return hit.answer;
    }
    if (fresh) return askNow(token, now, visitorIp);
    if (!asking.has(token)) asking.set(token, askNow(token, now, visitorIp).finally(() => asking.delete(token)));
    return asking.get(token);
  }
  return { check, clear: () => memo.clear(), size: () => memo.size };
}

/** The site's one memory of answers in this process (the proxy and the pages each have their own). */
export const docsGate = createDocsGate({ ask: (token, ctx) => askApi(token, { ...apiEnv(), ...ctx }) });

/** Seconds the cookie may last for a link that ends at `expiresAt`: 30 days at most, 0 for one already over. */
export function cookieMaxAge(expiresAt, now = Date.now()) {
  const t = Date.parse(expiresAt ?? "");
  if (!Number.isFinite(t)) return MAX_COOKIE_AGE_S;
  return Math.max(0, Math.min(MAX_COOKIE_AGE_S, Math.floor((t - now) / 1000)));
}

/**
 * The cookie's attributes (Next's ResponseCookies.set): httpOnly, SameSite=Lax,
 * on /developers only, and Secure everywhere but `next dev` (where Safari
 * would drop a Secure cookie on http://localhost).
 */
export const docsCookie = (value, maxAge) => ({ name: DOCS_COOKIE, value, httpOnly: true, secure: process.env.NODE_ENV !== "development", sameSite: "lax", path: DOCS_COOKIE_PATH, maxAge });

/** What every private docs answer carries: never kept by a browser or a shared cache (Cloudflare, Vercel), never indexed. */
export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

/** The words a visitor without access gets, on every private address alike. */
export const PRIVATE_TITLE = "These docs are private";
export const PRIVATE_MESSAGE = "If your club has API access, open them from your dashboard: Settings → Integrations.";
export const PRIVATE_LINK_LABEL = "About the MyOtherApp API";

const PRIVATE_HTML = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Not found · MyOtherApp</title>
<style>
:root{color-scheme:light dark;--bg:#faf8f4;--fg:#1d1b18;--muted:#5d5850;--link:#1f5fbf}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--fg:#f1eee8;--muted:#b5afa5;--link:#8ab4ff}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:34rem;padding:2rem 1rem}
h1{font-size:1.5rem;line-height:1.25;margin:0 0 .5rem}
p{margin:0 0 1rem;color:var(--muted)}
a{color:var(--link)}
</style>
</head>
<body>
<main>
<h1>${PRIVATE_TITLE}.</h1>
<p>${PRIVATE_MESSAGE}</p>
<p><a href="${DOCS_PUBLIC}">${PRIVATE_LINK_LABEL}</a></p>
</main>
</body>
</html>
`;

/** The 404 every private address gives without access. */
export const privateDocsResponse = () => new Response(PRIVATE_HTML, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", ...PRIVATE_HEADERS } });

/** A 503 for a docs cookie the API couldn't be asked about (down, slow, busy): nothing is said about the page. */
export const unavailableDocsResponse = () =>
  new Response("The developer docs can't be opened right now. Try again in a minute.\n", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "30", ...PRIVATE_HEADERS },
  });

/** A browser's or Next's prefetch, which must never sign anyone out. */
export function isPrefetch(headers) {
  const get = (name) => (typeof headers?.get === "function" ? headers.get(name) : null) || "";
  return /prefetch/i.test(get("sec-purpose")) || /prefetch/i.test(get("purpose")) || /prefetch/i.test(get("x-moz")) || get("next-router-prefetch") !== "";
}
