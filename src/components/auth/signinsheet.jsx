import { useCallback, useEffect, useId, useRef, useState } from "react";
import { describeSignInError, useAuth } from "@/auth/context";
import { markPasswordResetMissing, passwordResetOffered } from "@/auth/email";
import { renderGoogleButton } from "@/auth/google";
import { Dialog } from "../discover/bits";
import Icon from "../discover/icons";
import { ForgotForm, ResetForm, SignInForm, SignUpForm, TotpForm } from "./emailforms";
import { Verified, VerifyEmail } from "./verifyemail";
import logoIcon from "@/assets/logo-icon.png";
import { assetSrc } from "@/utils/asset";

const TITLES = {
  tickets: "Sign in to see your tickets",
  follow: "Sign in to follow",
  like: "Sign in to like posts",
  vote: "Sign in to vote",
  register: "Sign in to register",
};

/** How long after Google's window closes a sign-in still counts as on its way. */
const CLOSED_GRACE_MS = 1800;

/** The views with Google's button over them; the rest are one task each, with a way back. */
const WITH_GOOGLE = new Set(["start", "signin", "signup"]);
const BACK_TO = { totp: "signin", forgot: "signin", reset: "forgot" };

/**
 * The sign-in sheet. Google first: its own button, and what went wrong if
 * something did (the window closed early, no connection, the server's own
 * words). Under it, "or" and "Continue with email", which opens the email
 * form in place:
 *
 *   start → signin ⇄ signup → verify → verified
 *             ↓  ↘ totp (an account with a second factor)
 *           forgot → reset (signs in)
 *
 * `start` is where it opens: "start", "signin" (the email form showing,
 * with `email` in it) or "verify" (a signed-in account checking its
 * address, from My tickets).
 * Google's script loads when a view with its button first shows.
 */
export default function SignInSheet({ open, reason, start = "start", email: typed = "", attempt, onClose, onFail }) {
  const auth = useAuth();
  const titleId = useId();
  const slot = useRef(null);
  const [view, setView] = useState(start);
  const [draft, setDraft] = useState({ name: "", email: typed, password: "" });
  const [prompt, setPrompt] = useState(null);
  const [notice, setNotice] = useState(null);
  const [resetOffered, setResetOffered] = useState(passwordResetOffered);
  const [resetWait, setResetWait] = useState(0);
  const [verified, setVerified] = useState(null);
  const [justSent, setJustSent] = useState(false);
  const [gsi, setGsi] = useState("loading");
  const [tries, setTries] = useState(0);
  const withGoogle = WITH_GOOGLE.has(view);
  const wantsGoogle = start !== "verify";
  const busy = attempt.status === "busy";
  const live = useRef(attempt);
  useEffect(() => {
    live.current = attempt;
  });

  useEffect(() => {
    if (!open || !wantsGoogle) return undefined;
    let alive = true;
    setGsi("loading");
    const width = Math.min(320, slot.current?.parentElement?.clientWidth || 320);
    renderGoogleButton(slot.current, { width }).then(
      () => alive && setGsi("ready"),
      () => alive && setGsi("error"),
    );
    return () => {
      alive = false;
    };
  }, [open, tries, wantsGoogle]);

  // Google says nothing when its window is closed before a sign-in. Clicking
  // its button moves focus into its frame and out of this page; when the page
  // gets focus back with no sign-in on its way, the window was closed.
  useEffect(() => {
    if (!open || gsi !== "ready") return undefined;
    let armed = false;
    let timer = null;
    const onBlur = () => {
      const el = document.activeElement;
      if (el && el.tagName === "IFRAME" && slot.current?.contains(el)) armed = true;
    };
    const onFocus = () => {
      if (!armed) return;
      armed = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (live.current.status === "idle") onFail({ kind: "closed" });
      }, CLOSED_GRACE_MS);
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [open, gsi, onFail]);

  // The email goes along from view to view; a password only to the second
  // factor and back. A new password starts empty, so the browser can offer one.
  const go = (next) => {
    setNotice(null);
    if (next !== "totp" && view !== "totp") setDraft((d) => (d.password ? { ...d, password: "" } : d));
    setView(next);
  };

  // The reset endpoints aren't on this server: stop offering them and say what to do instead.
  const noReset = useCallback((p) => {
    markPasswordResetMissing();
    setResetOffered(false);
    setNotice({ message: p.message, n: Date.now() });
    setView("signin");
  }, []);

  const onVerified = useCallback((result) => {
    setVerified(result);
    setView("verified");
  }, []);

  const problem = withGoogle ? (attempt.status === "error" ? attempt.error : gsi === "error" ? describeSignInError({ kind: "load" }) : null) : null;
  const calm = problem?.kind === "closed";
  const email = auth.user?.email || draft.email.trim();

  const titles = {
    signup: "Create your account",
    totp: "Two-step verification",
    forgot: "Reset your password",
    reset: "Choose a new password",
    verify: "Check your email",
    verified: "Email verified",
  };
  const title = titles[view] || TITLES[reason] || "Sign in";

  let why = null;
  if (view === "start" || view === "signin") why = "Your tickets in one place, on the web and in the app.";
  else if (view === "signup") why = "One account for the website and the MyOtherApp app. It’s free.";
  else if (view === "totp") why = prompt || "Enter the code from your authenticator app.";
  else if (view === "forgot") why = "Enter your account’s email and we’ll send you a 6‑digit code to set a new password.";
  else if (view === "reset")
    why = (
      <>
        If <strong>{draft.email.trim()}</strong> has an account, a 6‑digit code is on its way. It works for 15 minutes.
      </>
    );

  let body = null;
  if (view === "start") {
    body = (
      <button type="button" className="dc-btn dc-btn--ghost ac-emailbtn" onClick={() => go("signin")}>
        <Icon name="mail" size={18} />
        Continue with email
      </button>
    );
  } else if (view === "signin") {
    body = (
      <SignInForm
        draft={draft}
        setDraft={setDraft}
        resetOffered={resetOffered}
        notice={notice}
        onForgot={() => go("forgot")}
        onSignUp={() => go("signup")}
        onTotp={(message) => {
          setPrompt(message);
          go("totp");
        }}
      />
    );
  } else if (view === "signup") {
    body = (
      <SignUpForm
        draft={draft}
        setDraft={setDraft}
        onSignIn={() => go("signin")}
        onSignedUp={() => {
          setJustSent(true);
          go("verify");
        }}
      />
    );
  } else if (view === "totp") {
    body = <TotpForm draft={draft} />;
  } else if (view === "forgot") {
    body = (
      <ForgotForm
        draft={draft}
        setDraft={setDraft}
        onUnavailable={noReset}
        onSent={(wait) => {
          setResetWait(wait);
          go("reset");
        }}
      />
    );
  } else if (view === "reset") {
    body = <ResetForm email={draft.email.trim()} wait={resetWait} onUnavailable={noReset} />;
  } else if (view === "verify") {
    body = <VerifyEmail email={email} justSent={justSent} onVerified={onVerified} />;
  } else if (view === "verified") {
    body = <Verified result={verified} onDone={onClose} />;
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} className={`dc-modal ac-sheet ac-sheet--${view}`} backdropClassName="dc-modal-backdrop ac-sheet-backdrop">
      {BACK_TO[view] ? (
        <button type="button" className="dc-iconbtn ac-back" aria-label="Back" onClick={() => go(BACK_TO[view])}>
          <Icon name="arrowLeft" size={20} />
        </button>
      ) : null}
      <button type="button" className="dc-iconbtn" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
      {view === "verify" || view === "verified" ? (
        <span className="ac-sheet-icon" aria-hidden="true">
          <Icon name={view === "verified" ? "check" : "mail"} size={26} />
        </span>
      ) : (
        <img className="dc-modal-mark" src={assetSrc(logoIcon)} alt="" width="56" height="56" />
      )}
      <h2 id={titleId}>{title}</h2>
      {why ? <p className="ac-sheet-why">{why}</p> : null}

      {wantsGoogle ? (
        <div className="ac-google" hidden={!withGoogle}>
          <div className={`ac-gbtn${busy ? " is-busy" : ""}`} aria-busy={busy || gsi === "loading"}>
            <div ref={slot} className="ac-gbtn-slot" />
            {gsi === "loading" && !busy ? (
              <span className="ac-gbtn-skel" role="status">
                <span className="dc-sr">Loading Google sign-in…</span>
              </span>
            ) : null}
            {busy ? (
              <p className="ac-gbtn-busy" role="status">
                <span className="ac-spin" aria-hidden="true" />
                Signing you in…
              </p>
            ) : null}
          </div>

          {problem ? (
            <div className={`ac-note${calm ? " ac-note--calm" : ""}`} role="alert">
              <p>{problem.message}</p>
              {gsi === "error" ? (
                <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm" onClick={() => setTries((t) => t + 1)}>
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          <span className="dc-modal-or ac-or">or</span>
        </div>
      ) : null}

      {body}

      {view === "start" ? (
        <p className="ac-sheet-fine">Use the Google account or email you use in the MyOtherApp app. New here? Either way makes your account — it&rsquo;s free.</p>
      ) : view === "signin" ? (
        <p className="ac-sheet-fine">Use the Google account or email you use in the MyOtherApp app.</p>
      ) : null}
      {view === "verified" ? null : (
        <button type="button" className="dc-modal-later" onClick={onClose}>
          {view === "verify" ? "Verify later" : "Not now"}
        </button>
      )}
    </Dialog>
  );
}
