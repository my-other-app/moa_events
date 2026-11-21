import "server-only";
import { AS_HEADER, AUTH_HEADER, AUTH_MODES, GATEWAY_PATH, GUEST_HEADER, SESSION_HEADER, SIGNED_OUT, cookieSessionOn } from "@/auth/cookiemode";
import { serverApiBase } from "@/server/api";
import { visitorIp } from "@/server/visitor";
import { CookieWriter, isExpiring, isToken, readJar, whoIs } from "./cookies";
import { SAFE_METHODS, fromThisSite, refusedCrossOrigin } from "./origin";
import { refreshSession } from "./refresh";

/**
 * The site's gateway to the API, for the calls that go with a visitor's
 * token when the build keeps tokens in HttpOnly cookies (auth/cookiemode.js):
 *
 *   /api/gateway/api/v1/...  →  {API_BASE_URL}/api/v1/...
 *
 * The page names what the call may go with (X-Moa-Auth: auto, user,
 * session, none, pay-as) and the gateway picks the token from the cookies,
 * exactly as the browser's own client did (src/api/client.js):
 *
 *   signed in    the account's token, renewed first when it is about to run
 *                out, and once more if the API refuses it; a guest token is
 *                never sent alongside or instead
 *   signed out   the guest token a registration left (not for `user`
 *                calls), forgotten once the API refuses it, and the call
 *                sent once more as a plain visitor
 *
 * A call that set out as the signed-in person never quietly goes on as a
 * guest: when the session can't be kept alive (the API refuses the
 * renewal) the session cookie is cleared and a read goes on as a visitor,
 * while a change is refused (401 SIGNED_OUT), so a registration can't land
 * on a fresh guest by accident.
 *
 * Tokens never reach the page: a sign-in's tokens (Google, a password, a
 * new account, a reset) become the session cookie and leave the answer;
 * a registration's `auth_token` becomes the guest cookie (or, for someone
 * signed in who claimed a place for another address, the pay-as cookie)
 * and the answer says only {kept}. Every answer says what the call went
 * with (X-Moa-As) and what changed (X-Moa-Session, X-Moa-Guest), so the
 * page can show who is signed in.
 *
 * Passed on to the API: the body, a short list of the page's headers, the
 * token, and the visitor's address (X-Forwarded-For, X-Real-IP) and user
 * agent, so the API limits and records each visitor as their own. Never the
 * browser's cookies, never the site's own server credential (X-Site-Token:
 * that is for the site's public reads alone). Nothing from the API's
 * Set-Cookie or CORS headers comes back.
 *
 * Only the site's own pages may use it (./origin.js). Only /api/v1/ is
 * passed on, never the refresh or sign-out routes (this server renews and
 * src/server/session/session.js signs out), never an event stream (the
 * live room opens those on the API itself).
 */

export const UPSTREAM_TIMEOUT_MS = 60 * 1000;
/** As big as the proxy in front lets a request be (Caddy's 10 MB). */
export const MAX_BODY = 10 * 1024 * 1024;

const FORWARDED = ["accept", "accept-language", "content-type", "if-none-match", "if-modified-since", "if-match", "idempotency-key", "x-live-key", "x-live-player", "x-live-version", "user-agent"];
const DROPPED = new Set(["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "server", "strict-transport-security"]);

/** Where a sign-in's tokens come back: they become the session. */
const SIGN_INS = new Set(["/api/v1/auth/google", "/api/v1/auth/token", "/api/v1/user/register", "/api/v1/auth/password/reset"]);
/** Never passed on: this server renews and ends sessions itself. */
const CLOSED = new Set(["/api/v1/auth/refresh", "/api/v1/auth/logout"]);

const json = (status, body, headers = {}) => Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
const notFound = () => json(404, { message: "Not found", error_code: "NOT_FOUND" });

/** The API path a gateway address names, or null when it isn't one the gateway passes on. */
export function upstreamPath(pathname) {
  if (!pathname.startsWith(`${GATEWAY_PATH}/`)) return null;
  const path = pathname.slice(GATEWAY_PATH.length);
  if (!path.startsWith("/api/v1/") || path.includes("\\")) return null;
  for (const segment of path.split("/").slice(1)) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) return null;
  }
  const clean = path.replace(/\/+$/, "");
  if (CLOSED.has(clean) || /\/stream$/.test(clean)) return null;
  return path;
}

/** The headers the API is sent: the page's short list, the visitor, and the token (if any). */
function upstreamHeaders(request, token) {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const ip = visitorIp(request.headers);
  if (ip) {
    headers.set("x-forwarded-for", ip);
    headers.set("x-real-ip", ip);
  }
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) headers.set("x-forwarded-proto", proto.split(",")[0].trim());
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

/** The visitor's own headers for a renewal: the API records it as theirs. */
export function visitorHeaders(request) {
  const out = {};
  const ip = visitorIp(request.headers);
  if (ip) {
    out["x-forwarded-for"] = ip;
    out["x-real-ip"] = ip;
  }
  const ua = request.headers.get("user-agent");
  if (ua) out["user-agent"] = ua;
  return out;
}

/**
 * A redirect the API answers with names its own address as the site's
 * server reached it (the box's internal one): one into /api/v1/ on that
 * host is pointed at the gateway instead, so the browser follows it here.
 * Any other address (relative ones resolved first) passes as it came.
 */
export function gatewayLocation(location, target, base) {
  let u;
  try {
    u = new URL(location, target);
  } catch {
    return location;
  }
  let api;
  try {
    api = new URL(base);
  } catch {
    return location;
  }
  if (u.host !== api.host || !u.pathname.startsWith("/api/v1/")) return u.toString();
  return `${GATEWAY_PATH}${u.pathname}${u.search}`;
}

const isJson = (type) => Boolean(type) && /^application\/(?:[\w.+-]+\+)?json\b/i.test(type);

/** The API's error_code in a JSON answer, read from a copy (the answer itself may still be passed on). */
async function errorCode(res) {
  if (!isJson(res.headers.get("content-type"))) return null;
  try {
    const data = JSON.parse(await res.clone().text());
    return typeof data?.error_code === "string" ? data.error_code : null;
  } catch {
    return null;
  }
}

const discard = (res) => {
  try {
    res?.body?.cancel?.();
  } catch {
    /* already read */
  }
};

/**
 * Takes the tokens out of an answer, into cookies: a sign-in's become the
 * session; a registration's `auth_token`, the guest (or pay-as) cookie. The
 * answer's own words are kept; `session: {sid, user}` says who signed in.
 */
export function keepTokens(data, { path, method, ok, as, cookies, signals }) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  let out = data;
  const hasTokens = "access_token" in data || "refresh_token" in data;
  if (hasTokens) {
    out = { ...data };
    delete out.access_token;
    delete out.refresh_token;
    if (ok && method === "POST" && SIGN_INS.has(path.replace(/\/+$/, "")) && isToken(data.access_token) && isToken(data.refresh_token)) {
      const session = { access: data.access_token, refresh: data.refresh_token };
      cookies.setSession(session);
      cookies.clear("payAs");
      signals.session = "started";
      out.session = whoIs(session);
    }
  }
  const handed = data.auth_token;
  if (handed && typeof handed === "object" && !Array.isArray(handed)) {
    out = out === data ? { ...data } : out;
    if (ok && isToken(handed.access_token)) {
      if (as === "user") {
        // Signed in here, but the place was claimed for another address: that guest pays for it.
        cookies.setPayAs(handed.access_token);
        out.auth_token = { kept: "pay_as" };
      } else {
        cookies.setGuest(handed.access_token);
        signals.guest = "kept";
        out.auth_token = { kept: "guest" };
      }
    } else {
      out.auth_token = null;
    }
  }
  return out;
}

/**
 * The gateway's handler, for every method of
 * src/app/api/gateway/[...path]/route.js. `fetchImpl`, `apiBase` and `now`
 * are for tests.
 */
export function createGateway({ fetchImpl = (...a) => globalThis.fetch(...a), apiBase = serverApiBase, now = Date.now, timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  return async function gateway(request) {
    if (!cookieSessionOn()) return notFound();
    if (!fromThisSite(request)) return refusedCrossOrigin();
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS" } });

    const url = new URL(request.url);
    const path = upstreamPath(url.pathname);
    if (!path) return notFound();
    const base = (typeof apiBase === "function" ? apiBase() : apiBase).replace(/\/+$/, "");
    const target = `${base}${path}${url.search}`;

    const method = request.method;
    const read = SAFE_METHODS.has(method);
    let body;
    if (!read) {
      if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return json(413, { message: "That's too big to send.", error_code: "TOO_LARGE" });
      body = await request.arrayBuffer();
      if (body.byteLength > MAX_BODY) return json(413, { message: "That's too big to send.", error_code: "TOO_LARGE" });
      if (body.byteLength === 0) body = undefined;
    }

    const jar = readJar(request);
    const cookies = new CookieWriter(jar, now());
    const signals = {};
    const asked = request.headers.get(AUTH_HEADER)?.trim().toLowerCase();
    const mode = AUTH_MODES.has(asked) ? asked : "auto";
    // `session`: the account's token or nothing, and its refusal passed on as it came, never sent again as a visitor.
    const fallback = read && mode !== "session";
    const renewWith = visitorHeaders(request);
    let session = jar.session;

    /** The session is over: its cookie goes, and the page is told why. */
    const endSession = (code = null) => {
      session = null;
      cookies.clear("session");
      const reason = code === "SESSION_REUSED" ? "reused" : code === "CLUB_NOT_VERIFIED" ? "club" : null;
      signals.session = reason ? `ended; reason=${reason}` : "ended";
    };
    const renew = async () => {
      const result = await refreshSession(session.refresh, { apiBase: base, fetchImpl, headers: renewWith, now });
      if (result.ok) {
        session = { access: result.access, refresh: result.refresh };
        cookies.setSession(session);
      } else if (result.refused) {
        endSession(result.code);
      }
      return result;
    };

    // What the call goes with.
    let as = "visitor";
    if (mode === "pay-as") {
      if (jar.payAs) as = "pay-as";
    } else if (mode !== "none") {
      if (session) as = "user";
      else {
        signals.session = "none";
        if (mode === "auto") {
          if (jar.guest) as = "guest";
          else signals.guest = "none";
        }
      }
    }
    const tokenFor = (who) => (who === "user" ? session?.access : who === "guest" ? jar.guest : who === "pay-as" ? jar.payAs : null);

    const abort = new AbortController();
    const onGone = () => abort.abort();
    if (request.signal?.aborted) onGone();
    else request.signal?.addEventListener?.("abort", onGone, { once: true });

    let expired = false;
    /** The call, as `who`: the time limit is to the start of the API's answer; its body then takes as long as it takes. */
    const send = async (who) => {
      const timer = setTimeout(() => {
        expired = true;
        abort.abort();
      }, timeoutMs);
      try {
        return await fetchImpl(target, { method, headers: upstreamHeaders(request, tokenFor(who)), body, redirect: "manual", cache: "no-store", signal: abort.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    /** The headers the page gets: the API's (less cookies, CORS and hop-by-hop ones), what the call went with, and what changed. */
    const headersFor = (res) => {
      const headers = new Headers();
      res.headers.forEach((value, key) => {
        const name = key.toLowerCase();
        if (DROPPED.has(name) || name.startsWith("access-control-") || name.startsWith("x-moa-")) return;
        headers.set(key, value);
      });
      if (!headers.has("cache-control")) headers.set("cache-control", "private, no-store");
      const location = headers.get("location");
      if (location) headers.set("location", gatewayLocation(location, target, base));
      headers.set(AS_HEADER, as);
      if (signals.session) headers.set(SESSION_HEADER, signals.session);
      if (signals.guest) headers.set(GUEST_HEADER, signals.guest);
      cookies.applyTo(headers);
      return headers;
    };

    /** An answer of the gateway's own (a refusal, a timeout), with the cookies and signals it carries. */
    const own = (status, data) => {
      const res = json(status, data);
      return new Response(res.body, { status, headers: headersFor(res) });
    };
    const signedOut = () => own(401, { message: "Your sign-in has expired. Sign in again.", error_code: SIGNED_OUT });

    /** The API's answer, passed on: a JSON body that carries tokens has them taken out, into cookies. */
    const passOn = async (res) => {
      if (isJson(res.headers.get("content-type")) && res.status !== 204 && res.status !== 304 && method !== "HEAD") {
        const text = await res.text();
        if (/"(?:access_token|refresh_token|auth_token)"/.test(text)) {
          let data = null;
          try {
            data = JSON.parse(text);
          } catch {
            /* not JSON after all: passed on as it came */
          }
          const kept = data === null ? data : keepTokens(data, { path, method, ok: res.ok, as, cookies, signals });
          if (kept !== data) return new Response(JSON.stringify(kept), { status: res.status, headers: headersFor(res) });
        }
        return new Response(text, { status: res.status, headers: headersFor(res) });
      }
      return new Response(res.status === 204 || res.status === 304 || method === "HEAD" ? null : res.body, { status: res.status, headers: headersFor(res) });
    };

    try {
      // The account's token, renewed first when it is about to run out.
      if (as === "user" && isExpiring(session.access, now())) {
        const result = await renew();
        if (!result.ok && result.refused) {
          if (!fallback) return signedOut();
          as = "visitor";
        }
      }

      let res = await send(as);

      if (as === "user" && res.status === 401) {
        const result = await renew();
        if (result.ok) {
          discard(res);
          res = await send("user");
          if (res.status === 401) {
            // Refused even fresh: the session was ended elsewhere.
            discard(res);
            endSession();
            if (!fallback) return signedOut();
            as = "visitor";
            res = await send(as);
          }
        } else if (result.refused) {
          discard(res);
          if (!fallback) return signedOut();
          as = "visitor";
          res = await send(as);
        }
        // Not asked (offline, a 5xx): the API's refusal stands, and the session with it.
      } else if (as === "user" && res.status === 403) {
        const code = await errorCode(res);
        if (code === "CLUB_NOT_VERIFIED") {
          // A club's account: clubs sign in on their dashboard, never here. A read goes on as a visitor.
          endSession(code);
          if (fallback) {
            discard(res);
            as = "visitor";
            res = await send(as);
          }
        }
      } else if (as === "guest" && res.status === 401) {
        // The guest token has aged out: forgotten, and the same call once more as a plain visitor.
        discard(res);
        cookies.clear("guest");
        signals.guest = "gone";
        as = "visitor";
        res = await send(as);
      } else if (as === "pay-as" && res.status === 401) {
        cookies.clear("payAs");
      }

      return await passOn(res);
    } catch {
      if (expired) return own(504, { message: "The server took too long to answer. If you were changing something, reload in a minute and check before trying again.", error_code: "UPSTREAM_TIMEOUT" });
      if (request.signal?.aborted) return new Response(null, { status: 499 });
      return own(502, { message: "The server can't be reached right now. Try again in a moment.", error_code: "UPSTREAM_UNREACHABLE" });
    } finally {
      request.signal?.removeEventListener?.("abort", onGone);
    }
  };
}
