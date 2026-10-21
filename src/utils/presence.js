import { useLayoutEffect, useState } from "react";

/** The exit animations (styles/motion.css names them motion-out-*): the ones worth waiting for. */
const leavingOf = (el) => {
  if (!el || typeof el.getAnimations !== "function") return [];
  return el.getAnimations({ subtree: true }).filter((a) => String(a.animationName || "").startsWith("motion-out"));
};

/**
 * Keeps a menu or a dialog on screen while it animates away. Render it
 * while `mounted`, with data-leaving while `leaving`; the stylesheet plays
 * its exit then, and it goes when that ends. Where nothing plays (less
 * motion asked for, or no Web Animations API, as in tests) it goes at once,
 * exactly as before. Opening again while it leaves keeps it.
 *
 *   open   whether it should be shown
 *   ref    the element that animates (its own exits and its children's)
 */
export function usePresence(open, ref) {
  const [shown, setShown] = useState(open);
  // Opening shows it in the same render: no frame without it.
  if (open && !shown) setShown(true);
  const leaving = shown && !open;

  // Before paint: with nothing to play, it is gone in the same frame it closed in.
  useLayoutEffect(() => {
    if (!leaving) return undefined;
    const exits = leavingOf(ref.current);
    if (!exits.length) {
      setShown(false);
      return undefined;
    }
    let alive = true;
    Promise.all(exits.map((a) => a.finished.catch(() => null))).then(() => {
      if (alive) setShown(false);
    });
    return () => {
      alive = false;
    };
  }, [leaving, ref]);

  return { mounted: open || shown, leaving };
}
