"use client";

import { useId, useRef, useState } from "react";
import Icon from "@/components/discover/icons";
import { API_BASE_URL } from "@/config";
import { sha256Hex } from "@/utils/certcode";

/** A certificate is a few hundred kilobytes; anything past this is not one. */
export const MAX_FILE = 25 * 1024 * 1024;
const HEX64 = /^[0-9a-f]{64}$/;

const SAYS = {
  match: { tone: "valid", icon: "check", title: "This file is exactly the one we issued.", text: "Byte for byte the file MyOtherApp issued for this certificate." },
  differs: {
    tone: "notfound",
    icon: "close",
    title: "This file differs from the one we issued.",
    text: "It may have been edited. Re-saving, compressing or printing a PDF again also changes it, so go by the facts and the picture above, not by the file.",
  },
  unavailable: { tone: "muted", icon: "fileText", title: "File check isn't available for this certificate.", text: "We have no copy of its file on record to compare with. The facts above still stand." },
  limited: { tone: "muted", icon: "alert", title: "Too many checks from here.", text: "Wait a minute, then try the file again." },
  error: { tone: "muted", icon: "alert", title: "The file couldn't be checked just now.", text: "Try again in a minute. The facts above still stand." },
  too_big: { tone: "muted", icon: "fileText", title: "That file is too big to be a certificate.", text: "Choose the PDF the certificate came as." },
};

/**
 * "Check a file": the visitor picks or drops the PDF they were given; the
 * browser works out its SHA-256 and compares it with the digests of the
 * copies MyOtherApp handed out (GET /verify/certificates/{number}/files,
 * asked straight from the browser, so it is counted against the visitor's
 * own address). The file itself never leaves the browser.
 */
export function FileCheck({ number, apiBase = API_BASE_URL, fetchImpl, digest = sha256Hex }) {
  const id = useId();
  const known = useRef(null);
  const [over, setOver] = useState(false);
  const [state, setState] = useState({ kind: "idle" });

  async function digests() {
    if (known.current) return known.current;
    const ask = fetchImpl || globalThis.fetch;
    const res = await ask(`${apiBase}/api/v1/verify/certificates/${encodeURIComponent(number)}/files`, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (res.status === 429) throw Object.assign(new Error("limited"), { limited: true });
    if (!res.ok) throw new Error(`files ${res.status}`);
    const body = await res.json();
    const list = Array.isArray(body?.sha256) ? body.sha256.filter((h) => typeof h === "string" && HEX64.test(h)) : [];
    known.current = { available: body?.available === true && list.length > 0, list };
    return known.current;
  }

  async function check(file) {
    if (!file) return;
    if (file.size > MAX_FILE) {
      setState({ kind: "too_big", name: file.name });
      return;
    }
    setState({ kind: "working", name: file.name });
    try {
      const [mine, on] = await Promise.all([digest(file), digests()]);
      if (!on.available) setState({ kind: "unavailable", name: file.name });
      else setState({ kind: on.list.includes(mine) ? "match" : "differs", name: file.name });
    } catch (e) {
      setState({ kind: e?.limited ? "limited" : "error", name: file.name });
    }
  }

  const said = SAYS[state.kind];
  return (
    <section className="vf-filecheck" aria-labelledby={`${id}-title`}>
      <div className="vf-filecheck-head">
        <span className="vf-filecheck-icon" aria-hidden="true">
          <Icon name="fileText" size={20} />
        </span>
        <div>
          <h2 id={`${id}-title`}>Check a file</h2>
          <p>Have the PDF this certificate came as? See whether it is exactly the file we issued. It is checked in your browser and never uploaded.</p>
        </div>
      </div>
      <label
        className={`vf-drop${over ? " is-over" : ""}`}
        htmlFor={`${id}-file`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          check(e.dataTransfer?.files?.[0]);
        }}
      >
        <Icon name="upload" size={20} />
        <span>
          <strong>Choose a file</strong> or drop it here
        </span>
        <small>PDF or PNG</small>
        <input
          id={`${id}-file`}
          className="dc-sr"
          type="file"
          accept="application/pdf,image/png,.pdf,.png"
          onChange={(e) => {
            check(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <div className="vf-filecheck-out" aria-live="polite">
        {state.kind === "working" ? (
          <p className="vf-filecheck-working">Checking {state.name}&hellip;</p>
        ) : said ? (
          <div className={`vf-filecheck-said vf-tone--${said.tone}`}>
            <Icon name={said.icon} size={18} />
            <div>
              <p className="vf-filecheck-title">{said.title}</p>
              <p>
                {state.name ? <span className="vf-filecheck-name">{state.name}. </span> : null}
                {said.text}
              </p>
            </div>
          </div>
        ) : null}
      </div>
      <noscript>
        <p className="vf-note">Checking a file needs JavaScript. The result above doesn&rsquo;t.</p>
      </noscript>
    </section>
  );
}
