"use client";

import { useEffect, useId, useRef, useState } from "react";
import { locateBrowser, whereLabel } from "@/utils/where";
import Icon from "./icons";

/**
 * "Near Pune · Change". Change offers the browser's location; if that is
 * refused or fails, the area the server guessed stays. A shared location
 * can be dropped again for the guess. A list about a place (its ?near=)
 * passes `onAnywhere`, to offer every event instead.
 */
export function LocationPill({ where, stored, onChange, onAnywhere = null, className = "" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const box = useRef(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shareLocation = async () => {
    setBusy(true);
    setNote("");
    try {
      const point = await locateBrowser();
      onChange(point);
      setOpen(false);
    } catch (e) {
      setNote(e?.message || "We could not get your location, so we kept the area we guessed.");
    } finally {
      setBusy(false);
    }
  };

  const forgetLocation = () => {
    onChange(null);
    setNote("");
    setOpen(false);
  };

  const showAnywhere = () => {
    onAnywhere();
    setNote("");
    setOpen(false);
  };

  const explain = stored
    ? "Showing what is near the location you shared."
    : where?.source === "ip" && where?.city
      ? `We guessed ${where.city} from your connection.`
      : where && where.lat !== null && where.lat !== undefined
        ? `Showing what is near ${where.city || "the place in this link"}.`
        : "We don't know where you are yet, so you're seeing everything.";

  return (
    <div className={`dc-where ${className}`} ref={box}>
      <Icon name="pin" size={16} />
      <span className="dc-where-label">{whereLabel(where, stored)}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        className="dc-where-change"
        aria-expanded={open}
        aria-controls={popId}
        aria-label={`Change location (now ${whereLabel(where, stored).toLowerCase()})`}
        onClick={() => setOpen((o) => !o)}
      >
        Change
      </button>
      {open ? (
        <div className="dc-where-pop" id={popId} role="group" aria-label="Your location">
          <p>{explain}</p>
          <button type="button" className="dc-btn dc-btn--sm dc-btn--block" onClick={shareLocation} disabled={busy}>
            <Icon name="navigation" size={16} /> {busy ? "Finding you…" : "Use my location"}
          </button>
          {stored ? (
            <button type="button" className="dc-btn dc-btn--sm dc-btn--ghost dc-btn--block" onClick={forgetLocation}>
              Forget my location
            </button>
          ) : onAnywhere ? (
            <button type="button" className="dc-btn dc-btn--sm dc-btn--ghost dc-btn--block" onClick={showAnywhere}>
              Show everywhere
            </button>
          ) : null}
          {note ? (
            <p className="dc-where-note" role="status">
              {note}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
