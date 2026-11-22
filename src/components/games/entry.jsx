"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { gamesApi } from "@/api/games";
import { playableGames, playPath } from "@/utils/games";
import { useGameAccess } from "./access";

/**
 * "Play <game name>" for the event's page and the guest's ticket: one link per
 * game that is on, shown only when the guest is checked in (a game session
 * could be made for them) and at least one game is on. Nothing otherwise,
 * and nothing at all from an API without games. On the ticket (`withCode`)
 * it also shows the guest's game QR and PIN. A section of its own: the
 * games stand apart from every other module of the event.
 */
export default function PlayEntry({ eventId, eventRef, withCode = false, skip = false, api = gamesApi }) {
  const access = useGameAccess(skip ? null : eventId, { api });
  const [code, setCode] = useState(null);
  const ready = !skip && access.status === "in";

  useEffect(() => {
    if (!withCode || !ready) return undefined;
    let alive = true;
    api.code(eventId, access.token).then(
      (c) => alive && setCode(c),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [withCode, ready, api, eventId, access.token]);

  if (!ready) return null;
  const games = playableGames(access.names);
  if (games.length === 0) return null;
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
      ) : null}
    </section>
  );
}
