import { createContext, useContext } from "react";
import { CONTACT_EMAIL } from "@/config";
import { imageUrl } from "@/utils/format";

/**
 * What every page knows about signing in:
 *
 *   enabled    sign-in is switched on for this build (NEXT_PUBLIC_GOOGLE_CLIENT_ID set)
 *   ready      the browser has read who is signed in. False on the server and
 *              in the first paint (which must match it), when `status` is
 *              always "signed-out": a page that differs by who is reading
 *              shows a neutral state until it is true
 *   status     "signed-in" | "signed-out"
 *   user       {id, name, firstName, email, phone, picture, provider, emailVerified} while signed in;
 *              emailVerified is null until the profile has said
 *   attempt    Google's: {status: "idle" | "busy" | "error", error: {kind, message}}
 *   openSignIn({reason, onDone, view, email})   the sheet; `onDone(user)` runs once signed in;
 *                                        view "email" opens with the email form showing,
 *                                        `email` already in it
 *   openVerify({onDone})                 the sheet at "check your email", for a signed-in
 *                                        account whose address isn't verified yet
 *   signOut()
 *   tryOneTap()                          Google's One Tap, where a page offers it
 *
 * and, for the sheet's email forms (each resolves, or throws the API's error):
 *
 *   passwordSignIn({email, password, totpCode})  signs in and closes the sheet
 *   signUp({name, email, password})              signs in; the sheet goes on to the code
 *   forgotPassword(email) / resetPassword({email, code, password})   the latter signs in
 *   sendEmailCode() / verifyEmail(code)
 */
export const AuthContext = createContext(null);

const noop = () => {};
const nothing = async () => null;

/** Outside the provider (and in builds without sign-in): nobody is signed in and nothing offers it. */
const OFF = Object.freeze({
  enabled: false,
  ready: true,
  status: "signed-out",
  user: null,
  attempt: { status: "idle", error: null },
  openSignIn: noop,
  openVerify: noop,
  closeSignIn: noop,
  signOut: noop,
  tryOneTap: noop,
  signInWithCredential: nothing,
  passwordSignIn: nothing,
  signUp: nothing,
  forgotPassword: nothing,
  resetPassword: nothing,
  sendEmailCode: nothing,
  verifyEmail: nothing,
});

export function useAuth() {
  return useContext(AuthContext) || OFF;
}

const s = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The person, from the profile when it has come, else from what Google (or the sign-in form) said. */
export function userFromSession(session) {
  if (!session) return null;
  const p = session.profile && typeof session.profile === "object" ? session.profile : {};
  const c = session.claims && typeof session.claims === "object" ? session.claims : {};
  const extra = p.profile && typeof p.profile === "object" ? p.profile : {};
  const email = s(p.email) || s(c.email);
  const name = s(p.full_name) || s(extra.full_name) || s(c.name) || (email ? email.split("@")[0] : "You");
  return {
    id: p.id ?? null,
    name,
    firstName: s(c.given_name) && !s(p.full_name) ? s(c.given_name) : name.split(/\s+/)[0],
    email,
    phone: s(p.phone) || s(extra.whatsapp),
    picture: imageUrl(extra.profile_pic, "thumbnail") || imageUrl(extra.avatar?.image, "thumbnail") || s(c.picture),
    provider: s(p.provider),
    // Google and Apple accounts always are; a password account once its owner typed back the mailed code.
    emailVerified: typeof p.email_verified === "boolean" ? p.email_verified : null,
  };
}

/**
 * The API's sign-in refusals that have a code, in plain words. Shared by
 * Google's sign-in (below) and the email forms (auth/email.js).
 */
export const SIGN_IN_REFUSALS = {
  // An account an admin has suspended: refused at the door, and on every request after.
  ACCOUNT_SUSPENDED: { kind: "refused", message: `This account has been suspended. If you think that's a mistake, write to ${CONTACT_EMAIL}.` },
  // Google's token was malformed, expired or not for this site.
  INVALID_GOOGLE_TOKEN: { kind: "rejected", message: "Google's sign-in didn't go through — it may have timed out. Try again." },
  // A Google account whose own address Google hasn't verified.
  EMAIL_NOT_VERIFIED: {
    kind: "rejected",
    message: "Google hasn't verified this account's email address yet. Verify it with Google first, or use another Google account.",
  },
  // A password account with two-step verification on: the form asks for the code.
  TOTP_REQUIRED: { kind: "totp", message: "This account has two-step verification on. Enter the 6-digit code from your authenticator app, or a recovery code." },
};

/** What went wrong signing in, said plainly: {kind, message}. */
export function describeSignInError(error) {
  if (error?.kind === "load") {
    return { kind: "load", message: "Google sign-in didn't load. Check your connection — or a content blocker — and try again." };
  }
  if (error?.kind === "closed") {
    return { kind: "closed", message: "The Google window closed before you finished signing in. Try again when you're ready." };
  }
  if (error?.kind === "credential") {
    return { kind: "rejected", message: "Google didn't send a sign-in back. Try again, or use another Google account." };
  }
  const res = error?.response;
  if (!res) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again." };
  const status = res.status;
  const data = res.data;
  const said = s(typeof data?.message === "string" ? data.message : typeof data?.detail === "string" ? data.detail : null);
  const known = SIGN_IN_REFUSALS[typeof data?.error_code === "string" ? data.error_code : ""];
  if (known) return { ...known };
  if (status === 429) return { kind: "server", message: "Too many tries just now. Wait a minute, then try again." };
  if (status >= 500 || !status) return { kind: "server", message: "Something went wrong on our side. Try again in a moment." };
  const line = said ? (/[.!?]$/.test(said) ? said : `${said}.`) : "Google sign-in didn't go through.";
  return { kind: "rejected", message: `${line} Try again, or use another Google account.` };
}
