import { useCallback, useEffect, useState } from "react";

/**
 * Seconds left before something may happen again (asking for another code),
 * ticking once a second. `initial` is a wait already under way as the view
 * first draws (so it never flashes "send another" first); `start(seconds)`
 * begins a new one.
 */
export function useCountdown(initial = 0) {
  const [now, setNow] = useState(() => Date.now());
  const [until, setUntil] = useState(() => (initial > 0 ? now + initial * 1000 : 0));

  useEffect(() => {
    if (!until) return undefined;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(timer);
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until]);

  const start = useCallback((seconds) => {
    const t = Date.now();
    setNow(t);
    setUntil(t + Math.max(0, seconds) * 1000);
  }, []);

  return [until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0, start];
}
