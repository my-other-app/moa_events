import { vi } from "vitest";
import { reloadSessionForTests } from "@/auth/session";
import { resetGoogleForTests } from "@/auth/google";

/**
 * For tests of signing in: a made-up client id (never a real one), a fake
 * google.accounts.id, tokens that look like the API's, and a signed-in
 * session put straight into storage.
 */

export const TEST_CLIENT_ID = "000000000000-notarealclient.apps.googleusercontent.com";

const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A JWT-shaped string with these claims (unsigned: the site never checks signatures). */
export const fakeJwt = (claims) => `${b64url({ alg: "none", typ: "JWT" })}.${b64url(claims)}.sig`;

/** An access token for the API: its session id and expiry are what the site reads. */
export const accessToken = ({ sid = "sess-1", exp = Math.floor(Date.now() / 1000) + 3600, user_id = 7 } = {}) =>
  fakeJwt({ user_id, token_type: "access_token", sid, exp });

/** What Google hands back on a sign-in. */
export const googleCredential = (over = {}) =>
  fakeJwt({
    iss: "https://accounts.google.com",
    email: "asha@example.org",
    email_verified: true,
    name: "Asha Rao",
    given_name: "Asha",
    picture: null,
    ...over,
  });

export const PROFILE = {
  id: 7,
  full_name: "Asha Rao",
  email: "asha@example.org",
  phone: "98765 43210",
  username: "asha",
  user_type: "app_user",
  provider: "google",
  profile: { full_name: "Asha Rao", whatsapp: null, avatar: null, profile_pic: null, org: null },
};

export function enableSignIn() {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", TEST_CLIENT_ID);
}

/** Signs in as if on an earlier visit: the session is in storage before the page reads it. */
export function signInAs({ access = accessToken(), refresh = "refresh-1", profile = PROFILE, claims = null } = {}) {
  localStorage.setItem("moa.session", JSON.stringify({ access_token: access, refresh_token: refresh, profile, claims }));
  reloadSessionForTests();
}

/**
 * A stand-in for Google Identity Services. Its button is a plain button that
 * hands `credential` to the callback the site gave initialize(); `credential`
 * may be changed later through the returned object.
 */
export function stubGoogle({ credential = googleCredential() } = {}) {
  const g = { credential, config: null };
  const id = {
    initialize: vi.fn((config) => {
      g.config = config;
    }),
    renderButton: vi.fn((el) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = "Sign in with Google";
      b.addEventListener("click", () => g.config?.callback({ credential: g.credential, select_by: "btn" }));
      el.appendChild(b);
    }),
    prompt: vi.fn(),
    cancel: vi.fn(),
    disableAutoSelect: vi.fn(),
  };
  window.google = { accounts: { id } };
  g.id = id;
  return g;
}

/** Back to a fresh page with sign-in switched off (other stubbed variables are left alone). */
export function resetAuth() {
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
  localStorage.clear();
  sessionStorage.clear();
  reloadSessionForTests();
  delete window.google;
  resetGoogleForTests();
  document.head.querySelectorAll('script[src*="accounts.google.com"]').forEach((s) => s.remove());
}
