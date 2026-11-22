"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { gamesApi } from "@/api/games";
import { hasGuest, isSignedIn } from "@/auth/session";

const signedIn = () => isSignedIn();
import { notPlayingReason, playableGames } from "@/utils/games";
import { dropSession, readSession, saveSession, sessionOver, takeFragmentSession } from "./store";
import GameShell from "./shell";

/**
 * Who is playing in this browser, for one event:
 *
 *   loading  asking
 *   closed   no game is on for the event (or the API has none)
 *   out      a game is on, but this browser holds no session and can't make one
 *            (not signed in, or not checked in): scan the badge, or check in
 *   in       a session (kept from a badge + PIN, or made now from the signed-in
 *            account or the guest's own token: no PIN)
 *
 * `end()` drops the session (the API said it is over: a newer sign-in took it).
 */
export function useGameAccess(eventId, { api = gamesApi, openFromAccount = true } = {}) {
  const [state, setState] = useState({ status: "loading", names: null, token: null, reason: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (eventId == null) return undefined;
    let alive = true;
    // The app's hand-off (#gs=...) first, before anything reads the stored session or the address.
    takeFragmentSession(eventId);
    const set = (next) => alive && setState(next);
    (async () => {
      let names = null;
      try {
        names = await api.names(eventId);
      } catch {
        return set({ status: "error", names: null, token: null, reason: null });
      }
      if (!names || playableGames(names).length === 0) return set({ status: "closed", names, token: null, reason: null });
      const kept = readSession(eventId);
      if (kept) return set({ status: "in", names, token: kept.token, reason: null });
      // /public already says who can't play (reads with the normal auth); no session call for them.
      if (names.me && names.me.canPlay === false) return set({ status: "out", names, token: null, reason: notPlayingReason(names) });
      if (openFromAccount && (hasGuest() || signedIn())) {
        try {
          const s = await api.openSession(eventId);
          if (s) {
            saveSession(eventId, s);
            return set({ status: "in", names, token: s.token, reason: null });
          }
        } catch (f) {
          return set({ status: "out", names, token: null, reason: f?.code === "NOT_CHECKED_IN" ? "notin" : null });
        }
      }
      return set({ status: "out", names, token: null, reason: null });
    })();
    return () => {
      alive = false;
    };
  }, [eventId, api, openFromAccount, tick]);

  const end = useCallback(() => {
    dropSession(eventId);
    setTick((t) => t + 1);
  }, [eventId]);
  return { ...state, end };
}

export { sessionOver };

/** The themed frame plus what to say while there is no session; renders `children({token, names, end})` once in. */
export function PlayGate({ eventId, eventRef, api, children }) {
  const access = useGameAccess(eventId, { api });
  const { status, names } = access;
  const theme = names?.theme;
  if (status === "in") return <GameShell theme={theme}>{children(access)}</GameShell>;
  return (
    <GameShell theme={theme}>
      <main className="gm-wrap">
        {status === "loading" ? (
          <p className="gm-note" role="status">
            Loading...
          </p>
        ) : status === "closed" ? (
          <section className="gm-panel">
            <h1 className="gm-title">No games here</h1>
            <p className="gm-note">There's no game switched on for this event right now.</p>
            <Link className="gm-btn gm-btn--ghost" href={`/events/${encodeURIComponent(eventRef)}`}>
              Back to the event
            </Link>
          </section>
        ) : status === "error" ? (
          <section className="gm-panel">
            <h1 className="gm-title">Can't reach the game</h1>
            <p className="gm-err" role="alert">
              No connection. Check your signal and try again.
            </p>
            <button type="button" className="gm-btn" onClick={() => access.end()}>
              Try again
            </button>
          </section>
        ) : (
          <section className="gm-panel">
            <h1 className="gm-title">{access.reason === "notin" ? "Check in at the desk first" : "Scan your badge to join"}</h1>
            <p className="gm-note">
              {access.reason === "notin"
                ? "You can play once the desk has checked you in."
                : "Point your phone's camera at the QR code on your badge, then enter the 4-digit PIN printed under it. Your ticket page shows the same code and PIN."}
            </p>
          </section>
        )}
      </main>
    </GameShell>
  );
}
