"use client";

import { useId, useRef, useState } from "react";
import { QuestIcon } from "./icons";

/**
 * "Enter a code": the secret codes shown on stage, on slides or around the
 * venue. `onSubmit(code)` resolves to `{tone, line}` -- "good" (a task done),
 * "bad" (not a code, or not now) -- which is said under the field and read
 * out (role=status). The code is sent as typed: the server ignores case and
 * spaces. While `lockedLine` is set (too many wrong tries for now), the
 * field stays but can't be sent, and says why.
 */
export function CodeEntry({ onSubmit, lockedLine = null, disabled = false, hint = null }) {
  const id = useId();
  const field = useRef(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);
  const locked = Boolean(lockedLine);
  const off = disabled || locked;
  const line = locked ? { tone: "bad", line: lockedLine } : said;

  const send = async (e) => {
    e.preventDefault();
    if (busy || off) return;
    const typed = code.trim();
    if (!typed) {
      setSaid({ tone: "bad", line: "Type the code first." });
      field.current?.focus();
      return;
    }
    setBusy(true);
    setSaid(null);
    try {
      const r = await onSubmit(typed);
      setSaid(r && r.line ? r : null);
      if (r?.tone === "good") setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="qs-code" onSubmit={send} noValidate>
      <label className="qs-code-label" htmlFor={`${id}-code`}>
        <QuestIcon name="key" size={16} />
        Enter a code
      </label>
      {/* The card's word (tries left, every code in) until this box has said something of its own. */}
      {hint && !line ? (
        <p className="qs-code-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <div className="qs-code-row">
        <input
          ref={field}
          id={`${id}-code`}
          className="qs-code-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={off}
          aria-invalid={line?.tone === "bad" ? true : undefined}
          aria-describedby={[hint && !line ? `${id}-hint` : null, `${id}-said`].filter(Boolean).join(" ")}
        />
        <button type="submit" className="dc-btn dc-btn--sm qs-code-go" disabled={off || busy}>
          {busy ? "Checking…" : "Check"}
        </button>
      </div>
      <p id={`${id}-said`} className={`qs-code-said${line ? ` is-${line.tone}` : ""}`} role="status" aria-live="polite">
        {line ? line.line : ""}
      </p>
    </form>
  );
}
