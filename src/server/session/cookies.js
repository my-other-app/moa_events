import "server-only";

/**
 * The cookies that hold a visitor's tokens when the build keeps them out of
 * page script (auth/cookiemode.js). All three are HttpOnly, SameSite=Lax,
 * Path=/, and on https Secure with the `__Host-` prefix, so no other
 * myotherapp.in host (a club's site among them) can set or replace them.
 *
 *   session   the account's access and refresh tokens, `<access>~<refresh>`;
 *             kept as long as the refresh token lasts
 *   guest     a registration's guest token (an access token); kept as long
 *             as it lasts, as the site has always used it
 *   payAs     the guest a waiting-list claim made for another address than
 *             the signed-in account's, kept an hour at most, to pay with
 *
 * Nothing here checks a token's signature: the API does, on every call.
 * Claims are read only to know when a token runs out and which session it is.
 */

/** A JWT as the API makes them: three base64url parts. Anything else is never kept or sent. */
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;
/** Each token stays well inside a cookie's 4 KB, two of them included. */
export const MAX_TOKEN_LENGTH = 1800;

export const isToken = (t) => typeof t === "string" && t.length <= MAX_TOKEN_LENGTH && JWT.test(t);

/** The claims inside a token, unchecked (see above), or null. */
export function claimsOf(token) {
  if (!isToken(token)) return null;
  try {
    const o = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/** When the token runs out, in ms, or null when it doesn't say. */
export function expiresAt(token) {
  const exp = Number(claimsOf(token)?.exp);
  return Number.isFinite(exp) ? exp * 1000 : null;
}

/** True when the token has run out, or will within `slackMs`. A token that doesn't say counts as fresh. */
export function isExpiring(token, now = Date.now(), slackMs = 60 * 1000) {
  const at = expiresAt(token);
  return at !== null && at <= now + slackMs;
}

/** The session's id (the `sid` claim) and the account's (`user_id`), for the page: never the tokens. */
export function whoIs(session) {
  if (!session) return { sid: null, user: null };
  const a = claimsOf(session.access) || {};
  const r = claimsOf(session.refresh) || {};
  const sid = a.sid ?? r.sid ?? null;
  const user = a.user_id ?? r.user_id ?? a.sub ?? null;
  return { sid: sid === null ? null : String(sid), user: user === null ? null : user };
}

/** Which refresh token is the later of two for one session: the API counts them up (`gen`). */
export const generation = (refresh) => {
  const g = Number(claimsOf(refresh)?.gen);
  return Number.isFinite(g) ? g : -1;
};

/* ---------- names and attributes ---------- */

/**
 * Whether the visitor reached the site over https: Caddy (and Vercel) say
 * so in X-Forwarded-Proto; a production server always is. Only then are
 * the cookies Secure, and named with `__Host-`.
 */
export function isSecure(request, env = process.env) {
  const proto = (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  if (proto === "https") return true;
  try {
    if (new URL(request.url).protocol === "https:") return true;
  } catch {
    /* a relative URL in a test */
  }
  return env.NODE_ENV === "production";
}

export function cookieNames(secure) {
  const p = secure ? "__Host-" : "";
  return { session: `${p}moa_session`, guest: `${p}moa_guest`, payAs: `${p}moa_payas` };
}

const DAY = 24 * 60 * 60;
const LIMITS = {
  session: { fallback: 30 * DAY, max: 400 * DAY },
  guest: { fallback: 30 * DAY, max: 30 * DAY },
  payAs: { fallback: 60 * 60, max: 60 * 60 },
};

/** How long a cookie holding `token` is kept, in seconds: as long as the token lasts, within the kind's limits. */
export function maxAgeFor(kind, token, now = Date.now()) {
  const { fallback, max } = LIMITS[kind];
  const at = expiresAt(token);
  if (at === null) return fallback;
  return Math.max(0, Math.min(max, Math.floor((at - now) / 1000)));
}

/** One Set-Cookie value. */
export function serializeCookie(name, value, { maxAge, secure }) {
  const parts = [`${name}=${value}`, "Path=/", `Max-Age=${Math.max(0, Math.floor(maxAge))}`, "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** The request's cookies, by name (the first of a name wins, as a browser sends the most specific first). */
export function readCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue;
    out[name] = part.slice(i + 1).trim();
  }
  return out;
}

/* ---------- what the cookies hold ---------- */

/** {access, refresh} from the session cookie, or null for anything that isn't two tokens. */
export function parseSession(value) {
  const [access, refresh, ...rest] = String(value || "").split("~");
  if (rest.length || !isToken(access) || !isToken(refresh)) return null;
  return { access, refresh };
}

/** One token from the guest or pay-as cookie, or null. */
export const parseToken = (value) => (isToken(value) ? value : null);

/** The visitor's cookies as this request carries them, under this request's names. */
export function readJar(request) {
  const secure = isSecure(request);
  const names = cookieNames(secure);
  const jar = readCookies(request.headers.get("cookie"));
  return {
    secure,
    names,
    session: parseSession(jar[names.session]),
    guest: parseToken(jar[names.guest]),
    payAs: parseToken(jar[names.payAs]),
  };
}

/**
 * The Set-Cookie values an answer carries: each kind set or cleared at most
 * once (the last word wins), so an answer never says two things about one cookie.
 */
export class CookieWriter {
  constructor({ names, secure }, now = Date.now()) {
    this.names = names;
    this.secure = secure;
    this.now = now;
    this.out = new Map();
  }

  setSession({ access, refresh }) {
    this.out.set("session", serializeCookie(this.names.session, `${access}~${refresh}`, { maxAge: maxAgeFor("session", refresh, this.now), secure: this.secure }));
  }

  setGuest(access) {
    this.out.set("guest", serializeCookie(this.names.guest, access, { maxAge: maxAgeFor("guest", access, this.now), secure: this.secure }));
  }

  setPayAs(access) {
    this.out.set("payAs", serializeCookie(this.names.payAs, access, { maxAge: maxAgeFor("payAs", access, this.now), secure: this.secure }));
  }

  clear(kind) {
    this.out.set(kind, serializeCookie(this.names[kind], "", { maxAge: 0, secure: this.secure }));
  }

  get size() {
    return this.out.size;
  }

  applyTo(headers) {
    for (const value of this.out.values()) headers.append("set-cookie", value);
    if (this.out.size) headers.set("cache-control", "private, no-store");
  }
}
