import { SESSION_PATH, cookieSessionOn } from "./cookiemode";
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
 * Nothing here calls the API (in cookie mode, only the site's own
 * /api/session, with fetch), so the API client can read it without a cycle.
 *
 * When the build keeps tokens in HttpOnly cookies (NEXT_PUBLIC_SESSION_COOKIE=on,
 * auth/cookiemode.js), none of the above holds tokens: the site's server
 * keeps them, and `moa.session` holds only who is signed in ({cookie: true,
 * sid, user, profile, claims}), so every tab still shows it and hears a
 * sign-in or sign-out at once. A registration's guest token is only
 * noted (`moa.guest`: "1"), for the pages that ask whether there is one.
 * Tokens this browser kept here before are handed to the site's server
 * once (`adopt`, on the first page load), and cleared here when it has them.
 */

const KEY = "moa.session";
const GUEST_KEYS = ["access_token", "refresh_token"];
// Cookie mode: "1" while a registration's guest token is thought to be in its cookie.
const GUEST_MARK = "moa.guest";
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

const idOrNull = (v) => (typeof v === "string" && v ? v : typeof v === "number" && Number.isFinite(v) ? v : null);

/** Cookie mode's record of who is signed in (never a token). */
function parseMarker(o) {
  if (!o || typeof o !== "object" || o.cookie !== true) return null;
  return {
    cookie: true,
    sid: idOrNull(o.sid) === null ? null : String(o.sid),
    user: idOrNull(o.user),
    profile: o.profile && typeof o.profile === "object" ? o.profile : null,
    claims: o.claims && typeof o.claims === "object" ? o.claims : null,
  };
}

function parse(raw) {
  try {
    const o = raw ? JSON.parse(raw) : null;
    if (cookieSessionOn()) return parseMarker(o);
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

/**
 * Signed in: the account's tokens, the profile and what the sign-in said.
 * In cookie mode the tokens are already in the cookie (the gateway kept
 * them), and this takes who they are instead: {sid, user, profile, claims}.
 */
export function setSession({ access_token, refresh_token, sid = null, user = null, profile = null, claims = null }) {
  dropNotice();
  if (cookieSessionOn()) write(parseMarker({ cookie: true, sid, user, profile, claims }));
  else write({ access_token, refresh_token, profile, claims });
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
  if (session.cookie) return session.sid ?? null;
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
  if (session.cookie) return session.user !== null && session.user !== undefined ? `user:${session.user}` : "cookie";
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
      // Cookie mode: a tab still on the build from before wrote tokens here; they go to the cookie too.
      if (cookieSessionOn()) startAdoption();
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

/** The guest token itself, for the API client. Never in cookie mode: page script has none. */
export const guestToken = () => {
  if (cookieSessionOn()) return null;
  try {
    return storage()?.getItem("access_token") ?? null;
  } catch {
    return null;
  }
};

const readGuestMark = () => {
  try {
    return storage()?.getItem(GUEST_MARK) === "1";
  } catch {
    return false;
  }
};
// Cookie mode, when storage can't be written: this page's own note of it.
let guestMark = null;

/** Whether a registration on this browser left a guest token (in cookie mode: whether its cookie is thought to be there). */
export function hasGuest() {
  if (!cookieSessionOn()) return Boolean(guestToken());
  return guestMark ?? readGuestMark();
}

/**
 * Cookie mode: what the gateway said about the guest's cookie on an answer
 * (X-Moa-Guest): "kept" (a registration just left one), "gone" (the API
 * refused it, and it was cleared) or "none" (there is none).
 */
export function noteGuest(state) {
  if (!cookieSessionOn() || !state) return;
  const has = state === "kept";
  if (!has && state !== "gone" && state !== "none") return;
  guestMark = has;
  try {
    if (has) storage()?.setItem(GUEST_MARK, "1");
    else storage()?.removeItem(GUEST_MARK);
    guestMark = null;
  } catch {
    /* this page's note stands */
  }
}

/** Keeps a registration's guest token. In cookie mode the gateway kept it already, and the answer says only {kept}. */
export function storeGuestTokens({ access_token, refresh_token, kept } = {}) {
  if (cookieSessionOn()) {
    if (kept === "guest") noteGuest("kept");
    return;
  }
  try {
    if (access_token) storage()?.setItem("access_token", access_token);
    if (refresh_token) storage()?.setItem("refresh_token", refresh_token);
  } catch (e) {
    console.error("Error storing tokens:", e);
  }
}

/** Drops the guest token a registration left behind; every page here works without one. In cookie mode its cookie goes too. */
export function forgetGuestTokens() {
  try {
    GUEST_KEYS.forEach((k) => storage()?.removeItem(k));
  } catch {
    /* private mode */
  }
  if (!cookieSessionOn()) return;
  noteGuest("gone");
  sessionRoute("POST", { action: "forget-guest" }).catch(() => {
    /* the gateway forgets it once the API refuses it, as before */
  });
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
  guestMark = null;
  adopting = null;
  if (cookieSessionOn()) startAdoption();
  emit();
}

/* ---------- cookie mode: tokens kept here before, handed over once ---------- */

/** A call to the site's own session route (src/app/api/session): same origin, its cookies, JSON. */
function sessionRoute(method, body) {
  return fetch(SESSION_PATH, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Signs this browser out on the site's server: the session ends on the API, and its cookie goes. */
export const endCookieSession = () => sessionRoute("DELETE");

/** What this browser kept in localStorage before the cookies: {session, guest}, or null when there is nothing. */
function storedTokens() {
  const store = storage();
  if (!store) return null;
  let session = null;
  let guest = null;
  try {
    const o = JSON.parse(store.getItem(KEY) || "null");
    if (o && typeof o === "object" && str(o.access_token) && str(o.refresh_token)) session = o;
    const g = store.getItem("access_token");
    if (str(g)) guest = { access_token: g };
  } catch {
    return null;
  }
  return session || guest ? { session, guest } : null;
}

/** Who a session kept here before is, for the page while it is handed over (its tokens' claims, unchecked). */
function markerFrom(old, answer = null) {
  const claims = jwtClaims(old.access_token) || jwtClaims(old.refresh_token) || {};
  return parseMarker({
    cookie: true,
    sid: answer ? answer.sid : (claims.sid ?? null),
    user: answer ? answer.user : (claims.user_id ?? null),
    profile: old.profile,
    claims: old.claims,
  });
}

let adopting = null;

/**
 * Hands the tokens this browser kept in localStorage to the site's server,
 * which keeps them in the cookies; then clears them here. While it runs the
 * page shows the person signed in (from what was kept), and the API client
 * waits for it (`whenAdopted`). If the server can't be reached the tokens
 * stay here, untouched, for the next page load; this one shows nobody
 * signed in. Once the server has answered, they are gone from here whatever
 * it said (it takes every pair that could still be renewed).
 */
function startAdoption() {
  if (adopting || typeof window === "undefined") return adopting;
  const kept = storedTokens();
  if (!kept) return null;
  // A build without sign-in never used a kept session: only the guest goes over.
  const session = googleEnabled() ? kept.session : null;
  if (session) {
    current = markerFrom(session);
    persisted = false;
  }
  const run = async () => {
    let answer;
    try {
      const res = await sessionRoute("POST", {
        action: "adopt",
        session: session ? { access_token: session.access_token, refresh_token: session.refresh_token } : null,
        guest: kept.guest,
      });
      if (!res.ok) throw new Error(`The site answered ${res.status}`);
      answer = await res.json();
    } catch {
      persisted = true;
      if (session) {
        current = null;
        emit();
      }
      return;
    }
    if (session) {
      if (answer?.signedIn) {
        write(markerFrom(session, answer));
      } else {
        write(null);
      }
    } else if (kept.session) {
      // Sign-in is off in this build: the kept session was never used, and is not kept.
      try {
        storage()?.removeItem(KEY);
      } catch {
        /* private mode */
      }
    }
    try {
      GUEST_KEYS.forEach((k) => storage()?.removeItem(k));
    } catch {
      /* private mode */
    }
    noteGuest(answer?.guest ? "kept" : "none");
    persisted = true;
  };
  adopting = run().finally(() => {
    adopting = null;
  });
  emit();
  return adopting;
}

/** Resolves once tokens kept here before (if any) are in the cookies: the API client waits for it before a call. */
export const whenAdopted = () => adopting || Promise.resolve();

if (typeof window !== "undefined" && cookieSessionOn()) startAdoption();
