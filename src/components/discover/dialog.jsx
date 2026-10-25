"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import logoIcon from "@/assets/logo-icon.png";
import { assetSrc } from "@/utils/asset";
import { usePresence } from "@/utils/presence";
import { StoreButtons } from "./stores";
import Icon from "./icons";

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * A small dialog: Escape and the backdrop close it, Tab stays inside, and
 * focus goes back to whatever opened it. It comes up, and goes, with a short
 * fade (styles/motion.css); focus and the page's scroll come back the moment
 * it closes, not when the fade ends.
 */
export function Dialog({ open, onClose, labelledBy, className, backdropClassName, children }) {
  const box = useRef(null);
  const backdrop = useRef(null);
  const { mounted, leaving } = usePresence(open, backdrop);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    const first = box.current?.querySelector("[data-autofocus]") || box.current?.querySelector(FOCUSABLE);
    first?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current?.();
      } else if (e.key === "Tab" && box.current) {
        const items = [...box.current.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const head = items[0];
        const tail = items[items.length - 1];
        if (e.shiftKey && document.activeElement === head) {
          e.preventDefault();
          tail.focus();
        } else if (!e.shiftKey && document.activeElement === tail) {
          e.preventDefault();
          head.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (before && typeof before.focus === "function") before.focus();
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <div
      ref={backdrop}
      className={`dc-scope ${backdropClassName}`}
      data-leaving={leaving ? "" : undefined}
      inert={leaving || undefined}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close.current?.();
      }}
    >
      <div ref={box} className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>,
    document.body
  );
}

/**
 * "Do this in the app": following, liking, voting and commenting need an
 * account, and accounts live in the app. `alt`, when given, is the other way
 * (signing in here), under an "or" — or, with `altFirst`, the first way,
 * with the app under the "or" (commenting: there is no iPhone app yet).
 */
export function AppPrompt({ open, onClose, title = "Get MyOtherApp", message, alt = null, altFirst = false }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={id} className="dc-modal" backdropClassName="dc-modal-backdrop">
      <button type="button" className="dc-iconbtn" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={20} />
      </button>
      <img className="dc-modal-mark" src={assetSrc(logoIcon)} alt="" width="56" height="56" />
      <h2 id={id}>{title}</h2>
      <p>{message || "Follow clubs, get your tickets in a tap and hear about events before they fill up. Free on your phone."}</p>
      {alt && altFirst ? (
        <div className="dc-modal-alt dc-modal-alt--first">
          {alt}
          <span className="dc-modal-or">or get the app</span>
        </div>
      ) : null}
      <StoreButtons />
      {alt && !altFirst ? (
        <div className="dc-modal-alt">
          <span className="dc-modal-or">or</span>
          {alt}
        </div>
      ) : null}
      <button type="button" className="dc-modal-later" onClick={onClose}>
        Not now
      </button>
    </Dialog>
  );
}
