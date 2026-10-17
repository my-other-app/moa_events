import { useEffect, useId, useRef, useState } from "react";
import { describeSignInError } from "@/auth/context";
import { renderGoogleButton } from "@/auth/google";
import { Dialog } from "../discover/bits";
import Icon from "../discover/icons";
import logoIcon from "@/assets/logo-icon.png";
// After discover.css, so these rules win over its resets and components.
import "@/styles/discover.css";
import "@/styles/account.css";

const TITLES = {
  tickets: "Sign in to see your tickets",
  follow: "Sign in to follow",
  like: "Sign in to like posts",
  vote: "Sign in to vote",
  register: "Sign in to register",
};

/** How long after Google's window closes a sign-in still counts as on its way. */
const CLOSED_GRACE_MS = 1800;

/**
 * The sign-in sheet: why to sign in, Google's own button, and what went
 * wrong if something did — the window closed early, no connection, or the
 * server's own words. Google's script loads when the sheet first opens.
 */
export default function SignInSheet({ open, reason, attempt, onClose, onFail }) {
  const titleId = useId();
  const slot = useRef(null);
  const [gsi, setGsi] = useState("loading");
  const [tries, setTries] = useState(0);
  const busy = attempt.status === "busy";
  const live = useRef(attempt);
  useEffect(() => {
    live.current = attempt;
  });

  useEffect(() => {
    if (!open) return undefined;
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
  }, [open, tries]);

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

  const problem = attempt.status === "error" ? attempt.error : gsi === "error" ? describeSignInError({ kind: "load" }) : null;
  const calm = problem?.kind === "closed";

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} className="dc-modal ac-sheet" backdropClassName="dc-modal-backdrop ac-sheet-backdrop">
      <button type="button" className="dc-iconbtn" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
      <img className="dc-modal-mark" src={logoIcon} alt="" width="56" height="56" />
      <h2 id={titleId}>{TITLES[reason] || "Sign in"}</h2>
      <p className="ac-sheet-why">Your tickets in one place, on the web and in the app.</p>

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

      <p className="ac-sheet-fine">Use the Google account you use in the MyOtherApp app. New here? Signing in makes your account — it&rsquo;s free.</p>
      <button type="button" className="dc-modal-later" onClick={onClose}>
        Not now
      </button>
    </Dialog>
  );
}
