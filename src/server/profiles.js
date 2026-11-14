import "server-only";
import { cache } from "react";
import { isProfileCode, isProfileHandle, parsePublicProfile, readCodeAnswer } from "@/utils/profiles";
import { ApiError, apiGet, apiHeaders, apiUrl } from "./api";

/**
 * People's profiles, read on the server (feature-register/profiles-networking-contract.md).
 *
 *   getProfile(handle)          the profile as NOBODY sees it (no token is ever
 *                               sent: the page's HTML is the same for everyone and
 *                               safe to keep), through Next's data cache for a
 *                               minute, tagged `profile:{handle}`; null on a 404
 *                               (unknown, deleted, hidden or blocked)
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
 * Anything else the API says (5xx, no answer) throws ApiError, so an ISR page
 * keeps its last good copy. What a signed-in reader may see beyond this is
 * the browser's to ask, with their own token (src/api/profiles.js).
 */
export const PROFILE_TAG = (handle) => `profile:${handle}`;

async function profile(handle, fresh) {
  const h = String(handle || "").toLowerCase();
  if (!isProfileHandle(h)) return null;
  const { data } = await apiGet(`/api/v1/profiles/${encodeURIComponent(h)}`, { fresh, revalidate: 60, tags: [PROFILE_TAG(h)] });
  return data ? parsePublicProfile(data) : null;
}

export const getProfile = cache((handle) => profile(handle, false));

/** The same past every cache (a picture link about to expire). */
export const getProfileFresh = (handle) => profile(handle, true);

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
