import "server-only";

/**
 * Renewing a visitor's session on the site's server (the browser's cookie
 * holds the tokens; page script never does).
 *
 * The API rotates the refresh token on every refresh: the one sent is
 * spent, still answered for 30 seconds (for a lost reply, or two calls at
 * once), and after that taken as stolen (401 SESSION_REUSED: the session
 * ends everywhere). Every tab of a browser shares the one cookie, so calls
 * arrive here together with the same refresh token. So:
 *
 *   - one refresh at a time per refresh token: calls that need it while it
 *     runs share its answer (`inflight`);
 *   - the answer is kept REMEMBER_MS (inside the API's own 30 s): a call
 *     that set out with the old cookie a moment before the new one reached
 *     the browser gets the same new pair without asking the API again.
 *
 * Resolves {ok: true, access, refresh}, or {ok: false, refused, code}:
 * `refused` when the API said the session is over (400/401/403/422, as the
 * browser's own refresh has always read it), with its error_code; not
 * refused when it couldn't be asked (offline, a 5xx, a timeout), in which
 * case the call goes on with the token it had.
 */

export const REMEMBER_MS = 25 * 1000;
export const REFRESH_TIMEOUT_MS = 20 * 1000;
const MAX_REMEMBERED = 5000;

const inflight = new Map();
const recent = new Map();

const refusedStatus = (s) => s === 400 || s === 401 || s === 403 || s === 422;

function remembered(refresh, now) {
  const hit = recent.get(refresh);
  if (!hit) return null;
  if (hit.until <= now) {
    recent.delete(refresh);
    return null;
  }
  return hit.result;
}

function remember(refresh, result, now) {
  if (recent.size >= MAX_REMEMBERED) {
    for (const [k, v] of recent) if (v.until <= now) recent.delete(k);
    while (recent.size >= MAX_REMEMBERED) recent.delete(recent.keys().next().value);
  }
  recent.set(refresh, { result, until: now + REMEMBER_MS });
}

async function ask(refresh, { apiBase, fetchImpl, headers }) {
  let res;
  try {
    res = await fetchImpl(`${apiBase}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ token: refresh }).toString(),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, refused: false, code: null };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (res.ok && typeof data?.access_token === "string" && data.access_token) {
    return { ok: true, access: data.access_token, refresh: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : refresh };
  }
  if (refusedStatus(res.status) || res.ok) {
    return { ok: false, refused: true, code: typeof data?.error_code === "string" ? data.error_code : null };
  }
  return { ok: false, refused: false, code: null };
}

/**
 * A fresh pair for this refresh token, shared and remembered (above).
 * `headers`: the visitor's own (address, user agent), so the API records
 * the refresh as theirs.
 */
export function refreshSession(refresh, { apiBase, fetchImpl = globalThis.fetch, headers = {}, now = Date.now } = {}) {
  const hit = remembered(refresh, now());
  if (hit) return Promise.resolve(hit);
  let running = inflight.get(refresh);
  if (!running) {
    running = ask(refresh, { apiBase, fetchImpl, headers }).then((result) => {
      // A refusal is remembered too: the calls behind it end the same way, without asking again.
      if (result.ok || result.refused) remember(refresh, result, now());
      return result;
    });
    running.finally(() => inflight.delete(refresh)).catch(() => {});
    inflight.set(refresh, running);
  }
  return running;
}

/** For tests: forget every refresh. */
export function resetRefreshesForTests() {
  inflight.clear();
  recent.clear();
}
