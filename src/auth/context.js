import { createContext, useContext } from "react";
import { imageUrl } from "@/utils/format";

/**
 * What every page knows about signing in:
 *
 *   enabled    sign-in is switched on for this build (VITE_GOOGLE_CLIENT_ID set)
 *   status     "signed-in" | "signed-out"
 *   user       {id, name, firstName, email, phone, picture} while signed in
 *   attempt    {status: "idle" | "busy" | "error", error: {kind, message}}
 *   openSignIn({reason, onDone})   the sheet; `onDone(user)` runs once signed in
 *   signOut()
 *   tryOneTap()                    Google's One Tap, where a page offers it
 */
export const AuthContext = createContext(null);

const noop = () => {};

/** Outside the provider (and in builds without sign-in): nobody is signed in and nothing offers it. */
const OFF = Object.freeze({
  enabled: false,
  status: "signed-out",
  user: null,
  attempt: { status: "idle", error: null },
  openSignIn: noop,
  closeSignIn: noop,
  signOut: noop,
  tryOneTap: noop,
  signInWithCredential: async () => null,
});

export function useAuth() {
  return useContext(AuthContext) || OFF;
}

const s = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** The person, from the profile when it has come, else from what Google said at sign-in. */
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
  };
}

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
  if (status === 429) return { kind: "server", message: "Too many tries just now. Wait a minute, then try again." };
  if (status >= 500 || !status) return { kind: "server", message: "Something went wrong on our side. Try again in a moment." };
  const line = said ? (/[.!?]$/.test(said) ? said : `${said}.`) : "Google sign-in didn't go through.";
  return { kind: "rejected", message: `${line} Try again, or use another Google account.` };
}
