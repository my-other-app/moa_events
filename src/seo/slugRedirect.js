/**
 * An event's or a club's old slug, with its query
 * (feature-register/mail-and-slugs-contract.md, Part S2).
 *
 * An admin can change a club's or an event's slug, and the old one keeps
 * working: the API answers it with the event or the club, whose `slug` is
 * the current one. The page at the old address (/events/{old},
 * /clubs/{old}) then answers a 308 to the current one -- but a page kept by
 * ISR never sees the query, so its redirect drops ?ref=, ?sref= and utm_*
 * (a printed QR code's or a shared link's tracking).
 *
 * src/proxy.js runs before the kept page. For /events/{slug} or
 * /clubs/{slug} with a query it asks the API which slug is current (the
 * same discover read the page makes; the answer kept in this process for a
 * minute per slug), and when that differs answers the same 308 itself,
 * query kept. Without a query nothing is asked: the page's own 308 is the
 * same answer. The API down, slow or answering oddly: the request goes on
 * to the page, as before.
 *
 * No "server-only" and no next/headers here: src/proxy.js imports it.
 */
import { DEFAULT_API_BASE_URL } from "@/config";

/** How long an answer (current, or no such public thing) is believed. */
export const SLUG_TTL_MS = 60_000;
const MAX_REMEMBERED = 2000;
const ASK_TIMEOUT_MS = 3000;
/** How long a browser keeps the redirect: an admin may change a slug back. */
export const REDIRECT_CACHE = "public, max-age=300";

/** What can be a slug (as src/server/discover.js's isRef); anything else is never looked up. */
const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PAGE = /^\/(events|clubs)\/([^/]+)\/?$/;
/** /events/in and /clubs/in are the cities' index pages, not a slug. */
const NOT_SLUGS = new Set(["in"]);

/**
 * {kind: "event" | "club", slug} for an /events/{slug} or /clubs/{slug}
 * page address; null for anything else. An event's id (/events/123) is not
 * one: next.config hands it to the old-address page, which keeps the query.
 */
export function slugAddress(pathname) {
  const m = PAGE.exec(String(pathname || ""));
  if (!m) return null;
  let slug;
  try {
    slug = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  if (!REF.test(slug) || NOT_SLUGS.has(slug.toLowerCase())) return null;
  if (m[1] === "events" && /^\d+$/.test(slug)) return null;
  return { kind: m[1] === "events" ? "event" : "club", slug };
}

/** The page of a slug. */
export const slugPagePath = (kind, slug) => `/${kind === "event" ? "events" : "clubs"}/${encodeURIComponent(slug)}`;

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim().replace(/\/+$/, "") : null);

/** The API's origin and the site's server credential, read when asked (as src/server/api.js reads them). */
export function slugApiEnv(env = process.env) {
  return { base: clean(env.API_BASE_URL) || clean(env.NEXT_PUBLIC_API_BASE_URL) || DEFAULT_API_BASE_URL, siteToken: clean(env.API_SITE_TOKEN) };
}

/**
 * Ask the API which slug a public event or club goes by now:
 *   {state: "ok", slug}   the current slug (the same as asked, or the new one)
 *   {state: "none"}       no public event or club answers to it (a 404)
 *   {state: "error"}      no answer, a 5xx, a 429, or nothing that reads as one
 */
export async function askCurrentSlug(kind, slug, { base, siteToken = null, fetchImpl = globalThis.fetch, timeoutMs = ASK_TIMEOUT_MS } = {}) {
  const url = new URL(`/api/v1/discover/${kind === "event" ? "events" : "clubs"}/${encodeURIComponent(slug)}`, `${base || DEFAULT_API_BASE_URL}/`);
  const headers = { Accept: "application/json" };
  if (siteToken) headers["X-Site-Token"] = siteToken;
  let res;
  try {
    res = await fetchImpl(url.toString(), { headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return { state: "error" };
  }
  if (res.status === 404) return { state: "none" };
  if (res.status !== 200) return { state: "error" };
  let body;
  try {
    body = await res.json();
  } catch {
    return { state: "error" };
  }
  const current = (kind === "event" ? body?.event : body?.club)?.slug;
  return typeof current === "string" && REF.test(current) ? { state: "ok", slug: current } : { state: "error" };
}

/**
 * The memory of answers, per kind and slug. `ask(kind, slug)` is
 * askCurrentSlug's shape. current(kind, slug, now) → the current slug, or
 * null when nothing is known (no such public thing, or the API failing;
 * a failure is not remembered). Requests for the same slug while the API
 * is being asked wait for that one answer.
 */
export function createSlugMemo({ ask, ttlMs = SLUG_TTL_MS, maxRemembered = MAX_REMEMBERED } = {}) {
  const memo = new Map();
  const asking = new Map();
  const remember = (key, value, until) => {
    memo.delete(key);
    memo.set(key, { value, until });
    while (memo.size > maxRemembered) memo.delete(memo.keys().next().value);
    return value;
  };
  async function askNow(key, kind, slug, now) {
    const answer = await ask(kind, slug);
    if (answer.state === "error") return null;
    return remember(key, answer.state === "ok" ? answer.slug : null, now + ttlMs);
  }
  return {
    async current(kind, slug, now = Date.now()) {
      const key = `${kind}:${slug}`;
      const kept = memo.get(key);
      if (kept && kept.until > now) return kept.value;
      if (asking.has(key)) return asking.get(key);
      const pending = askNow(key, kind, slug, now).finally(() => asking.delete(key));
      asking.set(key, pending);
      return pending;
    },
    forget() {
      memo.clear();
    },
  };
}

/** This process's memory, asking the API as configured now. */
export const slugMemo = createSlugMemo({ ask: (kind, slug) => askCurrentSlug(kind, slug, slugApiEnv()) });

/**
 * Where an old-slug address with a query goes now: "/events/{current}?…"
 * (the query as it came), or null to let the request go on to the page.
 * `request` is a NextRequest. Only a page load (GET or HEAD, not one of
 * the router's own RSC fetches) with a query is asked about.
 */
export async function movedSlugPath(request, memo = slugMemo) {
  const { nextUrl, method, headers } = request;
  if (method !== "GET" && method !== "HEAD") return null;
  if (!nextUrl.search || nextUrl.search === "?") return null;
  if (headers.get("rsc") || headers.get("next-router-prefetch") || nextUrl.searchParams.has("_rsc")) return null;
  const found = slugAddress(nextUrl.pathname);
  if (!found) return null;
  const current = await memo.current(found.kind, found.slug);
  if (!current || current === found.slug) return null;
  return `${slugPagePath(found.kind, current)}${nextUrl.search}`;
}
