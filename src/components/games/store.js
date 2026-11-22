/*
 * The game session this browser holds, per event (CONTRACT section 1): a
 * signed token the API gave for one registration. Kept in localStorage so a
 * reload or a second tab stays in; every read and write is guarded (private
 * windows, blocked storage).
 */
const key = (eventId) => `moa.game.session.${eventId}`;

export function readSession(eventId) {
  try {
    const raw = localStorage.getItem(key(eventId));
    const v = raw ? JSON.parse(raw) : null;
    if (!v?.token) return null;
    if (v.expires_at && Date.parse(v.expires_at) < Date.now()) return null;
    return v;
  } catch {
    return null;
  }
}

export function saveSession(eventId, session) {
  try {
    localStorage.setItem(key(eventId), JSON.stringify({ token: session.token, expires_at: session.expires_at || null }));
  } catch {
    /* the session just lasts this page */
  }
}

export function dropSession(eventId) {
  try {
    localStorage.removeItem(key(eventId));
  } catch {
    /* nothing to drop */
  }
}

/** A refusal that means "this session is over" (ended by a newer sign-in, expired, or the event's games went away). */
export const sessionOver = (f) => f?.status === 401 || f?.code === "SESSION_ENDED" || f?.code === "SESSION_INVALID";

/**
 * The app opens /play/{ref}#gs=<game session token> in its in-app browser.
 * The token is kept as the event's game session, exactly as after a badge +
 * PIN sign-in, and the fragment is taken off the address at once so it never
 * stays visible or bookmarkable. Returns the token, or null when there was none.
 */
export function takeFragmentSession(eventId, win = globalThis.window) {
  if (!win?.location?.hash) return null;
  const params = new URLSearchParams(win.location.hash.replace(/^#/, ""));
  const token = params.get("gs");
  if (!token || !/^[A-Za-z0-9._~-]{8,600}$/.test(token)) return null;
  saveSession(eventId, { token });
  params.delete("gs");
  const rest = params.toString();
  try {
    win.history.replaceState(win.history.state, "", `${win.location.pathname}${win.location.search}${rest ? `#${rest}` : ""}`);
  } catch {
    /* the address stays; the session is kept anyway */
  }
  return token;
}
