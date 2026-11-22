"use client";

import Link from "next/link";
import { playableGames, playPath } from "@/utils/games";
import { PlayGate } from "./access";

/** /play/{ref}: each game that's on, by the name the organiser gave it. */
export function Hub({ eventRef, names, eventName }) {
  const games = playableGames(names);
  return (
    <main className="gm-wrap">
      <div className="gm-head">
        {names?.logo ? (
          <img src={names.logo} alt="" />
        ) : null}
        <div>
          <h1 className="gm-title">Play</h1>
          <p className="gm-sub">{eventName || names?.event?.name}</p>
        </div>
      </div>
      <nav className="gm-games" aria-label="Games">
        {games.map((g) => (
          <Link key={g.kind} className="gm-game" href={playPath(eventRef, g.kind)}>
            <strong>{g.name}</strong>
            <span aria-hidden="true">Play</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}

export default function HubPage({ eventId, eventRef, eventName }) {
  return <PlayGate eventId={eventId} eventRef={eventRef}>{(a) => <Hub eventRef={eventRef} names={a.names} eventName={eventName} />}</PlayGate>;
}
