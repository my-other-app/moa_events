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
 * Nothing here calls the API, so the API client can read it without a cycle.
 */

const KEY = "moa.session";
const GUEST_KEYS = ["access_token", "refresh_token"];

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
  return parse(storage()?.getItem(KEY) ?? null);
}

let current = load();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

function write(next) {
  current = next;
  try {
    if (next) storage()?.setItem(KEY, JSON.stringify(next));
    else storage()?.removeItem(KEY);
  } catch {
    /* private mode: the session lasts for this page */
  }
  emit();
}

/** The signed-in session, or null. Null whenever sign-in isn't switched on for this build. */
export function getSession() {
  return googleEnabled() ? current : null;
}

export const isSignedIn = () => Boolean(getSession());

/** The account's access token, or null when nobody is signed in. */
export const userToken = () => getSession()?.access_token ?? null;

export function setSession({ access_token, refresh_token, profile = null, claims = null }) {
  write({ access_token, refresh_token, profile, claims });
}

/** Changes part of the session (new tokens after a refresh, the profile); a no-op once signed out. */
export function updateSession(patch) {
  if (!current) return;
  write({ ...current, ...patch });
}

export function clearSession() {
  if (current === null && !storage()?.getItem(KEY)) return;
  write(null);
}

/** Calls `fn` whenever the session changes, here or in another tab. Returns the unsubscribe. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    current = load();
    emit();
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
  emit();
}
