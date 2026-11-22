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

/** One game's board: the top three on a podium (then 4-10 as rows) or the top rows as a list. */
export function BoardView({ title, rows, layout, limit, podium = true }) {
  const shown = rows.slice(0, limit);
  const usePodium = podium && layout === "podium" && shown.length >= 3;
  const top = usePodium ? shown.slice(0, 3) : [];
  const rest = usePodium ? shown.slice(3) : shown;
  // 2nd, 1st, 3rd: the winner in the middle.
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <section className="gms-board" aria-label={title}>
      <h2>{title}</h2>
      {shown.length === 0 ? <p className="gms-empty">No scores yet</p> : null}
      {usePodium ? (
        <div className="gms-podium" data-layout="podium">
          {order.map((r) => (
            <div key={r.rank} className={`gms-pod gms-pod--${r.rank}`}>
              <b>{r.rank}</b>
              <span>{r.name}</span>
              <span>
                {r.score} <Move move={r.move} />
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {rest.length > 0 ? (
        <ol className="gms-rows" data-layout={usePodium ? "rest" : "list"}>
          {rest.map((r) => (
            <li key={`${r.rank}-${r.name}`}>
              <span className="rk">{r.rank}</span>
              <span>{r.name}</span>
              <span className="sc">{r.score}</span>
              <Move move={r.move} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/** The stage scales to fit any window: designed at 1600 x 900. */
function useFit() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1600, window.innerHeight / 900) || 1);
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
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

/** The venue screen itself. */
export function ScreenView({ screen }) {
  const scale = useFit();
  const on = ["cards", "hunt"].filter((k) => screen.games[k]);
  const both = on.length === 2;
  const joinUrl = screen.joinUrl || `${SITE_URL}/play/${encodeURIComponent(screen.event.slug || screen.event.id || "")}`;
  const showSide = screen.joinBox || (screen.hunt && screen.games.hunt);
  return (
    <GameShell theme={screen.theme} accent={screen.accent} screen>
      <div className="gms-stage" style={{ transform: `scale(${scale})` }}>
        <header className="gms-top">
          <h1>{screen.event.name}</h1>
          {screen.logo ? (
            <img src={screen.logo} alt="" />
          ) : null}
        </header>
        <div className={`gms-main${showSide ? "" : " gms-main--solo"}`}>
          <div className={`gms-boards${both ? " gms-boards--two" : ""}`}>
            {on.length === 0 ? <p className="gms-empty">No game is on right now</p> : null}
            {on.map((k) => (
              <BoardView key={k} title={screen.games[k].name} rows={screen.boards[k].rows} layout={both ? "list" : screen.layout} limit={both ? Math.min(screen.rows, 7) : screen.rows} />
            ))}
          </div>
          {showSide ? (
            <aside className="gms-side">
              {screen.hunt && screen.games.hunt ? <HuntClock hunt={screen.hunt} name={screen.games.hunt.name} /> : null}
              {screen.joinBox ? (
                <div className="gms-join">
                  <QRCodeSVG value={joinUrl} size={220} marginSize={0} title="QR code to join the game" />
                  <span>Scan to join</span>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
        {screen.ticker ? (
          <ul className="gms-ticker" aria-label="Live feed" aria-live="polite">
            {screen.feed.map((f) => (
              <li key={f.id}>{f.message}</li>
            ))}
          </ul>
        ) : (
          <div />
        )}
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
