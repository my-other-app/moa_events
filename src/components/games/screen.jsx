"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { gamesApi, screenStreamUrl } from "@/api/games";
import { SITE_URL } from "@/config";
import { clock, msLeft } from "@/utils/games";
import GameShell from "./shell";

export const SCREEN_POLL_MS = 10 * 1000;
/** Pushes are batched: a burst of events is one re-fetch. */
export const REFETCH_GAP_MS = 1000;

const makeSource = (url) => (typeof EventSource === "function" ? new EventSource(url) : null);

/**
 * The venue screen's state: read once, then kept fresh by server-sent events
 * (board, feed, hunt, settings: each is a nudge to re-read the screen's
 * GET, at most once a second), with a 10 s poll whenever the stream is not
 * connected, and a re-fetch whenever it (re)connects.
 */
export function useScreen(screenToken, { api = gamesApi, open = makeSource, pollMs = SCREEN_POLL_MS, gapMs = REFETCH_GAP_MS } = {}) {
  const [screen, setScreen] = useState(null);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(false);
  const last = useRef(0);
  const timer = useRef(null);

  const read = useCallback(async () => {
    last.current = Date.now();
    try {
      setScreen(await api.screen(screenToken));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [api, screenToken]);

  useEffect(() => {
    read();
  }, [read]);

  const nudge = useCallback(() => {
    if (timer.current) return;
    const wait = Math.max(0, last.current + gapMs - Date.now());
    timer.current = setTimeout(() => {
      timer.current = null;
      read();
    }, wait);
  }, [read, gapMs]);

  useEffect(() => {
    let source = null;
    try {
      source = open(screenStreamUrl(screenToken));
    } catch {
      source = null;
    }
    if (source) {
      source.onopen = () => {
        setLive(true);
        read();
      };
      source.onerror = () => setLive(false);
      for (const name of ["board", "feed", "hunt", "settings"]) source.addEventListener?.(name, nudge);
    }
    return () => {
      source?.close?.();
      clearTimeout(timer.current);
      timer.current = null;
    };
  }, [screenToken, open, read, nudge]);

  // Polling stands in whenever there is no live stream.
  useEffect(() => {
    if (live) return undefined;
    const t = setInterval(read, pollMs);
    return () => clearInterval(t);
  }, [live, read, pollMs]);

  return { screen, failed, live };
}

const Move = ({ move }) =>
  move.dir === "up" ? (
    <span className="gms-up" aria-label="moved up">
      ▲{move.by ?? ""}
    </span>
  ) : move.dir === "down" ? (
    <span className="gms-down" aria-label="moved down">
      ▼{move.by ?? ""}
    </span>
  ) : (
    <span aria-hidden="true" />
  );

/** Auto-scroll speed in viewport heights per second, and the pause at each end. */
export const SCROLL_SPEED = 0.035;
export const SCROLL_PAUSE_MS = 4000;
/** After a person scrolls by hand, the screen waits this long before scrolling again. */
export const SCROLL_IDLE_MS = 15000;

/**
 * A venue screen has no mouse: a list longer than its box scrolls itself,
 * slowly, pauses at the bottom, jumps back to the top, pauses there and
 * loops. A wheel, a touch, a key or a click hands it over for SCROLL_IDLE_MS.
 */
export function useAutoScroll(ref, { speed = SCROLL_SPEED, pauseMs = SCROLL_PAUSE_MS, idleMs = SCROLL_IDLE_MS } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return undefined;
    let frame = 0;
    let last = 0;
    let holdUntil = Date.now() + pauseMs;
    let pos = el.scrollTop;
    let toTop = false;
    const step = (t) => {
      frame = window.requestAnimationFrame(step);
      const dt = last ? Math.min(100, t - last) : 0;
      last = t;
      const now = Date.now();
      const room = el.scrollHeight - el.clientHeight;
      if (room <= 2 || now < holdUntil) {
        pos = el.scrollTop;
        return;
      }
      if (toTop) {
        el.scrollTop = 0;
        pos = 0;
        toTop = false;
        holdUntil = now + pauseMs;
        return;
      }
      pos = Math.min(room, pos + (dt / 1000) * speed * window.innerHeight);
      el.scrollTop = pos;
      if (pos >= room - 1) {
        toTop = true;
        holdUntil = now + pauseMs;
      }
    };
    const takeOver = () => {
      holdUntil = Date.now() + idleMs;
      toTop = false;
    };
    const events = ["wheel", "touchstart", "pointerdown", "keydown"];
    for (const e of events) el.addEventListener(e, takeOver, { passive: true });
    frame = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frame);
      for (const e of events) el.removeEventListener(e, takeOver);
    };
  }, [ref, speed, pauseMs, idleMs]);
}

/** One game's board: the top three on a podium, then everyone else in a list that scrolls itself; or one plain list. */
export function BoardView({ title, rows, layout, limit, podium = true, compact = false, hint = null }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const usePodium = podium && layout === "podium" && shown.length >= 3;
  const top = usePodium ? shown.slice(0, 3) : [];
  const rest = usePodium ? shown.slice(3) : shown;
  const listRef = useRef(null);
  useAutoScroll(listRef);
  // 2nd, 1st, 3rd: the winner in the middle.
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <section className={`gms-board${compact ? " gms-board--compact" : ""}`} aria-label={title}>
      <h2>{title}</h2>
      {shown.length === 0 ? (
        <div className="gms-none">
          <span className="gms-none-mark" aria-hidden="true">
            ★
          </span>
          <p className="gms-empty">No scores yet</p>
          {hint ? <p className="gms-none-hint">{hint}</p> : null}
        </div>
      ) : null}
      {usePodium ? (
        <div className="gms-podium" data-layout="podium">
          {order.map((r) => (
            <div key={r.rank} className={`gms-pod gms-pod--${r.rank}`}>
              <b>{r.rank}</b>
              <span className="nm">{r.name}</span>
              <span className="sc">
                {r.score} <Move move={r.move} />
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <ol ref={listRef} className="gms-rows" data-layout={usePodium ? "rest" : "list"} tabIndex={0} aria-label={`${title}: ${usePodium ? "4th place on" : "every place"}`}>
          {rest.map((r) => (
            <li key={`${r.rank}-${r.name}`} className={!usePodium && r.rank <= 3 ? `gms-medal gms-medal--${r.rank}` : undefined}>
              <span className="rk">{r.rank}</span>
              <span className="nm">{r.name}</span>
              <span className="sc">{r.score}</span>
              <Move move={r.move} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/** The ticker: one line along the bottom, inside the window; it slides when it is wider than the screen. */
function Ticker({ feed }) {
  const box = useRef(null);
  const [slide, setSlide] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const check = () => setSlide(el.scrollWidth > el.clientWidth + 2);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [feed]);
  return (
    <div className="gms-ticker" data-slide={slide ? "on" : "off"}>
      <span className="gms-ticker-tag">Live</span>
      <div className="gms-ticker-box" ref={box}>
        <div className="gms-ticker-track">
          <ul aria-label="Live feed" aria-live="polite">
            {feed.length === 0 ? <li className="gms-ticker-quiet">The latest moves show up here</li> : null}
            {feed.map((f) => (
              <li key={f.id}>{f.message}</li>
            ))}
          </ul>
          {slide ? (
            <ul aria-hidden="true">
              {feed.map((f) => (
                <li key={f.id}>{f.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HuntClock({ hunt, name }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = msLeft(hunt);
  const label = hunt.status === "ended" ? "Hunt is over" : hunt.status === "paused" ? "Hunt paused" : hunt.status === "live" ? "Time left" : "Starting soon";
  return (
    <div className="gms-clock" role="timer" aria-label={`${name} timer`}>
      <span>{label}</span>
      <b>{hunt.status === "ended" ? "00:00" : clock(left)}</b>
    </div>
  );
}

/** The venue screen itself: the whole window, never wider or taller than it, at any size. */
export function ScreenView({ screen }) {
  const on = ["cards", "hunt"].filter((k) => screen.games[k]);
  const both = on.length === 2;
  const joinUrl = screen.joinUrl || `${SITE_URL}/play/${encodeURIComponent(screen.event.slug || screen.event.id || "")}`;
  const showSide = screen.joinBox || (screen.hunt && screen.games.hunt);
  const hint = screen.joinBox ? "Scan the code to get on the board" : null;
  return (
    <GameShell theme={screen.theme} accent={screen.accent} colors={screen.colors} screen>
      <div className="gms-stage">
        <header className="gms-head">
          <div className="gms-titles">
            <h1>{screen.event.name}</h1>
            {on.length ? <p>{on.map((k) => screen.games[k].name).join(" · ")}</p> : null}
          </div>
          {screen.logo ? <img src={screen.logo} alt="" /> : null}
        </header>
        <div className={`gms-main${showSide ? "" : " gms-main--solo"}`}>
          <div className={`gms-boards${both ? " gms-boards--two" : ""}`}>
            {on.length === 0 ? (
              <div className="gms-none">
                <p className="gms-empty">No game is on right now</p>
              </div>
            ) : null}
            {on.map((k) => (
              <BoardView key={k} title={screen.games[k].name} rows={screen.boards[k].rows} layout={screen.layout} limit={screen.rows} compact={both} hint={hint} />
            ))}
          </div>
          {showSide ? (
            <aside className="gms-side">
              {screen.hunt && screen.games.hunt ? <HuntClock hunt={screen.hunt} name={screen.games.hunt.name} /> : null}
              {screen.joinBox ? (
                <div className="gms-join">
                  <QRCodeSVG value={joinUrl} size={256} marginSize={0} title="QR code to join the game" />
                  <span>Scan to join</span>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
        {screen.ticker ? <Ticker feed={screen.feed} /> : null}
      </div>
    </GameShell>
  );
}

export default function ScreenPage({ screenToken, api, open }) {
  const { screen, failed } = useScreen(screenToken, { api, open });
  if (!screen) {
    return (
      <GameShell screen>
        <p className="gms-empty" role="status">
          {failed ? "This screen link isn't working. Ask the organiser for a new one." : "Loading..."}
        </p>
      </GameShell>
    );
  }
  return <ScreenView screen={screen} />;
}
