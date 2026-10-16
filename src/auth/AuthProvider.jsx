import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { accountApi } from "@/api/account";
import SignInSheet from "@/components/auth/signinsheet";
import { AuthContext, describeSignInError, userFromSession } from "./context";
import { cancelOneTap, credentialClaims, forgetGoogleChoice, googleEnabled, promptOneTap, setCredentialHandler } from "./google";
import { jwtClaims } from "./jwt";
import { clearSession, forgetGuestTokens, getSession, setSession, subscribe, updateSession } from "./session";

const IDLE = { status: "idle", error: null };

/**
 * Sign in with Google, for the whole site. Holds who is signed in (kept in
 * localStorage by auth/session.js, so it lasts across reloads and tabs), the
 * sign-in sheet, and the one place Google's credentials arrive:
 *
 *   credential → POST /auth/google → the account's tokens → GET /user/profile/me
 *
 * Without VITE_GOOGLE_CLIENT_ID it provides nothing new: nobody is signed in
 * and no page offers it.
 */
export function AuthProvider({ children }) {
  const enabled = googleEnabled();
  const session = useSyncExternalStore(subscribe, getSession, getSession);
  const [sheet, setSheet] = useState({ open: false, reason: null });
  const [attempt, setAttempt] = useState(IDLE);
  const after = useRef(null);
  const profiled = useRef(null);
  const user = useMemo(() => userFromSession(session), [session]);

  // The profile, fresh once per page load: names change, and asking also
  // folds any website guest tickets into the account on the server.
  useEffect(() => {
    if (!enabled || !session) {
      profiled.current = null;
      return;
    }
    if (profiled.current === session.refresh_token) return;
    profiled.current = session.refresh_token;
    accountApi.profile().then(
      (profile) => updateSession({ profile }),
      () => {
        /* signed out by client.js if the session is over; offline keeps what we had */
      },
    );
  }, [enabled, session]);

  const signInWithCredential = useCallback(async (credential) => {
    setAttempt({ status: "busy", error: null });
    try {
      if (!credential) throw Object.assign(new Error("No credential"), { kind: "credential" });
      const tokens = await accountApi.googleSignIn(credential);
      if (!tokens?.access_token || !tokens?.refresh_token) throw Object.assign(new Error("No tokens came back"), { response: { status: 500 } });
      // The guest token's tickets are the account's now; from here on only the account's token goes.
      forgetGuestTokens();
      profiled.current = tokens.refresh_token;
      setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, claims: credentialClaims(credential) });
      try {
        updateSession({ profile: await accountApi.profile() });
      } catch {
        // Google's own name and email stand in until the next page load.
      }
      const signedIn = userFromSession(getSession());
      setAttempt(IDLE);
      setSheet((s) => ({ ...s, open: false }));
      const done = after.current;
      after.current = null;
      done?.(signedIn);
      return signedIn;
    } catch (error) {
      setAttempt({ status: "error", error: describeSignInError(error) });
      // One Tap has nowhere to say what went wrong: the sheet says it, with a way to try again.
      setSheet((s) => (s.open ? s : { open: true, reason: s.reason }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    setCredentialHandler((response) => signInWithCredential(response?.credential));
    return () => setCredentialHandler(null);
  }, [enabled, signInWithCredential]);

  const openSignIn = useCallback(
    ({ reason = null, onDone = null } = {}) => {
      if (!enabled) return;
      cancelOneTap();
      after.current = onDone;
      setAttempt(IDLE);
      setSheet({ open: true, reason });
    },
    [enabled],
  );

  const closeSignIn = useCallback(() => {
    after.current = null;
    setSheet((s) => ({ ...s, open: false }));
    setAttempt((a) => (a.status === "error" ? IDLE : a));
  }, []);

  const failSignIn = useCallback((error) => setAttempt({ status: "error", error: describeSignInError(error) }), []);

  const signOut = useCallback(() => {
    const was = getSession();
    if (!was) return;
    clearSession();
    forgetGoogleChoice();
    cancelOneTap();
    // Ends the session on the server too, so its refresh token is dead everywhere, not just here.
    const sid = jwtClaims(was.access_token)?.sid;
    if (sid) accountApi.endSession(was.access_token, sid).catch(() => {});
  }, []);

  const tryOneTap = useCallback(() => {
    if (!enabled || getSession()) return;
    promptOneTap().catch(() => {
      /* Google's script didn't load: the sheet still works when asked */
    });
  }, [enabled]);

  const value = useMemo(
    () => ({
      enabled,
      status: enabled && session ? "signed-in" : "signed-out",
      user: enabled ? user : null,
      attempt,
      openSignIn,
      closeSignIn,
      signOut,
      tryOneTap,
      signInWithCredential,
    }),
    [enabled, session, user, attempt, openSignIn, closeSignIn, signOut, tryOneTap, signInWithCredential],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {enabled ? <SignInSheet open={sheet.open} reason={sheet.reason} attempt={attempt} onClose={closeSignIn} onFail={failSignIn} /> : null}
    </AuthContext.Provider>
  );
}
