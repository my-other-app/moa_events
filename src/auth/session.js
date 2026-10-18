import { googleEnabled } from "./google";
import { jwtClaims } from "./jwt";

/**
 * Who is signed in on this browser, kept apart from the guest token.
 *
 * Two kinds of token live here, and they never share a key:
 *
 *   the account   `moa.session`: the app account's access and refresh tokens
 *                 (from Sign in with Google, or an email and password: the
 *                 same session either way), the profile, and what the
 *                 sign-in said about the person (name, email, photo) for
 *                 when the profile can't be fetched.
 *   a guest       `access_token` / `refresh_token`: what a registration from
 *                 the public form hands back, so the person can open the
 *                 ticket it made. Only ever used while nobody is signed in.
 *
 * Signing in drops the guest token once the account's address is verified
 * (Google's always is; a password account's once the mailed code comes
 * back): the server folds that guest's tickets into the account, and from
 * then on the account's token goes with every request. Signing out drops
 * the account; the next registration makes a fresh guest, as it always has.
 *
 * Every tab of the site shares the one session in localStorage. The API
 * rotates the refresh token on every refresh (the one sent is spent: shown
 * again after 30 seconds, it ends the session everywhere), so a tab never
 * trusts its in-memory copy when it matters: another tab's write arrives as a
 * `storage` event (new tokens are taken, a sign-out signs this tab out too),
 * and the API client re-reads storage (`syncSession`) before it refreshes and
 * when a request is refused.
 *
 * Nothing here calls the API, so the API client can read it without a cycle.
 */

const KEY = "moa.session";
const GUEST_KEYS = ["access_token", "refresh_token"];
// Why the last session ended, when the person should be told: every tab shows it until it is dismissed or someone signs in.
const NOTICE_KEY = "moa.signedout";

const storage = () => {
  try {
    // Only in a browser: on the server there is none (newer Node has a localStorage global that isn't one).
    if (typeof window === "undefined" || typeof localStorage === "undefined" || typeof localStorage?.getItem !== "function") return null;
    return localStorage;
  } catch {
    return null;
  }
};

const str = (v) => (typeof v === "string" && v ? v : null);

function parse(raw) {
  try {
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== "object" || !str(o.access_token) || !str(o.refresh_token)) return null;
    return {
      access_token: o.access_token,
      refresh_token: o.refresh_token,
      profile: o.profile && typeof o.profile === "object" ? o.profile : null,
      claims: o.claims && typeof o.claims === "object" ? o.claims : null,
    };
  } catch {
    return null;
  }
}

function load() {
  try {
    return parse(storage()?.getItem(KEY) ?? null);
  } catch {
    return null;
  }
}

let current = load();
// Whether storage holds what `current` is. False after a write that failed
// (private mode, a full quota): then this page's copy is the only one, and
// storage is never read back over it.
let persisted = true;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

function write(next) {
  current = next;
  try {
    const store = storage();
    if (next) store?.setItem(KEY, JSON.stringify(next));
    else store?.removeItem(KEY);
    persisted = Boolean(store);
  } catch {
    /* private mode: the session lasts for this page */
    persisted = false;
  }
  emit();
}

const same = (a, b) => a === b || (Boolean(a) && Boolean(b) && JSON.stringify(a) === JSON.stringify(b));

/** The signed-in session, or null. Null whenever sign-in isn't switched on for this build. */
export function getSession() {
  return googleEnabled() ? current : null;
}

export const isSignedIn = () => Boolean(getSession());

/** The account's access token, or null when nobody is signed in. */
export const userToken = () => getSession()?.access_token ?? null;

export function setSession({ access_token, refresh_token, profile = null, claims = null }) {
  dropNotice();
  write({ access_token, refresh_token, profile, claims });
}

/** Changes part of the session (new tokens after a refresh, the profile); a no-op once signed out. */
export function updateSession(patch) {
  if (!current) return;
  write({ ...current, ...patch });
}

/**
 * Signs this browser out. `reason`, when the person should be told why
 * ("reused": the API ended the session because its refresh token was used
 * twice; "club": a club's account, which this site doesn't sign in), leaves
 * a notice every tab shows (`getNotice`).
 */
export function clearSession(reason = null) {
  if (reason) leaveNotice(reason);
  let stored = null;
  try {
    stored = storage()?.getItem(KEY) ?? null;
  } catch {
    /* nothing readable */
  }
  if (current === null && !stored) return;
  write(null);
}

/**
 * The session as storage has it now, taken into this tab when another tab
 * changed it (a refresh's new tokens, a sign-out) and its `storage` event
 * hasn't arrived yet, or never will (a tab frozen in the background, a page
 * back from the back-forward cache). Storage that can't be read, or that a
 * write here couldn't reach, leaves this tab's copy as it is.
 */
export function syncSession() {
  const store = storage();
  if (store && persisted) {
    let raw;
    try {
      raw = store.getItem(KEY);
    } catch {
      return getSession();
    }
    const next = parse(raw);
    if (!same(next, current)) {
      current = next;
      emit();
    }
  }
  return getSession();
}

/** Calls `fn` whenever the session (or the notice) changes, here or in another tab. Returns the unsubscribe. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------- which session a token belongs to ---------- */

/** The API's id for the session behind these tokens (the `sid` claim), or null for tokens from before sessions had one. */
export function sessionId(session) {
  if (!session) return null;
  const sid = jwtClaims(session.access_token)?.sid ?? jwtClaims(session.refresh_token)?.sid;
  return typeof sid === "string" || typeof sid === "number" ? String(sid) : null;
}

/** True when both are the same sign-in, however many times its tokens have rotated since. */
export function sameSession(a, b) {
  if (!a || !b) return false;
  const sa = sessionId(a);
  const sb = sessionId(b);
  if (sa && sb) return sa === sb;
  return a.refresh_token === b.refresh_token;
}

/**
 * What stays the same for one sign-in while its tokens rotate: the session's
 * id, else the account's, else (tokens that say neither) the refresh token.
 */
export function sessionKey(session) {
  if (!session) return null;
  const sid = sessionId(session);
  if (sid) return `sid:${sid}`;
  const claims = jwtClaims(session.access_token);
  const user = claims?.user_id ?? claims?.sub ?? session.profile?.id;
  if (user !== undefined && user !== null && user !== "") return `user:${user}`;
  return `token:${session.refresh_token}`;
}

/* ---------- why the last session ended ---------- */

/** How long a notice is shown for, at most, when nobody dismisses it. */
export const NOTICE_TTL_MS = 10 * 60 * 1000;
const NOTICE_REASONS = new Set(["reused", "club"]);

function parseNotice(raw, now = Date.now()) {
  try {
    const o = raw ? JSON.parse(raw) : null;
    if (!o || !NOTICE_REASONS.has(o.reason) || !Number.isFinite(o.at) || now - o.at > NOTICE_TTL_MS) return null;
    return { reason: o.reason, at: o.at };
  } catch {
    return null;
  }
}

function loadNotice() {
  try {
    return parseNotice(storage()?.getItem(NOTICE_KEY) ?? null);
  } catch {
    return null;
  }
}

let notice = loadNotice();

function leaveNotice(reason) {
  // One notice for one ending: the same reason already showing isn't shown again.
  if (notice?.reason === reason) return;
  notice = { reason, at: Date.now() };
  try {
    storage()?.setItem(NOTICE_KEY, JSON.stringify(notice));
  } catch {
    /* this tab still shows it */
  }
  emit();
}

function dropNotice() {
  let stored = null;
  try {
    stored = storage()?.getItem(NOTICE_KEY) ?? null;
    if (stored) storage()?.removeItem(NOTICE_KEY);
  } catch {
    /* nothing to drop */
  }
  if (notice) {
    notice = null;
    emit();
  }
}

/** Why this browser was signed out, while it should still be said: {reason: "reused" | "club", at}, or null. */
export const getNotice = () => notice;

/** The person has read it: gone from every tab. */
export const dismissNotice = dropNotice;

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    // Another tab signed in, refreshed or signed out (null: it cleared all of storage).
    if (e.key === KEY || e.key === null) {
      current = load();
      persisted = true;
    }
    if (e.key === NOTICE_KEY || e.key === null) notice = loadNotice();
    if (e.key === KEY || e.key === NOTICE_KEY || e.key === null) emit();
  });
  // Back from the back-forward cache: storage events sent meanwhile never came.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) syncSession();
  });
}

/* ---------- the guest token a registration leaves ---------- */

export const guestToken = () => {
  try {
    return storage()?.getItem("access_token") ?? null;
  } catch {
    return null;
  }
};

export function storeGuestTokens({ access_token, refresh_token }) {
  try {
    if (access_token) storage()?.setItem("access_token", access_token);
    if (refresh_token) storage()?.setItem("refresh_token", refresh_token);
  } catch (e) {
    console.error("Error storing tokens:", e);
  }
}

/** Drops the guest token a registration left behind; every page here works without one. */
export function forgetGuestTokens() {
  try {
    GUEST_KEYS.forEach((k) => storage()?.removeItem(k));
  } catch {
    /* private mode */
  }
}

/* ---------- reading a token ---------- */

/** True when the token is past its expiry, or will be within `slackMs`. Unknown expiry counts as fresh. */
export function isExpiring(token, slackMs = 30 * 1000, now = Date.now()) {
  const exp = Number(jwtClaims(token)?.exp);
  return Number.isFinite(exp) && exp * 1000 <= now + slackMs;
}

/** For tests: re-read storage as a fresh page load would. */
export function reloadSessionForTests() {
  current = load();
  persisted = true;
  notice = loadNotice();
  emit();
}
