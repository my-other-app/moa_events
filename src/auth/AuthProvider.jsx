import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { accountApi } from "@/api/account";
import SignInSheet from "@/components/auth/signinsheet";
import { AuthContext, describeSignInError, userFromSession } from "./context";
import { cleanEmail, markPasswordResetMissing } from "./email";
import { cancelOneTap, credentialClaims, forgetGoogleChoice, googleEnabled, promptOneTap, setCredentialHandler } from "./google";
import { jwtClaims } from "./jwt";
import { clearSession, forgetGuestTokens, getSession, setSession, subscribe, updateSession } from "./session";

const IDLE = { status: "idle", error: null };
const noSession = () => null;
const SHUT = { open: false, reason: null, view: "start", email: "", n: 0 };

/** Ends a session on the server too, sent with the token it ends, so its refresh token is dead everywhere. */
function endOnServer(was) {
  const sid = jwtClaims(was?.access_token)?.sid;
  if (sid) accountApi.endSession(was.access_token, sid).catch(() => {});
}

/** The reset endpoints are newer than the rest: a 404 means this server hasn't got them. */
const noteMissingReset = (error) => {
  if (error?.response?.status === 404) markPasswordResetMissing();
  throw error;
};

/**
 * Signing in, for the whole site: with Google, or with the email and
 * password the app's accounts use. Holds who is signed in (kept in
 * localStorage by auth/session.js, so it lasts across reloads and tabs), the
 * sign-in sheet, and the one way tokens become a session, whichever way they
 * came:
 *
 *   Google's credential → POST /auth/google           ┐
 *   email + password    → POST /auth/token            │
 *   a new account       → POST /user/register         ├→ the account's tokens → GET /user/profile/me
 *   a reset code        → POST /auth/password/reset   ┘
 *
 * A password account's address was only typed, so until its owner types back
 * the code mailed to it the server folds nothing booked under it as a guest
 * into the account; the guest token stays put (it is never sent while signed
 * in) until the address is verified.
 *
 * Without NEXT_PUBLIC_GOOGLE_CLIENT_ID it provides nothing new: nobody is signed in
 * and no page offers it.
 */
export function AuthProvider({ children }) {
  const enabled = googleEnabled();
  // The server (and the first render in the browser, which must match it)
  // knows nobody: the session is in localStorage. It shows straight after.
  const session = useSyncExternalStore(subscribe, getSession, noSession);
  const [sheet, setSheet] = useState(SHUT);
  const [attempt, setAttempt] = useState(IDLE);
  const after = useRef(null);
  const welcome = useRef(null);
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

  // What the page wanted done once signed in, run once the page has drawn
  // itself signed in (children's effects run before this one), so a page
  // that resets its state on signing in can't undo it.
  useEffect(() => {
    if (!session || !welcome.current) return;
    const run = welcome.current;
    welcome.current = null;
    run(userFromSession(session));
  }, [session]);

  /**
   * The account's tokens, however they came: the profile first (so the
   * person arrives whole, their own name and all), then the session; what
   * the page wanted done once signed in runs after (above). Resolves the person.
   * `password`: the tokens came from a password, so the address may not be
   * verified yet, and the account may be one this site doesn't sign in.
   */
  const accept = useCallback(async (tokens, { claims = null, password = false } = {}) => {
    if (!tokens?.access_token || !tokens?.refresh_token) throw Object.assign(new Error("No tokens came back"), { response: { status: 500 } });
    let profile = null;
    try {
      profile = await accountApi.profileWith(tokens.access_token);
    } catch (error) {
      if (password && error?.response?.status === 403) {
        // The password was right, but the profile is refused: a club's
        // dashboard login, or a suspended account. Not signed in here.
        endOnServer(tokens);
        throw Object.assign(error, { refusedHere: true });
      }
      // Offline or slow: what the sign-in said stands in, and the profile is asked for again below.
    }
    // Google vouched for the address, and so has a verified password account:
    // the guest's tickets are the account's now, and only its token goes from here on.
    if (!password || profile?.email_verified) forgetGuestTokens();
    profiled.current = profile ? tokens.refresh_token : null;
    welcome.current = after.current;
    after.current = null;
    setSession({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, profile, claims });
    return userFromSession(getSession());
  }, []);

  const shut = useCallback(() => setSheet((s) => ({ ...s, open: false })), []);

  const signInWithCredential = useCallback(
    async (credential) => {
      setAttempt({ status: "busy", error: null });
      try {
        if (!credential) throw Object.assign(new Error("No credential"), { kind: "credential" });
        const tokens = await accountApi.googleSignIn(credential);
        const signedIn = await accept(tokens, { claims: credentialClaims(credential) });
        setAttempt(IDLE);
        shut();
        return signedIn;
      } catch (error) {
        setAttempt({ status: "error", error: describeSignInError(error) });
        // One Tap has nowhere to say what went wrong: the sheet says it, with a way to try again.
        setSheet((s) => (s.open ? s : { ...s, open: true, view: "start", n: s.n + 1 }));
        return null;
      }
    },
    [accept, shut],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    setCredentialHandler((response) => signInWithCredential(response?.credential));
    return () => setCredentialHandler(null);
  }, [enabled, signInWithCredential]);

  /* ---------- email and password ---------- */

  const passwordSignIn = useCallback(
    async ({ email, password, totpCode = null }) => {
      const address = cleanEmail(email);
      const tokens = await accountApi.passwordSignIn({ email: address, password, totpCode });
      const signedIn = await accept(tokens, { claims: { email: address }, password: true });
      shut();
      return signedIn;
    },
    [accept, shut],
  );

  /** Makes the account and signs in; the sheet stays open for the code the server just mailed. */
  const signUp = useCallback(
    async ({ name, email, password }) => {
      const address = cleanEmail(email);
      const full = String(name || "").trim();
      const tokens = await accountApi.signUp({ name: full, email: address, password });
      return accept(tokens, { claims: { email: address, name: full }, password: true });
    },
    [accept],
  );

  const forgotPassword = useCallback((email) => accountApi.forgotPassword(cleanEmail(email)).catch(noteMissingReset), []);

  const resetPassword = useCallback(
    async ({ email, code, password }) => {
      const address = cleanEmail(email);
      const tokens = await accountApi.resetPassword({ email: address, code, password }).catch(noteMissingReset);
      const signedIn = await accept(tokens, { claims: { email: address }, password: true });
      shut();
      return signedIn;
    },
    [accept, shut],
  );

  /** The address is the account's now: say so at once, and fetch the rest. */
  const markVerified = useCallback(() => {
    const now = getSession();
    if (!now) return;
    updateSession({ profile: { ...(now.profile || {}), email_verified: true } });
    accountApi.profile().then(
      (profile) => updateSession({ profile }),
      () => {},
    );
  }, []);

  const alreadyVerified = useCallback(
    (error) => {
      if (error?.response?.data?.error_code === "ALREADY_VERIFIED") markVerified();
      throw error;
    },
    [markVerified],
  );

  const sendEmailCode = useCallback(() => accountApi.sendEmailCode().catch(alreadyVerified), [alreadyVerified]);

  const verifyEmail = useCallback(
    async (code) => {
      const result = await accountApi.verifyEmail(code).catch(alreadyVerified);
      // What was booked here as a guest is the account's now: the guest token has nothing left to open.
      forgetGuestTokens();
      markVerified();
      return result;
    },
    [alreadyVerified, markVerified],
  );

  /* ---------- the sheet ---------- */

  const openSignIn = useCallback(
    ({ reason = null, onDone = null, view = "start", email = "" } = {}) => {
      if (!enabled) return;
      cancelOneTap();
      after.current = onDone;
      setAttempt(IDLE);
      setSheet((s) => ({ open: true, reason, view: view === "email" ? "signin" : "start", email: cleanEmail(email), n: s.n + 1 }));
    },
    [enabled],
  );

  /** "Check your email", for a signed-in account whose address isn't verified yet. */
  const openVerify = useCallback(() => {
    if (!enabled || !getSession()) return;
    cancelOneTap();
    after.current = null;
    setSheet((s) => ({ open: true, reason: null, view: "verify", email: "", n: s.n + 1 }));
  }, [enabled]);

  const closeSignIn = useCallback(() => {
    after.current = null;
    shut();
    setAttempt((a) => (a.status === "error" ? IDLE : a));
  }, [shut]);

  const failSignIn = useCallback((error) => setAttempt({ status: "error", error: describeSignInError(error) }), []);

  const signOut = useCallback(() => {
    const was = getSession();
    if (!was) return;
    clearSession();
    forgetGoogleChoice();
    cancelOneTap();
    endOnServer(was);
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
      openVerify,
      closeSignIn,
      signOut,
      tryOneTap,
      signInWithCredential,
      passwordSignIn,
      signUp,
      forgotPassword,
      resetPassword,
      sendEmailCode,
      verifyEmail,
    }),
    [
      enabled,
      session,
      user,
      attempt,
      openSignIn,
      openVerify,
      closeSignIn,
      signOut,
      tryOneTap,
      signInWithCredential,
      passwordSignIn,
      signUp,
      forgotPassword,
      resetPassword,
      sendEmailCode,
      verifyEmail,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {enabled ? (
        <SignInSheet
          key={sheet.n}
          open={sheet.open}
          reason={sheet.reason}
          start={sheet.view}
          email={sheet.email}
          attempt={attempt}
          onClose={closeSignIn}
          onFail={failSignIn}
        />
      ) : null}
    </AuthContext.Provider>
  );
}
