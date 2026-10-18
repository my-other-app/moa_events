/**
 * One refresh at a time across every tab of the site.
 *
 * The API rotates the refresh token on every refresh: the one sent is spent,
 * still answered for 30 seconds (the same new pair, for a lost reply or two
 * tabs at once), and after that taken as stolen: 401 SESSION_REUSED, and the
 * session ends in every tab. A tab that slept in the background past those
 * 30 seconds and woke up refreshing with the token it last saw would sign
 * the person out everywhere. So a refresh runs inside this lock, and the
 * first thing it does there is read the session again (client.js): if
 * another tab has refreshed meanwhile, its tokens are taken and nothing is sent.
 *
 * The Web Locks API where there is one (every current browser); elsewhere a
 * lease in localStorage: a timestamped claim, read back after a moment so
 * two tabs claiming at once settle on one, waited on by the others until
 * it is released or runs out. Without either, the refresh just runs.
 */

export const REFRESH_LOCK = "moa.refresh";
export const LEASE_KEY = "moa.refresh.lease";

/** How long a lease holds the others back at most: a tab closed mid-refresh never releases it. */
export const LEASE_MS = 10 * 1000;
/** How often a waiting tab looks again. */
const POLL_MS = 50;
/** How long a claim is left before it is read back: another tab's write in the same moment wins or loses by then. */
const SETTLE_MS = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const webLocks = () => {
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    return locks && typeof locks.request === "function" ? locks : null;
  } catch {
    return null;
  }
};

const localStore = () => {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined" || typeof localStorage?.getItem !== "function") return null;
    return localStorage;
  } catch {
    return null;
  }
};

/** Runs `fn` while holding the site-wide refresh lock; resolves (or rejects) with what `fn` does. */
export async function withRefreshLock(fn) {
  const locks = webLocks();
  if (locks) {
    let ran = false;
    try {
      return await locks.request(REFRESH_LOCK, { mode: "exclusive" }, () => {
        ran = true;
        return fn();
      });
    } catch (error) {
      // The refresh's own failure goes to the caller. The lock's (a sandboxed
      // frame, a browser that has the API but refuses it) falls back to the lease.
      if (ran) throw error;
    }
  }
  return withLease(fn);
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function readLease(store) {
  try {
    const o = JSON.parse(store.getItem(LEASE_KEY) || "null");
    return o && typeof o.id === "string" && Number.isFinite(o.until) ? o : null;
  } catch {
    return null;
  }
}

/** The fallback: a lease in localStorage. Storage that can't be written runs `fn` unguarded, as before. */
export async function withLease(fn) {
  const store = localStore();
  if (!store) return fn();
  const id = newId();
  try {
    for (;;) {
      const held = readLease(store);
      if (!held || held.until <= Date.now()) {
        store.setItem(LEASE_KEY, JSON.stringify({ id, until: Date.now() + LEASE_MS }));
        await sleep(SETTLE_MS);
        if (readLease(store)?.id === id) break;
      } else {
        await sleep(POLL_MS);
      }
    }
  } catch {
    // Private mode, a full quota: no lease to be had.
    return fn();
  }
  try {
    return await fn();
  } finally {
    try {
      if (readLease(store)?.id === id) store.removeItem(LEASE_KEY);
    } catch {
      /* it runs out by itself */
    }
  }
}
