"use client";

import { useState } from "react";

/**
 * A list to put in order on a phone: each row with its place and two large
 * buttons, up and down. No dragging to learn, and every move is announced
 * ("Moved Paris to 2 of 4"), so it works the same with a screen reader.
 *
 *   items     [{key, label, image?}] in the order shown
 *   onChange  the keys, in the new order
 *   mark      (key, index) -> optional {glyph, style, tinted} for the row
 */
export default function OrderList({ items, onChange, disabled = false, label = "Put these in order", mark = null, verdicts = null }) {
  const [said, setSaid] = useState("");
  const move = (from, to) => {
    if (to < 0 || to >= items.length || disabled) return;
    const next = items.map((i) => i.key);
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    onChange(next);
    setSaid(`Moved ${items[from].label} to ${to + 1} of ${items.length}`);
  };
  return (
    <>
      <ol className="lt-order" aria-label={label}>
        {items.map((item, i) => {
          const m = mark ? mark(item.key, i) : null;
          const v = verdicts ? verdicts[i] : null;
          return (
            <li key={item.key} className={`lt-order-row${m?.tinted ? " is-tinted" : ""}${v === true ? " is-right" : v === false ? " is-wrong" : ""}`} style={m?.style}>
              <span className="lt-order-place" aria-hidden="true">
                {i + 1}
              </span>
              {item.image && <img className="lt-option-img" src={item.image} alt="" loading="lazy" decoding="async" />}
              <span className="lt-order-label">
                {item.label}
                {v === true && <span className="live-sr"> — in the right place</span>}
                {v === false && <span className="live-sr"> — not in the right place</span>}
              </span>
              {v != null && (
                <span className="play-verdict-mark" aria-hidden="true">
                  {v ? "✓" : "✕"}
                </span>
              )}
              {!disabled && (
                <span className="lt-order-moves">
                  <button type="button" className="lt-move" aria-label={`Move ${item.label} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button type="button" className="lt-move" aria-label={`Move ${item.label} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="live-sr" aria-live="polite">
        {said}
      </p>
    </>
  );
}
