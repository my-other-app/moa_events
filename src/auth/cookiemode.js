/**
 * Where a visitor's tokens live, decided when the site is built.
 *
 *   NEXT_PUBLIC_SESSION_COOKIE unset or off (today's default)
 *     the account's tokens and a registration's guest token are kept in
 *     localStorage (auth/session.js), and the browser sends them to the
 *     API itself, as it always has.
 *
 *   NEXT_PUBLIC_SESSION_COOKIE=on
 *     the tokens are kept in HttpOnly, Secure, SameSite=Lax cookies that
 *     only the site's own server reads: page script never sees them. A
 *     call that needs a token goes to the site's gateway (GATEWAY_PATH),
 *     which adds the token, renews it when it runs out, and passes the
 *     call on to the API (src/server/session). localStorage keeps only
 *     who is signed in (name, picture) so every tab can show it. Tokens a
 *     browser still holds from before are moved into the cookies on its
 *     first visit, then cleared (auth/session.js, `adopt`).
 *
 * The same value is written into the browser bundle and the server's, so
 * the two always agree; a change needs a new build.
 */

const ON = /^(on|1|true|yes)$/i;

/** True when this build keeps the visitor's tokens in HttpOnly cookies (read as a literal so Next writes it in at build time). */
export const cookieSessionOn = () => ON.test(String(process.env.NEXT_PUBLIC_SESSION_COOKIE ?? "").trim());

/** The site's own routes: the gateway every call with a token goes through, and the session's (adopt, sign out). */
export const GATEWAY_PATH = "/api/gateway";
export const SESSION_PATH = "/api/session";

/**
 * What a call to the gateway may go with, in AUTH_HEADER:
 *   auto     the account's token when signed in, else a registration's guest token (the default)
 *   user     the account's token only, never a guest's (a public read that only cares who is reading)
 *   session  the account's token only, and its refusal passed on as it came (checking a sign-in's profile)
 *   none     no token at all (the sign-ins themselves, public reads)
 *   pay-as   the guest a waiting-list claim made for another address, to pay with
 */
export const AUTH_HEADER = "X-Moa-Auth";
export const AUTH_MODES = new Set(["auto", "user", "session", "none", "pay-as"]);

/** What the gateway tells the page, on every answer it passes on. */
export const AS_HEADER = "X-Moa-As"; // user | guest | pay-as | visitor: what the call went with
export const SESSION_HEADER = "X-Moa-Session"; // ended[; reason=reused|club] | none | started
export const GUEST_HEADER = "X-Moa-Guest"; // kept | gone | none

/**
 * Paying as the guest a waiting-list claim made for another address: the
 * gateway kept that guest's token (the claim's answer says
 * `auth_token: {kept: "pay_as"}`), and a call made with this as its token
 * goes with it.
 */
export const PAY_AS = "pay-as";

/** The gateway's refusal of a change once the session could not be kept alive (the page says "sign in again"). */
export const SIGNED_OUT = "SIGNED_OUT";
