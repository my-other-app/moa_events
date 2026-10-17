import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/auth/context";
import { useCountdown } from "@/auth/countdown";
import { CODE_LENGTH, clock, describeAuthError, emptyCode, looksLikeEmail, passwordOk, refusedHere, waitFrom } from "@/auth/email";
import { CLUBS_URL } from "@/config";
import { CodeBoxes, ErrorText, Field, FormNote, PasswordField, Submit } from "./emailfields";

/**
 * The sheet's email forms. Each sends once at a time (a second tap while one
 * is on its way does nothing), shows the server's refusal beside the field it
 * is about or above the button, and puts focus where the person has to act.
 *
 *   SignInForm   email + password; a second factor goes on to TotpForm
 *   TotpForm     the authenticator's code, sent with the same email and password
 *   SignUpForm   name, email, password with its rules; then the sheet asks for the mailed code
 *   ForgotForm   the email a reset code goes to
 *   ResetForm    that code and a new password; signs in
 */

/** One request at a time, whatever the taps. */
function useOnce() {
  const [busy, setBusy] = useState(false);
  const going = useRef(false);
  const run = useCallback(async (fn) => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      going.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}

/** A form-wide problem, numbered so the same words are said again on the next try. */
function useProblem() {
  const [problem, setProblem] = useState(null);
  const n = useRef(0);
  const say = useCallback((p) => setProblem(p ? { ...p, n: ++n.current } : null), []);
  return [problem, say];
}

const focusSoon = (el) => {
  if (!el) return;
  el.focus();
  el.select?.();
};

/** The clubs dashboard, for a club's login typed here. */
function ClubLink() {
  return (
    <a className="ac-linkbtn" href={CLUBS_URL} target="_blank" rel="noopener noreferrer">
      Open the clubs dashboard
    </a>
  );
}

/* ---------- sign in ---------- */

export function SignInForm({ draft, setDraft, resetOffered, notice, onForgot, onSignUp, onTotp }) {
  const auth = useAuth();
  const [busy, run] = useOnce();
  const [problem, say] = useProblem();
  const [errors, setErrors] = useState({});
  const email = useRef(null);
  const password = useRef(null);

  useEffect(() => {
    (draft.email ? password : email).current?.focus();
    // Only as the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (v) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
  };

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const found = {};
      if (!draft.email.trim()) found.email = "Enter your email.";
      else if (!looksLikeEmail(draft.email)) found.email = "Enter a valid email address, like name@example.com.";
      if (!draft.password) found.password = "Enter your password.";
      setErrors(found);
      if (found.email || found.password) {
        say(null);
        focusSoon(found.email ? email.current : password.current);
        return;
      }
      say(null);
      try {
        await auth.passwordSignIn({ email: draft.email, password: draft.password });
      } catch (error) {
        const p = error?.refusedHere ? refusedHere(error?.response?.data?.message) : describeAuthError(error, "signin");
        if (p.kind === "totp") return onTotp(p.message);
        if (p.kind === "fields") {
          setErrors(p.fields);
          focusSoon(p.fields.email ? email.current : password.current);
          return;
        }
        say(p);
      }
    });
  };

  return (
    <form className="ac-email" noValidate onSubmit={submit} aria-label="Sign in with email">
      {notice ? <FormNote problem={notice} calm /> : null}
      <Field
        ref={email}
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        enterKeyHint="next"
        maxLength={100}
        data-autofocus={draft.email ? undefined : ""}
        value={draft.email}
        onChange={set("email")}
        error={errors.email}
      />
      <PasswordField
        ref={password}
        name="password"
        autoComplete="current-password"
        enterKeyHint="go"
        data-autofocus={draft.email ? "" : undefined}
        value={draft.password}
        onChange={set("password")}
        error={errors.password}
        extra={
          resetOffered ? (
            <p className="ac-forgot">
              <button type="button" className="ac-linkbtn" onClick={onForgot}>
                Forgot password?
              </button>
            </p>
          ) : null
        }
      />
      <FormNote problem={problem}>{problem?.club ? <ClubLink /> : null}</FormNote>
      <Submit busy={busy} busyLabel="Signing you in…">
        Sign in
      </Submit>
      <p className="ac-switch">
        New here?{" "}
        <button type="button" className="ac-linkbtn" onClick={onSignUp}>
          Create an account
        </button>
      </p>
    </form>
  );
}

/* ---------- the second factor ---------- */

export function TotpForm({ draft }) {
  const auth = useAuth();
  const [busy, run] = useOnce();
  const [problem, say] = useProblem();
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    box.current?.focus();
  }, []);

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const typed = code.trim();
      if (!typed) {
        setError("Enter the code from your authenticator app.");
        focusSoon(box.current);
        return;
      }
      say(null);
      try {
        await auth.passwordSignIn({ email: draft.email, password: draft.password, totpCode: typed });
      } catch (err) {
        const p = err?.refusedHere ? refusedHere(err?.response?.data?.message) : describeAuthError(err, "totp");
        if (p.kind === "fields" && p.fields.totp) {
          setError(p.fields.totp);
          focusSoon(box.current);
          return;
        }
        // The password itself was refused this time (changed meanwhile): say so here.
        if (p.kind === "fields") return say({ kind: "rejected", message: p.message });
        if (p.kind === "totp") {
          setError(p.message);
          focusSoon(box.current);
          return;
        }
        say(p);
      }
    });
  };

  return (
    <form className="ac-email" noValidate onSubmit={submit} aria-label="Two-step verification">
      <Field
        ref={box}
        label="Code"
        name="totp_code"
        type="text"
        autoComplete="one-time-code"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={20}
        placeholder="123456"
        data-autofocus=""
        value={code}
        onChange={(v) => {
          setCode(v);
          setError(null);
        }}
        error={error}
        hint="Lost your phone? Type one of your recovery codes instead."
      />
      <FormNote problem={problem}>{problem?.club ? <ClubLink /> : null}</FormNote>
      <Submit busy={busy} busyLabel="Checking…">
        Sign in
      </Submit>
    </form>
  );
}

/* ---------- create an account ---------- */

export function SignUpForm({ draft, setDraft, onSignedUp, onSignIn }) {
  const auth = useAuth();
  const [busy, run] = useOnce();
  const [problem, say] = useProblem();
  const [errors, setErrors] = useState({});
  const [exists, setExists] = useState(false);
  const refs = { name: useRef(null), email: useRef(null), password: useRef(null) };

  useEffect(() => {
    refs.name.current?.focus();
    // Only as the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key) => (v) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setErrors((e) => (e[key] ? { ...e, [key]: null } : e));
    if (key === "email") setExists(false);
  };

  const first = (found) => ["name", "email", "password"].find((k) => found[k]);

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const found = {};
      if (!draft.name.trim()) found.name = "Enter your name.";
      if (!draft.email.trim()) found.email = "Enter your email.";
      else if (!looksLikeEmail(draft.email)) found.email = "Enter a valid email address, like name@example.com.";
      if (!passwordOk(draft.password)) found.password = draft.password ? "Your password needs at least 6 characters." : "Choose a password.";
      setErrors(found);
      setExists(false);
      say(null);
      if (first(found)) return focusSoon(refs[first(found)].current);
      try {
        await auth.signUp({ name: draft.name, email: draft.email, password: draft.password });
        onSignedUp();
      } catch (error) {
        const p = describeAuthError(error, "signup");
        if (p.kind === "fields" && first(p.fields)) {
          setErrors(p.fields);
          setExists(Boolean(p.exists));
          focusSoon(refs[first(p.fields)].current);
          return;
        }
        say(p);
      }
    });
  };

  return (
    <form className="ac-email" noValidate onSubmit={submit} aria-label="Create an account">
      <Field
        ref={refs.name}
        label="Full name"
        name="name"
        type="text"
        autoComplete="name"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="next"
        maxLength={100}
        data-autofocus=""
        value={draft.name}
        onChange={set("name")}
        error={errors.name}
      />
      <Field
        ref={refs.email}
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        enterKeyHint="next"
        maxLength={100}
        value={draft.email}
        onChange={set("email")}
        error={errors.email}
        hint={errors.email ? null : "We'll send a code here to check it's yours."}
        extra={
          exists ? (
            <p className="ac-fix">
              <button type="button" className="ac-linkbtn" onClick={onSignIn}>
                Sign in instead
              </button>
            </p>
          ) : null
        }
      />
      <PasswordField
        ref={refs.password}
        name="new-password"
        autoComplete="new-password"
        enterKeyHint="go"
        rules
        value={draft.password}
        onChange={set("password")}
        error={errors.password}
      />
      <FormNote problem={problem} />
      <Submit busy={busy} busyLabel="Making your account…">
        Create account
      </Submit>
      <p className="ac-switch">
        Have an account?{" "}
        <button type="button" className="ac-linkbtn" onClick={onSignIn}>
          Sign in
        </button>
      </p>
    </form>
  );
}

/* ---------- forgot, then reset ---------- */

export function ForgotForm({ draft, setDraft, onSent, onUnavailable }) {
  const auth = useAuth();
  const [busy, run] = useOnce();
  const [problem, say] = useProblem();
  const [error, setError] = useState(null);
  const email = useRef(null);

  useEffect(() => {
    // The address carried over from signing in, ready to send or fix (an email box has no caret API to move).
    email.current?.focus();
  }, []);

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      if (!looksLikeEmail(draft.email)) {
        setError(draft.email.trim() ? "Enter a valid email address, like name@example.com." : "Enter your email.");
        say(null);
        return focusSoon(email.current);
      }
      say(null);
      try {
        const sent = await auth.forgotPassword(draft.email);
        onSent(waitFrom(sent));
      } catch (err) {
        const p = describeAuthError(err, "forgot");
        if (p.kind === "unavailable") return onUnavailable(p);
        if (p.kind === "fields" && p.fields.email) {
          setError(p.fields.email);
          return focusSoon(email.current);
        }
        say(p);
      }
    });
  };

  return (
    <form className="ac-email" noValidate onSubmit={submit} aria-label="Reset your password">
      <Field
        ref={email}
        label="Email"
        type="email"
        name="email"
        autoComplete="username"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        enterKeyHint="send"
        maxLength={100}
        data-autofocus=""
        value={draft.email}
        onChange={(v) => {
          setDraft((d) => ({ ...d, email: v }));
          setError(null);
        }}
        error={error}
      />
      <FormNote problem={problem} />
      <Submit busy={busy} busyLabel="Sending…">
        Send code
      </Submit>
    </form>
  );
}

export function ResetForm({ email, wait, onUnavailable }) {
  const auth = useAuth();
  const labelId = useId();
  const codeErrId = useId();
  const [busy, run] = useOnce();
  const [problem, say] = useProblem();
  const [code, setCode] = useState(emptyCode);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [note, setNote] = useState(null);
  const [left, startWait] = useCountdown(wait);
  const [sending, resend] = useOnce();
  const boxes = useRef(null);
  const pw = useRef(null);

  useEffect(() => {
    boxes.current?.focus();
  }, []);

  const submit = (e) => {
    e?.preventDefault();
    run(async () => {
      const found = {};
      if (code.some((d) => !d)) found.code = `Enter the ${CODE_LENGTH}-digit code from the email.`;
      if (!passwordOk(password)) found.password = password ? "Your new password needs at least 6 characters." : "Choose a new password.";
      setErrors(found);
      say(null);
      if (found.code) return boxes.current?.focus();
      if (found.password) return focusSoon(pw.current);
      try {
        await auth.resetPassword({ email, code: code.join(""), password });
      } catch (err) {
        const p = describeAuthError(err, "reset");
        if (p.kind === "unavailable") return onUnavailable(p);
        if (p.kind === "code") {
          setErrors({ code: p.message });
          setCode(emptyCode());
          return boxes.current?.focus();
        }
        if (p.kind === "fields") {
          setErrors(p.fields);
          if (p.fields.code) return boxes.current?.focus();
          if (p.fields.password) return focusSoon(pw.current);
        }
        say(p);
      }
    });
  };

  const again = () =>
    resend(async () => {
      if (left > 0) return;
      setNote(null);
      say(null);
      try {
        const sent = await auth.forgotPassword(email);
        startWait(waitFrom(sent));
        setCode(emptyCode());
        setErrors((e) => ({ ...e, code: null }));
        setNote({ message: `We sent a new code to ${email}. Only the newest one works.`, n: Date.now() });
        boxes.current?.focus();
      } catch (err) {
        const p = describeAuthError(err, "forgot");
        if (p.kind === "unavailable") return onUnavailable(p);
        if (p.kind === "wait") startWait(waitFrom(p));
        say(p);
      }
    });

  return (
    <form className="ac-email" noValidate onSubmit={submit} aria-label="Choose a new password">
      {/* For password managers: whose password this is. */}
      <input className="dc-sr" type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" />
      <div className={`ac-field${errors.code ? " is-invalid" : ""}`}>
        <p className="ac-label" id={labelId}>
          Code from the email
        </p>
        <CodeBoxes
          ref={boxes}
          value={code}
          onChange={(next) => {
            setCode(next);
            setErrors((e) => (e.code ? { ...e, code: null } : e));
          }}
          onComplete={() => focusSoon(pw.current)}
          labelledBy={labelId}
          error={errors.code}
          errorId={codeErrId}
          autoFocus
        />
        <ErrorText id={codeErrId} error={errors.code} />
      </div>
      <PasswordField
        ref={pw}
        label="New password"
        name="new-password"
        autoComplete="new-password"
        enterKeyHint="go"
        rules
        value={password}
        onChange={(v) => {
          setPassword(v);
          setErrors((e) => (e.password ? { ...e, password: null } : e));
        }}
        error={errors.password}
      />
      {note ? <FormNote problem={note} calm /> : null}
      <FormNote problem={problem} />
      <Submit busy={busy} busyLabel="Saving…">
        Reset and sign in
      </Submit>
      <p className="ac-switch">
        Didn&rsquo;t get it?{" "}
        {left > 0 ? (
          <span className="ac-wait">Send another in {clock(left)}</span>
        ) : (
          <button type="button" className="ac-linkbtn" onClick={again} aria-busy={sending || undefined}>
            {sending ? "Sending…" : "Send another code"}
          </button>
        )}
      </p>
    </form>
  );
}
