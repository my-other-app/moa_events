import "server-only";
import { cookieSessionOn } from "@/auth/cookiemode";
import { serverApiBase } from "@/server/api";
import { CookieWriter, claimsOf, generation, isExpiring, isToken, readJar, whoIs } from "./cookies";
import { fromThisSite, refusedCrossOrigin } from "./origin";
import { refreshSession } from "./refresh";
import { visitorHeaders } from "./gateway";

/**
 * /api/session: the visitor's session cookies, for the page (the tokens
 * themselves never leave this server).
 *
 *   GET     who is signed in on this browser: {signedIn, sid, user, guest}
 *   POST    {action: "adopt", session?: {access_token, refresh_token}, guest?: {access_token}}
 *             tokens this browser kept in localStorage before the site
 *             moved them into cookies, handed over once (auth/session.js)
 *             and then cleared there. A session cookie this browser
 *             already holds for the same sign-in is kept when it is the
 *             later of the two (the API counts refresh tokens up); for
 *             another sign-in, the one handed over wins: it is the one
 *             the page was showing.
 *           {action: "forget-guest"}
 *             a registration's guest token is no longer needed (the
 *             account's address is verified: its tickets are the account's)
 *   DELETE  signs this browser out: the session is ended on the API too
 *           (DELETE /auth/sessions/{sid}, with its own token), and the
 *           cookies are cleared, whatever the API said
 *
 * Only the site's own pages may ask (./origin.js). Off (404) unless the
 * build keeps tokens in cookies.
 */

export const MAX_BODY = 16 * 1024;
const END_TIMEOUT_MS = 8000;

const answer = (status, body, cookies) => {
  const headers = new Headers({ "cache-control": "private, no-store" });
  cookies?.applyTo(headers);
  return Response.json(body, { status, headers });
};

const stateOf = (session, guest) => ({ signedIn: Boolean(session), ...whoIs(session), guest: Boolean(guest) });

/** The later of two sessions for one sign-in, else the one handed over. */
export function laterSession(held, given) {
  if (!held) return given;
  const a = whoIs(held).sid;
  const b = whoIs(given).sid;
  if (!a || !b || a !== b) return given;
  const ga = generation(held.refresh);
  const gb = generation(given.refresh);
  if (ga !== gb) return ga > gb ? held : given;
  const ea = Number(claimsOf(held.access)?.exp) || 0;
  const eb = Number(claimsOf(given.access)?.exp) || 0;
  return ea > eb ? held : given;
}

/** A token pair the page handed over, when it is one: tokens of the right shape, the refresh token not yet run out. */
function handedSession(o, now) {
  if (!o || typeof o !== "object") return null;
  const { access_token: access, refresh_token: refresh } = o;
  if (!isToken(access) || !isToken(refresh)) return null;
  if (isExpiring(refresh, now, 0)) return null;
  const type = claimsOf(refresh)?.token_type;
  if (type && type !== "refresh_token") return null;
  return { access, refresh };
}

function handedGuest(o, now) {
  const access = o && typeof o === "object" ? o.access_token : null;
  if (!isToken(access) || isExpiring(access, now, 0)) return null;
  return access;
}

export function createSessionRoutes({ fetchImpl = (...a) => globalThis.fetch(...a), apiBase = serverApiBase, now = Date.now } = {}) {
  const base = () => (typeof apiBase === "function" ? apiBase() : apiBase).replace(/\/+$/, "");
  const off = () => Response.json({ message: "Not found", error_code: "NOT_FOUND" }, { status: 404, headers: { "cache-control": "no-store" } });

  async function GET(request) {
    if (!cookieSessionOn()) return off();
    if (!fromThisSite(request)) return refusedCrossOrigin();
    const jar = readJar(request);
    return answer(200, stateOf(jar.session, jar.guest));
  }

  async function POST(request) {
    if (!cookieSessionOn()) return off();
    if (!fromThisSite(request)) return refusedCrossOrigin();
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return answer(413, { message: "Too big.", error_code: "TOO_LARGE" });
    let data;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return answer(413, { message: "Too big.", error_code: "TOO_LARGE" });
      data = JSON.parse(text);
    } catch {
      return answer(400, { message: "Not a request this route takes.", error_code: "BAD_REQUEST" });
    }
    const jar = readJar(request);
    const cookies = new CookieWriter(jar, now());
    let session = jar.session;
    let guest = jar.guest;

    if (data?.action === "adopt") {
      const given = handedSession(data.session, now());
      if (given) {
        const kept = laterSession(session, given);
        if (kept !== session) cookies.setSession(kept);
        session = kept;
      }
      const handed = handedGuest(data.guest, now());
      if (handed) {
        cookies.setGuest(handed);
        guest = handed;
      }
      return answer(200, stateOf(session, guest), cookies);
    }

    if (data?.action === "forget-guest") {
      if (guest) cookies.clear("guest");
      return answer(200, stateOf(session, null), cookies);
    }

    return answer(400, { message: "Not a request this route takes.", error_code: "BAD_REQUEST" });
  }

  async function DELETE(request) {
    if (!cookieSessionOn()) return off();
    if (!fromThisSite(request)) return refusedCrossOrigin();
    const jar = readJar(request);
    const cookies = new CookieWriter(jar, now());
    let session = jar.session;
    if (session) {
      const { sid } = whoIs(session);
      if (sid) {
        try {
          // A token that has run out can't end anything: renewed first (the renewal is spent the moment the session ends).
          if (isExpiring(session.access, now(), 0)) {
            const renewed = await refreshSession(session.refresh, { apiBase: base(), fetchImpl, headers: visitorHeaders(request), now });
            if (renewed.ok) session = { access: renewed.access, refresh: renewed.refresh };
          }
          await fetchImpl(`${base()}/api/v1/auth/sessions/${encodeURIComponent(sid)}`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${session.access}`, accept: "application/json", ...visitorHeaders(request) },
            cache: "no-store",
            redirect: "manual",
            signal: AbortSignal.timeout(END_TIMEOUT_MS),
          });
        } catch {
          /* signed out here all the same */
        }
      }
      cookies.clear("session");
    }
    if (jar.payAs) cookies.clear("payAs");
    return answer(200, stateOf(null, jar.guest), cookies);
  }

  return { GET, POST, DELETE };
}
