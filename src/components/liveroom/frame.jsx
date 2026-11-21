"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { liveApi } from "@/api/live";
import { backdropStyle, guestTheme, mediaUrl, rememberTheme, rememberedTheme, themeClasses, themeVars } from "@/utils/liveTheme";
import { themeFontVariables } from "./fonts";

/**
 * The live page's root (the room, the quiz). With no theme it is exactly
 * the element it always was. With one, it carries the theme's colours,
 * fonts and text size as custom properties (src/styles/liveroom.css reads
 * them), and when the theme asks the phone to draw its background, the
 * page sits on that backdrop edge to edge.
 */
export function LiveFrame({ theme, children, ...rest }) {
  if (!theme) {
    return (
      <div className="live-page dc-scope" {...rest}>
        {children}
      </div>
    );
  }
  const page = (
    <div className={`live-page dc-scope ${themeClasses(theme)} ${themeFontVariables}`.trim()} style={themeVars(theme)} {...rest}>
      {children}
    </div>
  );
  if (theme.guest.background !== "theme") return page;
  return (
    <div className="lt-backdrop" style={backdropStyle(theme)}>
      {page}
    </div>
  );
}

/** The organiser's logo at the top of the room and the quiz, when the theme shows it; nothing if it fails to load. */
export function ThemeLogo({ theme }) {
  const [broken, setBroken] = useState(null);
  const url = theme && theme.guest.logo ? mediaUrl(theme.logo) : null;
  if (!url || broken === url) return null;
  const { width, height } = theme.logo;
  return <img className="lt-logo" src={url} alt="" width={width || undefined} height={height || undefined} decoding="async" onError={() => setBroken(url)} />;
}

/** How long a theme answer older than the play state's version is trusted before it is asked for again (the public theme is cached 15 s). */
const STALE_RETRY_MS = 16 * 1000;

/**
 * The quiz page's theme: the one the room left in this tab at once (so the
 * page opens in it), then the API's whenever the play state names a
 * version this page does not have. An API from before themes names none,
 * and nothing is asked: the page keeps today's look.
 */
export function useQuizTheme(eventId, version) {
  const [wrapper, setWrapper] = useState(null);
  /** How many times each version was asked for: twice at most. */
  const asked = useRef(new Map());
  const timer = useRef(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setWrapper(rememberedTheme(eventId));
  }, [eventId]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const have = wrapper?.version || null;
  useEffect(() => {
    if (!version || have === version) return undefined;
    const n = asked.current.get(version) || 0;
    if (n >= 2 || (n === 1 && timer.current)) return undefined;
    asked.current.set(version, n + 1);
    let gone = false;
    liveApi
      .fetchTheme(eventId)
      .then((w) => {
        if (gone || !w) return;
        setWrapper(w);
        rememberTheme(eventId, w);
        // A cached answer from just before the change: once more, after the cache has turned over.
        if (w.version !== version && n === 0) {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            setTick((t) => t + 1);
          }, STALE_RETRY_MS);
        }
      })
      .catch(() => {
        /* the page keeps the look it has */
      });
    return () => {
      gone = true;
    };
  }, [eventId, version, have, tick]);

  return useMemo(() => guestTheme(wrapper), [wrapper]);
}
