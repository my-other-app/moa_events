import "server-only";
import { cache } from "react";
import { isProfileCode, isProfileHandle, parsePublicProfile, readCodeAnswer } from "@/utils/profiles";
import { ApiError, apiGet, apiHeaders, apiUrl } from "./api";

/**
 * People's profiles, read on the server (feature-register/profiles-networking-contract.md).
 *
 *   getProfile(handle, ip)      the profile as NOBODY sees it (no token is ever
 *                               sent: the page's HTML is the same for everyone),
 *                               through Next's data cache for a minute, tagged
 *                               `profile:{handle}`; null on a 404 (unknown,
 *                               deleted, hidden or blocked)
 *
 * Every read names the visitor it is made for (`ip`, sent as X-Visitor-IP
 * behind the site's token: src/server/api.js), so the API's per-address
 * limits (120 profile reads, 30 code reads a minute) are that visitor's and
 * not the whole site's: someone walking handles uses up only their own. The
 * address is the first X-Forwarded-For hop, which Caddy writes itself
 * (`header_up X-Forwarded-For {client_ip}`, the client_ip being Cloudflare's
 * CF-Connecting-IP, trusted from Cloudflare's ranges only): never a value a
 * client sent. Next's data cache keys a read by its headers, so each
 * visitor's read is kept for them.
 *   resolveProfileCode(code, {visitor})
 *                               what a QR's code stands for, asked fresh every
 *                               time (a replaced code stops at once), for the
 *                               visitor who scanned it: readCodeAnswer's
 *                               {state, handle?}
 *
 * Pictures (`picture`, each project's `image`) are signed links that expire
 * within the hour: pages never hold them (src/seo/stabilize.js), and
 * /media/profiles/... reads them past the cache when one is about to.
 *
 * Anything else the API says (5xx, no answer) throws ApiError: the site's
 * error page, never a 404 for a profile that is there. What a signed-in reader may see beyond this is
 * the browser's to ask, with their own token (src/api/profiles.js).
 */
export const PROFILE_TAG = (handle) => `profile:${handle}`;

async function profile(handle, fresh, ip) {
  const h = String(handle || "").toLowerCase();
  if (!isProfileHandle(h)) return null;
  const visitor = ip ? { ip } : null;
  const { data } = await apiGet(`/api/v1/profiles/${encodeURIComponent(h)}`, { fresh, revalidate: 60, tags: [PROFILE_TAG(h)], visitor });
  return data ? parsePublicProfile(data) : null;
}

/** `ip`: the visitor the read is for (a string, so the page's head and body share one read). */
export const getProfile = cache((handle, ip = null) => profile(handle, false, ip));

/** The same past every cache (a picture link about to expire). */
export const getProfileFresh = (handle, ip = null) => profile(handle, true, ip);

export async function resolveProfileCode(code, { visitor = null, timeoutMs = 8000, fetchImpl = globalThis.fetch } = {}) {
  const c = String(code || "").toLowerCase();
  if (!isProfileCode(c)) return { state: "missing" };
  const path = `/api/v1/profiles/by-code/${encodeURIComponent(c)}`;
  let res;
  try {
    // For the person who scanned (X-Visitor-IP behind the site's token): the API's 30 a minute
    // per address is theirs, not the whole site's.
    res = await fetchImpl(apiUrl(path), { headers: apiHeaders(visitor), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new ApiError(0, `The API did not answer ${path}: ${e?.name === "TimeoutError" ? "timed out" : e?.message || e}`);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const answer = readCodeAnswer(res.status, body);
  if (!answer) throw new ApiError(res.status, `The API answered ${res.status} for ${path}`);
  return answer;
}
