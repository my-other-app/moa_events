"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CENTRED, MAX_ZOOM, MIN_ZOOM, clampFraming, keyFraming, panBy, pinchOf, placement, zoomTo } from "@/utils/posterframe";

/**
 * The photo inside the poster's photo frame, moved and zoomed by the guest:
 *
 *   drag            one finger, or the mouse
 *   pinch           two fingers (and a trackpad's pinch, which a browser
 *                   sends as a wheel with Ctrl held)
 *   the slider      zoom, for a mouse and for anyone who'd rather not pinch
 *   the keyboard    with the frame focused: arrows move (Shift: further),
 *                   + and − zoom, 0 starts again
 *
 * The frame has the photo frame's own shape for the format chosen (its
 * width ÷ height, and its corners: `radius` as CSS, or `round`). What it holds is the
 * framing (utils/posterframe.js), which the server draws the same way.
 * The page scrolls as usual everywhere but on the frame itself.
 */
export default function PhotoFramer({ src, natural, aspect = 1, round = false, radius, framing, onChange, disabled = false }) {
  const frameRef = useRef(null);
  const [box, setBox] = useState(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const latest = useRef(framing);
  const hintId = useId();
  const sliderId = useId();

  useEffect(() => {
    latest.current = framing;
  }, [framing]);

  // The frame's drawn size, kept as it changes (a phone turned, the page resized).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBox((b) => (b && b.w === r.width && b.h === r.height ? b : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [aspect]);

  const change = useCallback(
    (next) => {
      if (!next) return;
      latest.current = next;
      onChange?.(next);
    },
    [onChange],
  );

  // A new frame shape keeps the same centre and zoom, pulled back inside the photo where it must be.
  useEffect(() => {
    if (!box || !natural) return;
    const kept = clampFraming(latest.current, natural, box);
    const f = latest.current || CENTRED;
    if (kept.zoom !== f.zoom || kept.cx !== f.cx || kept.cy !== f.cy) change(kept);
  }, [box, natural, change]);

  const local = (e) => {
    const r = frameRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  const onPointerDown = (e) => {
    if (disabled || !natural || !box) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* an older browser: the moves still come while the pointer stays over the frame */
    }
    pointers.current.set(e.pointerId, local(e));
    gesture.current = null;
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId) || !natural || !box) return;
    const before = pointers.current.get(e.pointerId);
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    const all = [...pointers.current.values()];
    if (all.length >= 2) {
      const pinch = pinchOf(all[0], all[1]);
      const last = gesture.current;
      gesture.current = pinch;
      if (!last || !(last.d > 0)) return;
      const f = latest.current || CENTRED;
      // Zoom about the fingers' midpoint, then follow the midpoint as it moves.
      const zoomed = zoomTo(f, f.zoom * (pinch.d / last.d), natural, box, pinch.x, pinch.y);
      change(panBy(zoomed, pinch.x - last.x, pinch.y - last.y, natural, box));
      return;
    }
    change(panBy(latest.current || CENTRED, now.x - before.x, now.y - before.y, natural, box));
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  };

  // A trackpad's pinch (a wheel with Ctrl) zooms; a plain wheel scrolls the page as ever.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey || disabled || !natural || !box) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const f = latest.current || CENTRED;
      change(zoomTo(f, f.zoom * Math.exp(-e.deltaY / 100), natural, box, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2));
    };
    // Safari's own pinch gesture would zoom the page instead.
    const stop = (e) => e.preventDefault();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", stop);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", stop);
    };
  }, [natural, box, disabled, change]);

  const onKeyDown = (e) => {
    if (disabled) return;
    const next = keyFraming(latest.current || CENTRED, e.key, { shift: e.shiftKey }, natural, box);
    if (!next) return;
    e.preventDefault();
    change(next);
  };

  const at = natural && box ? placement(framing || CENTRED, natural, box) : null;
  const zoom = clampFraming(framing || CENTRED).zoom;

  return (
    <div className="pf">
      <div
        ref={frameRef}
        className={`pf-frame${round ? " is-round" : ""}${disabled ? " is-disabled" : ""}`}
        style={{ aspectRatio: String(aspect > 0 ? aspect : 1), ...(radius && !round ? { borderRadius: radius } : {}) }}
        tabIndex={disabled ? -1 : 0}
        role="group"
        aria-roledescription="photo frame"
        aria-label="Your photo in the poster's frame"
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {src ? (
          // A plain <img>: an object URL of the guest's own photo, never sent through Next's optimiser.
          <img
            src={src}
            alt=""
            draggable={false}
            className="pf-photo"
            style={
              at
                ? { width: `${at.width}px`, height: `${at.height}px`, transform: `translate(${at.left}px, ${at.top}px)` }
                : { width: "100%", height: "100%", objectFit: "cover" }
            }
          />
        ) : null}
      </div>
      <p id={hintId} className="pf-hint">
        Drag to move, pinch or use the slider to zoom. With the keyboard: arrow keys move it, + and − zoom, 0 centres it.
      </p>
      <div className="pf-controls">
        <label className="pf-zoom" htmlFor={sliderId}>
          <span className="pf-zoom-label">Zoom</span>
          <input
            id={sliderId}
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={disabled || !natural}
            aria-valuetext={`${Math.round(zoom * 100)}%`}
            onChange={(e) => change(zoomTo(latest.current || CENTRED, Number(e.target.value), natural, box))}
          />
        </label>
        <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm" disabled={disabled || !natural} onClick={() => change(clampFraming(CENTRED, natural, box))}>
          Centre
        </button>
      </div>
    </div>
  );
}
