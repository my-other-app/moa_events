import { CONTACT_EMAIL } from "@/config";

/**
 * Signing in with an email and password: the other way into the same account
 * Google opens, with the same session (auth/session.js) once it is in. What
 * the forms check before anything is sent, and what the API's refusals mean,
 * said plainly.
 *
 *   POST /auth/token        form: username, password[, totp_code]   → tokens
 *   POST /user/register     {full_name, email, password}            → tokens + username; a code is mailed
 *   POST /auth/email/send-code       (signed in)    → {sent, email, expires_in, retry_after}
 *   POST /auth/email/verify {code}   (signed in)    → {email_verified, email_verified_at, merged, registrations_transferred}
 *   POST /auth/password/forgot {email}              → {sent: true}, account or not
 *   POST /auth/password/reset {email, code, new_password}  → tokens
 *
 * Refusals come as {message, errors, error_code}; the rate limiter's own 429
 * as {error}. Nothing here calls the API.
 */

const s = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const sentence = (v) => {
  const t = s(v);
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};

/** Six digits, mailed; good for fifteen minutes and five tries. */
export const CODE_LENGTH = 6;

/** The server's once-a-minute rule, for when it hasn't said how long. */
export const RESEND_AFTER_S = 60;

/** The app's rule for a new password, and the server's for a changed or reset one. */
export const PASSWORD_MIN = 6;
export const PASSWORD_RULES = [{ id: "length", label: `At least ${PASSWORD_MIN} characters`, test: (p) => String(p || "").length >= PASSWORD_MIN }];
export const passwordOk = (p) => PASSWORD_RULES.every((r) => r.test(p));

/** What was typed, as the server will look it up: trimmed, the case left alone (the server matches it exactly). */
export const cleanEmail = (v) => String(v || "").trim();
export const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(v));
export const digitsOf = (v) => String(v || "").replace(/\D/g, "");

/** Six empty boxes. */
export const emptyCode = () => Array.from({ length: CODE_LENGTH }, () => "");

/** "1:05", "0:09". */
export function clock(seconds) {
  const t = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/* ---------- whether this API can reset a password ---------- */

// The reset endpoints are newer than the rest. Where they aren't there yet
// (a 404), "Forgot password?" stops being offered for the rest of the visit.
const RESET_KEY = "moa.pwreset";
const session = () => {
  try {
    // Only in a browser: on the server there is none (newer Node has a sessionStorage global that isn't one).
    if (typeof window === "undefined" || typeof sessionStorage === "undefined" || typeof sessionStorage?.getItem !== "function") return null;
    return sessionStorage;
  } catch {
    return null;
  }
};
let resetMissing = (() => {
  try {
    return session()?.getItem(RESET_KEY) === "missing";
  } catch {
    return false;
  }
})();

export const passwordResetOffered = () => !resetMissing;

export function markPasswordResetMissing() {
  resetMissing = true;
  try {
    session()?.setItem(RESET_KEY, "missing");
  } catch {
    /* private mode: for this page only */
  }
}

/** For tests: as a fresh visit would find it. */
export function resetPasswordResetForTests() {
  resetMissing = false;
  try {
    session()?.removeItem(RESET_KEY);
  } catch {
    /* nothing to clear */
  }
}

/* ---------- what went wrong ---------- */

const NETWORK = "We couldn't reach MyOtherApp. Check your connection and try again.";
const SERVER = "Something went wrong on our side. Try again in a moment.";
const BUSY = "Too many tries just now. Wait a minute, then try again.";
const NO_MATCH = "That email and password don't match. If you joined with Google, use Continue with Google instead.";
const NO_RESET = `You can't reset a password on the website just yet. If this address is a Google account, Continue with Google opens the same account; otherwise write to ${CONTACT_EMAIL} and we'll get you back in.`;

/** One field's refusal from the server, in the form's words. */
function fieldMessage(field, raw) {
  const t = s(Array.isArray(raw) ? raw[0] : raw) || "";
  if (/already exists/i.test(t)) return field === "email" ? "There's already an account with this email." : sentence(t);
  if (/not a valid email|valid email/i.test(t)) return "Enter a valid email address.";
  if (/^field required$/i.test(t)) return field === "name" ? "Enter your name." : field === "email" ? "Enter your email." : "This can't be empty.";
  const atLeast = /at least (\d+) char/i.exec(t);
  if (atLeast) return `Use at least ${atLeast[1]} characters.`;
  return sentence(t.replace(/^value error,\s*/i, "")) || null;
}

const FIELD_OF = { email: "email", username: "email", password: "password", new_password: "password", full_name: "name", code: "code", totp_code: "totp" };

/** The server's field errors, by the form's field names; {} when there are none. */
function fieldErrors(errors) {
  const out = {};
  if (!errors || typeof errors !== "object") return out;
  for (const [key, value] of Object.entries(errors)) {
    const field = FIELD_OF[key];
    if (!field || out[field]) continue;
    const m = fieldMessage(field, value);
    if (m) out[field] = m;
  }
  return out;
}

/**
 * What went wrong, for the form to show where it belongs:
 *
 *   {kind: "network" | "server" | "busy" | "locked" | "refused" | "rejected", message}
 *   {kind: "fields", fields: {email?, password?, name?}, message, exists?}   beside the fields
 *   {kind: "totp", message}                     the account has a second factor: ask for it
 *   {kind: "code", code, message, attemptsLeft} CODE_INVALID / CODE_LOCKED / CODE_EXPIRED
 *   {kind: "wait", code, message, retryAfter}   CODE_RECENTLY_SENT / CODE_DAILY_LIMIT
 *   {kind: "already", message}                  ALREADY_VERIFIED
 *   {kind: "unavailable", message}              the reset endpoints aren't on this server (404)
 *
 * `flow` is "signin" | "totp" | "signup" | "forgot" | "reset" | "verify" | "send".
 */
export function describeAuthError(error, flow) {
  if (error?.authExpired) return { kind: "expired", message: "Your sign-in has expired. Sign in again." };
  const res = error?.response;
  if (!res) return { kind: "network", message: NETWORK };
  const status = res.status;
  const data = res.data && typeof res.data === "object" ? res.data : {};
  const code = s(data.error_code);
  const errors = data.errors && typeof data.errors === "object" ? data.errors : {};
  const said = sentence(s(data.message) || s(data.detail));

  if (!status || status >= 500) return { kind: "server", message: SERVER };
  if (status === 404 && (flow === "forgot" || flow === "reset")) return { kind: "unavailable", message: NO_RESET };
  if (status === 429) {
    if (code === "CODE_RECENTLY_SENT" || code === "CODE_DAILY_LIMIT") {
      return { kind: "wait", code, message: said || BUSY, retryAfter: num(errors.retry_after) };
    }
    if (code === "LOGIN_LOCKED") return { kind: "locked", code, message: said || BUSY };
    // The rate limiter's own refusal ({error: "Rate limit exceeded: …"}) says nothing a person needs.
    return { kind: "busy", message: BUSY };
  }
  if (code === "TOTP_REQUIRED") return { kind: "totp", message: said || "Enter the code from your authenticator app." };
  if (code === "TOTP_INVALID") return { kind: "fields", fields: { totp: said || "That code is not valid." }, message: said };
  if (code === "CODE_INVALID" || code === "CODE_LOCKED" || code === "CODE_EXPIRED") {
    return { kind: "code", code, message: said || "That code isn't right.", attemptsLeft: num(errors.attempts_left) };
  }
  if (code === "ALREADY_VERIFIED") return { kind: "already", message: said || "Your email is already verified." };
  // The token endpoint says "Incorrect username or password" for every mismatch, Google-only accounts included.
  if ((flow === "signin" || flow === "totp") && status === 401) return { kind: "fields", fields: { password: NO_MATCH }, message: NO_MATCH };

  const fields = fieldErrors(errors);
  if (Object.keys(fields).length) {
    return { kind: "fields", fields, message: said, exists: /already exists/i.test(String(errors.email || "")) };
  }
  if (status === 403) return refusedHere(said);
  return { kind: "rejected", message: said || "That didn't go through. Check what you typed and try again." };
}

/**
 * The password was right but the account isn't one this site signs in: the
 * profile is refused (403) for a club's dashboard login, and for a suspended
 * account.
 */
export function refusedHere(said) {
  if (/suspend/i.test(String(said || ""))) {
    return { kind: "refused", message: `This account has been suspended. If you think that's a mistake, write to ${CONTACT_EMAIL}.` };
  }
  return {
    kind: "refused",
    message: "This email signs in to a club's dashboard, not to a MyOtherApp account. Use the clubs dashboard for it, or sign in here with your own account.",
    club: true,
  };
}

/** What a resend countdown starts from: the server's `retry_after` when it gave one. */
export const waitFrom = (problemOrResponse) => {
  const n = num(problemOrResponse?.retryAfter ?? problemOrResponse?.retry_after);
  return n && n > 0 ? n : RESEND_AFTER_S;
};
