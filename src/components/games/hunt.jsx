"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { gamesApi } from "@/api/games";
import { clock, describeRefusal, msLeft, playPath, rankLine, scanToast } from "@/utils/games";
import { PlayGate, sessionOver } from "./access";
import { Toast } from "./cards";
import { createQueue } from "./huntqueue";
import Scanner from "./scanner";

const POLL_MS = 10 * 1000;

/** The countdown, by the server's clock (the offset taken when the hunt was read), ticking each second. */
export function Countdown({ hunt, now = () => Date.now() }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const left = msLeft(hunt, now());
  return (
    <p className="gm-timer" role="timer" aria-label="Time left">
      {clock(left)}
    </p>
  );
}

const STATE_WORDS = {
  draft: ["Not started yet", "The hunt hasn't begun. Hang tight, the organiser will start it soon."],
  scheduled: ["Not started yet", "The hunt starts soon. Get your phone ready."],
  paused: ["Hunt paused", "Hold on. The clock and scanning are paused until the organiser resumes."],
  ended: ["Hunt is over", "Thanks for playing. Your final points and rank are below."],
};

/** The hunt's face: stats, state banner, the clue(s), find list. Pure: everything comes from the server's reading. */
export function HuntView({ hunt, onScan, onHint, hinting, pending }) {
  const live = hunt.status === "live";
  const words = STATE_WORDS[hunt.status];
  const clues = hunt.mode === "free" ? hunt.clues : hunt.clue ? [hunt.clue] : [];
  return (
    <>
      {live ? <Countdown hunt={hunt} /> : null}
      {words ? (
        <section className="gm-panel" role="status" data-state={hunt.status}>
          <h2 className="gm-title">{words[0]}</h2>
          <p className="gm-note">{words[1]}</p>
        </section>
      ) : null}
      <div className="gm-stats">
        <div className="gm-stat">
          <b>{hunt.points}</b>
          <span>{hunt.totalPoints ? `Points of ${hunt.totalPoints}` : "Points"}</span>
        </div>
        <div className="gm-stat">
          <b>
            {hunt.found}
            {hunt.total ? `/${hunt.total}` : ""}
          </b>
          <span>Found</span>
        </div>
        <div className="gm-stat">
          <b>{hunt.rank == null ? "-" : `#${hunt.rank}`}</b>
          <span>{hunt.of ? `of ${hunt.of}` : "Rank"}</span>
        </div>
      </div>
      {pending > 0 ? (
        <p className="gm-queue" role="status">
          Saved, sending... ({pending})
        </p>
      ) : null}
      {hunt.status === "live" || hunt.status === "paused" ? (
        <section className="gm-panel" aria-label={hunt.mode === "free" ? "Clues" : "Your clue"}>
          <h2 className="gm-title">{hunt.mode === "free" ? "All clues" : "Your clue"}</h2>
          {clues.length === 0 ? <p className="gm-note">{hunt.complete ? "You found them all!" : "No clue right now."}</p> : null}
          {hunt.mode === "free" ? (
            <ul className="gm-list">
              {clues.map((c) => (
                <li key={c.id || c.number} className={c.found ? "is-done" : ""}>
                  <span>
                    {c.number != null ? `${c.number}. ` : ""}
                    {c.clue}
                    {c.zone ? ` (${c.zone})` : ""}
                  </span>
                  {c.found ? (
                    <span>Found</span>
                  ) : c.hasHint || c.hint ? (
                    <button type="button" className="gm-btn gm-btn--ghost" onClick={() => onHint(c.id)} disabled={!live || hinting} aria-label={`Hint for clue ${c.number ?? ""}`}>
                      {c.hint ? "Show hint" : `Hint${c.hintCost ? ` (-${c.hintCost} pts)` : ""}`}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            clues.map((c) => (
              <p key={c.id || "c"} className="gm-clue">
                {c.clue}
                {c.zone ? <span className="gm-sub"> ({c.zone})</span> : null}
                {c.hint ? <span className="gm-sub"> Hint: {c.hint}</span> : null}
              </p>
            ))
          )}
          <div className="gm-row">
            <button type="button" className="gm-btn" onClick={onScan} disabled={!live}>
              Scan a hunt code
            </button>
            {hunt.mode === "free" ? null : (
              <button type="button" className="gm-btn gm-btn--ghost" onClick={() => onHint(clues[0]?.id)} disabled={!live || hinting || !clues[0]?.hasHint}>
                Buy a hint{(clues[0]?.hintCost ?? hunt.hintCost) ? ` (-${clues[0]?.hintCost ?? hunt.hintCost} pts)` : ""}
              </button>
            )}
          </div>
        </section>
      ) : null}
      {hunt.recent.length > 0 ? (
        <section className="gm-panel" aria-label="Recent finds">
          <h2 className="gm-title">Recent finds</h2>
          <ul className="gm-list">
            {hunt.recent.map((r, i) => (
              <li key={i}>
                <span>{r.name} found a code</span>
                {r.at ? <time dateTime={r.at}>{new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {hunt.status === "ended" ? <p className="gm-note">{rankLine(hunt.rank, hunt.of)}</p> : null}
    </>
  );
}

/** The Scavenger Hunt for a session. Scans go through the retrying queue (huntqueue.js). */
export function HuntGame({ eventId, eventRef, token, names, end, api = gamesApi, pollMs = POLL_MS, storage, scanToken = null }) {
  const gameName = names?.hunt?.name || "Scavenger Hunt";
  const [hunt, setHunt] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState(0);
  const [hinting, setHinting] = useState(false);
  const queue = useRef(null);

  const guard = useCallback(
    (f) => {
      if (sessionOver(f)) end();
    },
    [end],
  );

  const refresh = useCallback(async () => {
    try {
      setHunt(await api.hunt(eventId, token));
      setError(null);
    } catch (f) {
      guard(f);
      setError(describeRefusal(f.code, f));
    }
  }, [api, eventId, token, guard]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  useEffect(() => {
    const q = createQueue({
      eventId,
      storage: storage || globalThis.localStorage,
      send: (code) => api.scan(eventId, token, code),
      onChange: setPending,
      onResult: (r) => {
        if (r.ok) {
          setToast(scanToast(r.result));
          refresh();
        } else {
          guard(r.failure);
          setToast({ tone: "bad", text: describeRefusal(r.failure.code, r.failure) });
        }
      },
    });
    queue.current = q;
    setPending(q.pending());
    q.flush();
    const online = () => q.flush();
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      q.stop();
    };
  }, [api, eventId, token, refresh, guard, storage]);

  // A hunt code opened from the phone's camera app arrives as ?scan=: sent once, through the same queue.
  const sent = useRef(false);
  useEffect(() => {
    if (scanToken && !sent.current && queue.current) {
      sent.current = true;
      queue.current.add(scanToken);
    }
  }, [scanToken, token]);

  const onScanned = useCallback((code) => {
    setScanning(false);
    queue.current?.add(code);
  }, []);

  const buyHint = async (pointId) => {
    setHinting(true);
    try {
      // Ordered mode names the one clue; free mode must say which.
      const r = await api.hint(eventId, token, pointId || hunt?.clue?.id || undefined);
      setToast({ tone: "info", text: r?.hint ? `Hint: ${r.hint}` : "Hint bought." });
      await refresh();
    } catch (f) {
      guard(f);
      setToast({ tone: "bad", text: describeRefusal(f.code, f) });
    }
    setHinting(false);
  };

  return (
    <main className="gm-wrap">
      <div className="gm-head">
        <h1 className="gm-title">{gameName}</h1>
      </div>
      <Toast toast={toast} />
      {scanning ? (
        <Scanner onCode={onScanned} onClose={() => setScanning(false)} label="Scan a hunt code" />
      ) : hunt ? (
        <HuntView hunt={hunt} pending={pending} hinting={hinting} onScan={() => setScanning(true)} onHint={buyHint} />
      ) : error ? (
        <section className="gm-panel">
          <p className="gm-err" role="alert">
            {error}
          </p>
          <button type="button" className="gm-btn" onClick={refresh}>
            Try again
          </button>
        </section>
      ) : (
        <p className="gm-note" role="status">
          Loading...
        </p>
      )}
      <Link className="gm-btn gm-btn--ghost" href={playPath(eventRef)}>
        All games
      </Link>
    </main>
  );
}

export default function HuntPage({ eventId, eventRef }) {
  const params = useSearchParams();
  const scanToken = params?.get("scan") || null;
  return <PlayGate eventId={eventId} eventRef={eventRef}>{(a) => <HuntGame eventId={eventId} eventRef={eventRef} token={a.token} names={a.names} end={a.end} scanToken={scanToken} />}</PlayGate>;
}
