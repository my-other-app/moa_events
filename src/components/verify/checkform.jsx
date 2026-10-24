"use client";

import { useId, useState } from "react";
import { useNavigate } from "@/lib/router";
import { EXAMPLE_NUMBER, MAX_INPUT, certificateNumberFrom, verifyPath } from "@/utils/certcode";

export const NOT_A_NUMBER = `That isn't a certificate number. It looks like ${EXAMPLE_NUMBER}: CERT, then two groups of five letters and digits.`;

/**
 * "Check a certificate": one box for the number, the QR's text or a link.
 *
 * A plain GET form to /verify?code=…, so it works without JavaScript: the
 * server reads the code and sends the visitor on to /verify/{number}. With
 * JavaScript the code is read and held to the pattern here first, and a
 * mistake is said at once, without a round trip. Nothing that cannot be a
 * number is ever looked up.
 */
export function CheckForm({ initial = "", error = null, label = "Certificate number, QR text or link" }) {
  const id = useId();
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  const [problem, setProblem] = useState(error);
  const noteId = `${id}-note`;

  const onSubmit = (e) => {
    e.preventDefault();
    const number = certificateNumberFrom(value);
    if (!number) {
      setProblem(value.trim() ? NOT_A_NUMBER : "Type the certificate's number first.");
      return;
    }
    setProblem(null);
    navigate(verifyPath(number));
  };

  return (
    <form className="vf-form" action="/verify" method="get" role="search" aria-label="Check a certificate" onSubmit={onSubmit}>
      <label className="vf-label" htmlFor={`${id}-code`}>
        {label}
      </label>
      <div className="vf-field">
        <input
          id={`${id}-code`}
          name="code"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (problem) setProblem(null);
          }}
          placeholder={EXAMPLE_NUMBER}
          maxLength={MAX_INPUT}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          required
          aria-invalid={problem ? "true" : undefined}
          aria-describedby={noteId}
        />
        <button className="dc-btn" type="submit">
          Check
        </button>
      </div>
      {problem ? (
        <p id={noteId} className="vf-note vf-note--error" role="alert">
          {problem}
        </p>
      ) : (
        <p id={noteId} className="vf-note">
          By the certificate&rsquo;s number, its QR code or its link only &mdash; never by a name or an email.
        </p>
      )}
    </form>
  );
}
