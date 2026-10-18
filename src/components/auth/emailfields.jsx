"use client";

import { forwardRef, useId, useImperativeHandle, useRef, useState } from "react";
import { CODE_LENGTH, PASSWORD_RULES, digitsOf } from "@/auth/email";
import Icon from "../discover/icons";

/**
 * The email forms' controls, in the registration form's look: a label over
 * the box, the error under it once there is one (always in the page, so a
 * screen reader hears it arrive), a hint under that. Every control is a real
 * input, so password managers, autofill and the phone's keyboards just work.
 */

const describedBy = (...ids) => ids.filter(Boolean).join(" ") || undefined;

export function ErrorText({ id, error }) {
  return (
    <p id={id} className="ac-ferr" aria-live="polite">
      {error ? (
        <>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <rect x="7.1" y="3.8" width="1.8" height="5.4" rx="0.9" fill="#fff" />
            <circle cx="8" cy="11.6" r="1.05" fill="#fff" />
          </svg>
          <span>{error}</span>
        </>
      ) : null}
    </p>
  );
}

/** A labelled text box. `extra` sits under the error (a way on from it). */
export const Field = forwardRef(function Field({ label, error, hint, extra = null, value, onChange, ...input }, ref) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = hint ? `${id}-hint` : null;
  return (
    <div className={`ac-field${error ? " is-invalid" : ""}`}>
      <label className="ac-label" htmlFor={id}>
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className="ac-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(errId, hintId)}
        {...input}
      />
      <ErrorText id={errId} error={error} />
      {extra}
      {hint ? (
        <p id={hintId} className="ac-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

function Eye({ off }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      {off ? <line x1="3" y1="3" x2="21" y2="21" /> : null}
    </svg>
  );
}

/**
 * A password box with a show/hide toggle. `rules` lists the rules for a new
 * password under it, each ticked off as it is met; `extra` comes after
 * ("Forgot password?"), so the keyboard reaches the box first.
 */
export const PasswordField = forwardRef(function PasswordField({ label = "Password", error, value, onChange, autoComplete, rules = false, extra = null, ...input }, ref) {
  const id = useId();
  const errId = `${id}-err`;
  const rulesId = rules ? `${id}-rules` : null;
  const [shown, setShown] = useState(false);
  const box = useRef(null);
  useImperativeHandle(ref, () => box.current);
  return (
    <div className={`ac-field${error ? " is-invalid" : ""}`}>
      <label className="ac-label" htmlFor={id}>
        {label}
      </label>
      <div className="ac-pw">
        <input
          ref={box}
          id={id}
          className="ac-input"
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(errId, rulesId)}
          {...input}
        />
        <button type="button" className="ac-pw-toggle" aria-label="Show password" aria-pressed={shown} aria-controls={id} onClick={() => setShown((v) => !v)}>
          <Eye off={shown} />
        </button>
      </div>
      <ErrorText id={errId} error={error} />
      {rules ? (
        <ul id={rulesId} className="ac-rules">
          {PASSWORD_RULES.map((r) => {
            const met = r.test(value);
            return (
              <li key={r.id} className={met ? "is-met" : undefined}>
                <span className="ac-rule-mark" aria-hidden="true">
                  {met ? <Icon name="check" size={12} /> : null}
                </span>
                {r.label}
                <span className="dc-sr">{met ? " — done" : " — not yet"}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {extra}
    </div>
  );
});

/**
 * Six boxes for a mailed code. Typing moves along, Backspace moves back, and
 * a pasted (or autofilled) code fills every box at once. `onComplete(code)`
 * runs when the last box is filled by the person, never by a re-render.
 * `ref.focus()` puts the caret in the first empty box.
 */
export const CodeBoxes = forwardRef(function CodeBoxes({ value, onChange, onComplete, labelledBy, error, errorId, disabled = false, autoFocus = false }, ref) {
  const boxes = useRef([]);
  const focusAt = (i) => {
    const el = boxes.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))];
    el?.focus();
    el?.select?.();
  };
  useImperativeHandle(ref, () => ({
    focus: () => focusAt(Math.max(0, value.findIndex((d) => !d))),
  }));

  const commit = (next, focusIndex) => {
    onChange(next);
    if (next.every(Boolean)) {
      boxes.current[CODE_LENGTH - 1]?.focus();
      onComplete?.(next.join(""));
    } else if (focusIndex != null) {
      focusAt(focusIndex);
    }
  };

  const fillFrom = (start, digits) => {
    const from = digits.length >= CODE_LENGTH ? 0 : start;
    const next = [...value];
    digits
      .slice(0, CODE_LENGTH - from)
      .split("")
      .forEach((d, k) => {
        next[from + k] = d;
      });
    commit(next, Math.min(CODE_LENGTH - 1, from + digits.length));
  };

  const onBoxChange = (i, raw) => {
    let d = digitsOf(raw);
    if (!d) {
      const next = [...value];
      next[i] = "";
      onChange(next);
      return;
    }
    // Typed over a box that already had a digit: keep the new one.
    if (d.length === 2 && value[i] && d.includes(value[i])) d = d[0] === value[i] ? d[1] : d[0];
    if (d.length > 1) return fillFrom(i, d);
    const next = [...value];
    next[i] = d;
    commit(next, i + 1);
  };

  const onKeyDown = (i, e) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      e.preventDefault();
      const next = [...value];
      next[i - 1] = "";
      onChange(next);
      focusAt(i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      focusAt(i - 1);
    } else if (e.key === "ArrowRight" && i < CODE_LENGTH - 1) {
      e.preventDefault();
      focusAt(i + 1);
    }
  };

  const onPaste = (i, e) => {
    const d = digitsOf(e.clipboardData?.getData("text"));
    e.preventDefault();
    if (d) fillFrom(i, d.slice(0, CODE_LENGTH));
  };

  return (
    <div className={`ac-code${error ? " is-invalid" : ""}`} role="group" aria-labelledby={labelledBy}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          className={`ac-code-box${digit ? " is-filled" : ""}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error && errorId ? errorId : undefined}
          data-autofocus={autoFocus && i === 0 ? "" : undefined}
          value={digit}
          readOnly={disabled}
          onChange={(e) => onBoxChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
});

/** What went wrong with the whole form (not one field): said once, and again on every new try. */
export function FormNote({ problem, calm = false, children = null }) {
  if (!problem?.message) return null;
  return (
    <div key={problem.n} className={`ac-note ac-fnote${calm ? " ac-note--calm" : ""}`} role={calm ? "status" : "alert"}>
      <p>{problem.message}</p>
      {children}
    </div>
  );
}

/** The form's one action. Stays focusable while busy (aria-disabled), so focus never drops to the page. */
export function Submit({ busy, busyLabel, children }) {
  return (
    <button type="submit" className="dc-btn dc-btn--block ac-submit" aria-disabled={busy || undefined} aria-busy={busy || undefined}>
      {busy ? (
        <>
          <span className="ac-spin ac-spin--light" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
