"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { gamesApi } from "@/api/games";
import { canPlay, playableGames, playPath } from "@/utils/games";
import { readSession, saveSession } from "./store";

/**
 * "Play <game name>" for the event's page and the guest's ticket: one link per
 * game that is on, shown only when GET /public (read with the normal auth)
 * says `me.can_play`. Deciding never makes a game session: that call is
 * made when the guest taps Play (the play page's gate) or, on the ticket,
 * "Show my game QR". Nothing at all from an API without games, or for a
 * reader who can't play. A section of its own: the games stand apart from
 * every other module of the event.
 */
export default function PlayEntry({ eventId, eventRef, withCode = false, skip = false, api = gamesApi }) {
  const [names, setNames] = useState(null);
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState(false);

  useEffect(() => {
    if (skip || eventId == null) return undefined;
    let alive = true;
    // Started inside a promise: a failing read (or no API at all) just leaves the section out.
    Promise.resolve()
      .then(() => api.names(eventId))
      .then(
      (n) => alive && setNames(n),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [api, eventId, skip]);

  const ready = !skip && canPlay(names);

  // A session this browser already holds shows the code with no tap; it never makes one.
  useEffect(() => {
    if (!withCode || !ready) return undefined;
    const kept = readSession(eventId);
    if (!kept) return undefined;
    let alive = true;
    api.code(eventId, kept.token).then(
      (c) => alive && setCode(c),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [withCode, ready, api, eventId]);

  const showCode = async () => {
    setBusy(true);
    setCodeError(false);
    try {
      let kept = readSession(eventId);
      if (!kept) {
        const s = await api.openSession(eventId);
        if (!s) throw new Error("no session");
        saveSession(eventId, s);
        kept = s;
      }
      setCode(await api.code(eventId, kept.token));
    } catch {
      setCodeError(true);
    }
    setBusy(false);
  };

  if (!ready) return null;
  const games = playableGames(names);
  return (
    <section className={`gm-entry${withCode ? " gm-entry--ticket" : ""}`} aria-label="Play">
      <div className="gm-entry-links">
        {games.map((g) => (
          <Link key={g.kind} className="gm-entry-btn" href={playPath(eventRef, g.kind)}>
            Play {g.name}
          </Link>
        ))}
      </div>
      {withCode && code?.url ? (
        <div className="gm-entry-code">
          <div className="gm-qr">
            <QRCodeSVG value={code.url} size={140} marginSize={0} title="Your game QR code" />
          </div>
          {code.pin ? (
            <p>
              Game PIN <strong>{code.pin}</strong>
            </p>
          ) : null}
        </div>
      ) : withCode ? (
        <div className="gm-entry-code">
          <button type="button" className="gm-btn gm-btn--ghost" onClick={showCode} disabled={busy}>
            {busy ? "Getting your code..." : "Show my game QR"}
          </button>
          {codeError ? (
            <p className="gm-err" role="alert">
              Couldn't get your code. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
