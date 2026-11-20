"use client";

import { useEffect, useRef, useState } from "react";
import { canShareFile, copyText, downloadBlob, fileFor, shareFile } from "@/utils/sharefile";
import { Spinner } from "../register/finishpayment";

/**
 * The poster page's parts that don't talk to the API: the format picker,
 * the preview, the share / download / copy buttons and the caption.
 */

/** The three formats: name, size, and the shape drawn on its button. */
export const FORMATS = {
  square: { label: "Square", w: 1080, h: 1080, hint: "Feeds" },
  portrait: { label: "Portrait", w: 1080, h: 1350, hint: "Instagram" },
  story: { label: "Story", w: 1080, h: 1920, hint: "Stories, Status" },
};
export const FORMAT_ORDER = ["square", "portrait", "story"];

/** Square / Portrait / Story, as radio buttons: only the ones offered. */
export function FormatPicker({ offered, value, onChange, disabled = false }) {
  const list = FORMAT_ORDER.filter((k) => offered.includes(k));
  if (list.length < 2) return null;
  return (
    <fieldset className="pp-formats" disabled={disabled}>
      <legend className="dc-sr">Format</legend>
      {list.map((k) => {
        const f = FORMATS[k];
        const on = value === k;
        return (
          <label key={k} className={`pp-format${on ? " is-on" : ""}`}>
            <input type="radio" name="poster-format" value={k} checked={on} onChange={() => onChange(k)} />
            <span className="pp-format-shape" style={{ aspectRatio: `${f.w} / ${f.h}` }} aria-hidden="true" />
            <span>{f.label}</span>
            <span className="pp-format-size">{f.hint}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * The poster as the server drew it, in its format's shape.
 *   state   "empty" (nothing asked for yet), "loading", "ready", "failed"
 *   stale   the picture shown is an older one: a newer is being drawn
 */
export function PosterPreview({ format, state, url, stale = false, alt, failure = null, onRetry, waitWords = "Drawing your poster…" }) {
  const f = FORMATS[format] || FORMATS.square;
  const showImg = Boolean(url) && (state === "ready" || stale);
  const loading = state === "loading";
  return (
    <figure
      className={`pp-preview pp-preview--${format}${loading && !showImg ? " is-loading" : ""}${stale && loading ? " is-stale" : ""}`}
      style={{ aspectRatio: `${f.w} / ${f.h}` }}
      aria-busy={loading || undefined}
    >
      {/* A plain <img>: an object URL of a picture read with the guest's token, never Next's optimiser. */}
      {showImg ? <img src={url} alt={alt} /> : null}
      {loading ? (
        <figcaption className="pp-preview-wait" role="status">
          <Spinner />
          {waitWords}
        </figcaption>
      ) : null}
      {state === "failed" && !showImg ? (
        <figcaption className="pp-preview-empty" role="alert">
          <span>{failure || "Your poster couldn’t be drawn just now."}</span>
          {onRetry ? (
            <button type="button" className="dc-btn dc-btn--sm" onClick={onRetry}>
              Try again
            </button>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** A line that says what just happened, then clears, so the next one is announced again. */
function useSaid() {
  const [line, setLine] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (words) => {
    setLine(words);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLine(""), 4000);
  };
  return [line, say];
}

/**
 * Share (the phone's sheet with the PNG and the caption), Download, and
 * Copy caption. Where the browser has no sheet for files, Share isn't
 * offered: Download and Copy caption are. `onDone(kind)` hears "share" and
 * "download" (the organiser's counts).
 */
export function ShareActions({ blob, filename, caption, title, onDone }) {
  const [line, say] = useSaid();
  const file = blob ? fileFor(blob, filename) : null;
  // Asked once the page is in the browser: the server can't know, and the first paint must match it.
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    setSheet(canShareFile(file));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  const download = () => {
    if (!blob) return;
    if (downloadBlob(blob, filename)) {
      say("Saved. Find it in your downloads or photos.");
      onDone?.("download");
    } else say("Your browser wouldn’t save it. Press and hold the poster to save it instead.");
  };

  const share = async () => {
    const how = await shareFile({ file, text: caption || "", title: title || "" });
    if (how === "shared") {
      say("Shared.");
      onDone?.("share");
    } else if (how === "failed" || how === "unsupported") {
      // The sheet refused: the file instead, and the caption to paste.
      download();
    }
  };

  const copy = async () => {
    if (!caption) return;
    say((await copyText(caption)) ? "Caption copied. Paste it with your poster." : "Copy the caption below by hand.");
  };

  return (
    <>
      <div className="pp-actions">
        {sheet ? (
          <button type="button" className="dc-btn pp-share" onClick={share} disabled={!blob}>
            Share
          </button>
        ) : null}
        <button type="button" className={sheet ? "dc-btn dc-btn--ghost" : "dc-btn"} onClick={download} disabled={!blob}>
          Download
        </button>
        {caption ? (
          <button type="button" className="dc-btn dc-btn--ghost" onClick={copy} disabled={!blob}>
            Copy caption
          </button>
        ) : null}
      </div>
      <p className="pp-said" role="status" aria-live="polite">
        {line}
      </p>
    </>
  );
}

/** The words to post with it, as the organisers wrote them, filled in. */
export function CaptionBox({ caption }) {
  if (!caption) return null;
  return (
    <div className="pp-caption">
      <p className="pp-caption-label">Caption</p>
      <p className="pp-caption-text">{caption}</p>
    </div>
  );
}
