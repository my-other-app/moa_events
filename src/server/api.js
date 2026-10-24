import "server-only";
import { DEFAULT_API_BASE_URL } from "@/config";

/**
 * Reading the API from the server (pages, route handlers). Every read goes
 * through Next's data cache with a revalidate time, so a page that is
 * statically regenerated (ISR) stays static, and the API is asked at most
 * once a minute for the same thing, however many people (and crawlers)
 * come.
 *
 *   apiGet(path, {query, revalidate, tags, fresh, timeoutMs})
 *     → {status, data}   data is null when the API said 404
 *     throws ApiError     for anything else (5xx, a timeout, no answer)
 *
 * The API's origin is API_BASE_URL (server only), else
 * NEXT_PUBLIC_API_BASE_URL, else https://api.myotherapp.in.
 *
 * When API_SITE_TOKEN is set, every read says who it is from and for:
 *   X-Site-Token: <API_SITE_TOKEN>   the site's server, not a visitor: the
 *                                    API counts every site read in one
 *                                    bucket for the token (3000 a minute),
 *                                    whoever the read is for
 *   X-Visitor-IP: <visitor.ip>       the visitor a per-request read is made
 *                                    for (src/server/visitor.js), used only
 *                                    to place them (near you by their own
 *                                    address, not the server's)
 * Without the token neither goes (an API that doesn't know the site would
 * have no reason to believe the second). Neither ever leaves the browser:
 * this module is server-only.
 *
 * A read made for nobody in particular (an ISR page, a feed, a sitemap, a
 * media redirect) has no visitor. Next's data cache keys a read by its
 * headers too, so a visitor's address also keeps their answer to themselves.
 */

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim().replace(/\/+$/, "") : null);

export const serverApiBase = () =>
  clean(process.env.API_BASE_URL) || clean(process.env.NEXT_PUBLIC_API_BASE_URL) || DEFAULT_API_BASE_URL;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The URL for a path and a query object (empty values left out). */
export function apiUrl(path, query = null) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${serverApiBase()}/`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v === null || v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

const DEFAULT_REVALIDATE = 60;

const siteToken = () => clean(process.env.API_SITE_TOKEN);

/** True when a read for this visitor goes with their address (X-Visitor-IP): the token is set and the address known. */
export const forwardsVisitor = (visitor) => Boolean(siteToken() && visitor?.ip);

/** The headers a server read sends. */
export function apiHeaders(visitor = null) {
  const headers = { Accept: "application/json" };
  const token = siteToken();
  if (token) {
    headers["X-Site-Token"] = token;
    if (visitor?.ip) headers["X-Visitor-IP"] = String(visitor.ip);
  }
  return headers;
}

export async function apiGet(path, { query = null, revalidate = DEFAULT_REVALIDATE, tags = [], fresh = false, timeoutMs = 8000, visitor = null, fetchImpl = globalThis.fetch } = {}) {
  const url = apiUrl(path, query);
  const headers = apiHeaders(visitor);
  const init = { headers, signal: AbortSignal.timeout(timeoutMs) };
  if (fresh) init.cache = "no-store";
  else init.next = { revalidate, tags: tags.filter(Boolean).slice(0, 64) };
  let res;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    throw new ApiError(0, `The API did not answer ${path}: ${e?.name === "TimeoutError" ? "timed out" : e?.message || e}`);
  }
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) throw new ApiError(res.status, `The API answered ${res.status} for ${path}`);
  try {
    return { status: res.status, data: await res.json() };
  } catch {
    throw new ApiError(502, `The API sent something that isn't JSON for ${path}`);
  }
}
