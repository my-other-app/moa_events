"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/auth/context";
import { useCountdown } from "@/auth/countdown";
import { CODE_LENGTH, RESEND_AFTER_S, clock, describeAuthError, emptyCode, waitFrom } from "@/auth/email";
import Icon from "../discover/icons";
import { CodeBoxes, ErrorText, FormNote, Submit } from "./emailfields";

/**
 * "Check your email": the six-digit code that shows a password account owns
 * its address. Right after signing up the server has already mailed one
 * (`justSent`); opened later, from My tickets, it asks for one as it opens.
 * The last digit sends it; a wrong one clears the boxes for another go; a
 * new code can be asked for once the server's wait is over. Never in the
 * way: "Verify later" closes the sheet and the account works as it is.
 */
export function VerifyEmail({ email, justSent = false, onVerified }) {
  const auth = useAuth();
  const labelId = useId();
  const errId = useId();
  const [code, setCode] = useState(emptyCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [problem, setProblem] = useState(null);
  const [note, setNote] = useState(null);
  const [status, setStatus] = useState(justSent ? "sent" : "sending");
  const [sending, setSending] = useState(false);
  const [left, startWait] = useCountdown(justSent ? RESEND_AFTER_S : 0);
  const going = useRef(false);
  const posting = useRef(false);
  const asked = useRef(false);
  const said = useRef(0);
  const boxes = useRef(null);
  const resendBtn = useRef(null);
  const { sendEmailCode, verifyEmail } = auth;

  const tell = (setter, p) => setter(p ? { ...p, n: ++said.current } : null);

  const send = useCallback(
    async ({ again = false } = {}) => {
      if (posting.current) return;
      posting.current = true;
      setSending(true);
      setProblem(null);
      setNote(null);
      try {
        const sent = await sendEmailCode();
        startWait(waitFrom(sent));
        setStatus("sent");
        if (again) {
          setCode(emptyCode());
          setError(null);
          setNote({ message: "We sent a new code. Only the newest one works.", n: ++said.current });
          boxes.current?.focus();
        }
      } catch (err) {
        const p = describeAuthError(err, "send");
        if (p.kind === "already") return onVerified({ already: true });
        if (p.kind === "wait") {
          // A code went out a moment ago (or too many today): the last one still works.
          startWait(waitFrom(p));
          setStatus("sent");
          setNote({ message: p.message, n: ++said.current });
        } else {
          setStatus((s) => (s === "sending" ? "failed" : s));
          setProblem({ ...p, n: ++said.current });
        }
      } finally {
        posting.current = false;
        setSending(false);
      }
    },
    [sendEmailCode, startWait, onVerified],
  );

  useEffect(() => {
    boxes.current?.focus();
  }, []);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (!justSent) send();
  }, [justSent, send]);

  const submit = async (value) => {
    if (going.current) return;
    if (value.length !== CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits.`);
      boxes.current?.focus();
      return;
    }
    going.current = true;
    setBusy(true);
    setError(null);
    setProblem(null);
    try {
      const result = await verifyEmail(value);
      onVerified(result || {});
    } catch (err) {
      const p = describeAuthError(err, "verify");
      if (p.kind === "already") return onVerified({ already: true });
      setCode(emptyCode());
      if (p.kind === "code") {
        setError(p.message);
        // Out of tries, or too old: the way on is a new code.
        if (p.code !== "CODE_INVALID" && resendBtn.current) resendBtn.current.focus();
        else boxes.current?.focus();
      } else {
        tell(setProblem, p);
        boxes.current?.focus();
      }
    } finally {
      going.current = false;
      setBusy(false);
    }
  };

  const lede =
    status === "sending" ? (
      <>
        Sending a 6‑digit code to <strong>{email}</strong>…
      </>
    ) : status === "failed" ? (
      <>
        We&rsquo;ll send a 6‑digit code to <strong>{email}</strong>.
      </>
    ) : (
      <>
        Enter the 6‑digit code we sent to <strong>{email}</strong>.
      </>
    );

  return (
    <form
      className="ac-email ac-verify-form"
      noValidate
      aria-label="Verify your email"
      onSubmit={(e) => {
        e.preventDefault();
        submit(code.join(""));
      }}
    >
      <p className="ac-lede" role="status">
        {lede} Verifying brings in any tickets you booked here as a guest.
      </p>
      <div className={`ac-field${error ? " is-invalid" : ""}`}>
        <p className="dc-sr" id={labelId}>
          The code from the email
        </p>
        <CodeBoxes
          ref={boxes}
          value={code}
          onChange={(next) => {
            setCode(next);
            setError(null);
          }}
          onComplete={submit}
          labelledBy={labelId}
          error={error}
          errorId={errId}
          disabled={busy}
          autoFocus
        />
        <ErrorText id={errId} error={error} />
      </div>
      {note ? <FormNote problem={note} calm /> : null}
      <FormNote problem={problem} />
      <Submit busy={busy} busyLabel="Checking…">
        Verify
      </Submit>
      <p className="ac-switch">
        Didn&rsquo;t get it? Check spam, or{" "}
        {left > 0 ? (
          <span className="ac-wait">send another in {clock(left)}</span>
        ) : (
          <button ref={resendBtn} type="button" className="ac-linkbtn" onClick={() => send({ again: true })} aria-busy={sending || undefined}>
            {sending ? "sending…" : "send another code"}
          </button>
        )}
      </p>
    </form>
  );
}

/** The address is verified: what came with it, and the way on. */
export function Verified({ result, onDone }) {
  const action = useRef(null);
  useEffect(() => {
    action.current?.focus();
  }, []);
  const moved = Math.max(0, Number(result?.registrations_transferred) || 0);
  const text = result?.already
    ? "Your email was already verified. You're all set."
    : moved > 0
      ? `We brought in ${moved === 1 ? "1 ticket" : `${moved} tickets`} you booked here as a guest.`
      : "You're all set. Tickets you book here with this email now land in your account.";
  return (
    <div className="ac-email ac-done">
      <p className="ac-lede" role="status">
        {text}
      </p>
      {moved > 0 ? (
        <Link ref={action} className="dc-btn dc-btn--block" href="/me/tickets" onClick={onDone} data-autofocus="">
          See my tickets
        </Link>
      ) : (
        <button ref={action} type="button" className="dc-btn dc-btn--block" onClick={onDone} data-autofocus="">
          Done
        </button>
      )}
    </div>
  );
}

/**
 * On My tickets, for a password account whose address isn't verified yet: a
 * quiet line, never a wall. Verifying opens the sheet at "check your email".
 */
export function VerifyBanner() {
  const auth = useAuth();
  if (!auth.enabled || auth.status !== "signed-in" || auth.user?.emailVerified !== false) return null;
  return (
    <div className="ac-verify">
      <Icon name="mail" size={18} />
      <p>
        Verify your email to bring in tickets you booked here as a guest.{" "}
        <button type="button" className="ac-linkbtn" onClick={() => auth.openVerify()}>
          Verify email
        </button>
      </p>
    </div>
  );
}
