"use client";

/**
 * The question's clock, as the theme draws it (CONTRACT 1.1 `timer`):
 *
 *   bar     the seconds and a bar running down (today's, and with no theme)
 *   ring    the seconds inside a ring running down
 *   number  the seconds alone, large
 *   hidden  no clock at all (the time still runs)
 *
 * Paused, it says so and stops. The seconds are read out to a screen
 * reader through the label; the bar and the ring are decoration.
 */
const RING = 2 * Math.PI * 22;

export default function Clock({ timer = "bar", left, seconds, paused = false }) {
  if (timer === "hidden") return null;
  const share = seconds > 0 ? Math.min(1, Math.max(0, left / seconds)) : 0;
  const urgent = !paused && left <= 5;
  const label = paused ? "Paused" : `${left} seconds left`;
  const text = paused ? "Paused" : left === 0 ? "Time" : `${left}s`;
  const cls = `play-clock${urgent ? " is-urgent" : ""}${!paused && left === 0 ? " is-out" : ""}${paused ? " is-paused" : ""}`;
  if (timer === "ring") {
    return (
      <span className={`${cls} play-ring`} role="timer" aria-label={label}>
        <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true" focusable="false">
          <circle className="play-ring-track" cx="26" cy="26" r="22" />
          <circle className="play-ring-run" cx="26" cy="26" r="22" strokeDasharray={RING} strokeDashoffset={RING * (1 - share)} transform="rotate(-90 26 26)" />
        </svg>
        <span className="play-ring-n" aria-hidden="true">
          {paused ? "II" : left}
        </span>
      </span>
    );
  }
  return (
    <span className={`${cls}${timer === "number" ? " is-big" : ""}`} aria-label={label}>
      {text}
    </span>
  );
}

/** The bar under the band's head: the `bar` timer only. */
export function TimeBar({ timer = "bar", left, seconds }) {
  if (timer !== "bar") return null;
  const share = seconds > 0 ? Math.min(1, Math.max(0, left / seconds)) : 0;
  return (
    <span className="play-timebar" aria-hidden="true">
      <span className={left <= 5 ? "is-urgent" : ""} style={{ transform: `scaleX(${share})` }} />
    </span>
  );
}
