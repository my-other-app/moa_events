import { useCallback, useSyncExternalStore } from "react";

/** Phones: what the stylesheets call a narrow screen. */
export const NARROW = "(max-width: 767px)";

const media = (query) => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : null);

/** Whether a media query matches now, following it as the window changes. False where there is no window. */
export function useMedia(query) {
  const subscribe = useCallback(
    (notify) => {
      const mq = media(query);
      if (!mq) return () => {};
      mq.addEventListener?.("change", notify);
      return () => mq.removeEventListener?.("change", notify);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => Boolean(media(query)?.matches),
    () => false
  );
}
