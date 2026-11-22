"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gamesApi } from "@/api/games";
import { hasGuest, isSignedIn } from "@/auth/session";
import { eventIdOfToken, eventRefOf, lockedFor, pinState, playPath, playableGames, tokenKind } from "@/utils/games";
import GameShell from "./shell";
import { readSession, saveSession } from "./store";

/** Where a player lands once in: the one game that's on, else the hub. */
export const landingFor = (names) => {
  const games = playableGames(names);
  const ref = eventRefOf(names);
  return games.length === 1 ? playPath(ref, games[0].kind) : playPath(ref);
};

/**
 * /g/{token}: what a badge QR (or a hunt code opened from the phone's
 * camera app) lands on.
 *
 *   loading   asking the API about the code
 *   found     the badge is good: enter the 4-digit PIN
 *   wrong     the PIN was wrong, with attempts left
 *   locked    too many wrong PINs, until a time
 *   notin     not checked in: "Check in at the desk first"
 *   error     a code that isn't ours, or no connection
 *
 * A browser that already holds a game session for the event (or is signed in
 * as that guest) skips the PIN and goes straight in.
 */
export function BadgeLanding({ token, api = gamesApi, now = () => Date.now() }) {
  const router = useRouter();
  const [state, setState] = useState({ kind: "loading" });
  const [names, setNames] = useState(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);
  const kind = tokenKind(token);
  const eventId = eventIdOfToken(token);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!eventId || kind === "unknown") return setState({ kind: "error", message: "That code isn't one of ours." });
      // A hunt code from the camera app: into the hunt, which sends it.
      if (kind === "point") {
        try {
          const n = await api.names(eventId);
          if (!n) return setState({ kind: "error", message: "That code isn't one of ours." });
          setNames(n);
          if (readSession(eventId)) return router.replace(`${playPath(eventRefOf(n), "hunt")}?scan=${encodeURIComponent(token)}`);
          return setState({ kind: "needbadge" });
        } catch (f) {
          return setState(pinState(f));
        }
      }
      try {
        const n = await api.badge(token);
        setNames(n);
        const into = (extra = "") => router.replace(`${landingFor(n)}${extra}`);
        const collect = `?collect=${encodeURIComponent(token)}`;
        const cardsPath = n.cards ? `${playPath(eventRefOf(n), "cards")}${collect}` : null;
        if (readSession(n.event.id || eventId)) return cardsPath ? router.replace(cardsPath) : into();
        if (hasGuest() || isSignedIn()) {
          try {
            const s = await api.openSession(n.event.id || eventId);
            if (s) {
              saveSession(n.event.id || eventId, s);
              return cardsPath ? router.replace(cardsPath) : into();
            }
          } catch {
            /* not this account's badge: the PIN is the way in */
          }
        }
        return setState({ kind: "found" });
      } catch (f) {
        return setState(pinState(f));
      }
    })();
  }, [api, token, eventId, kind, router]);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin) || busy) return;
    setBusy(true);
    try {
      const s = await api.pin(token, pin);
      if (!s) throw Object.assign(new Error("no session"), { code: null });
      saveSession(s.event.id || eventId, s);
      router.replace(landingFor(names));
    } catch (f) {
      setPin("");
      setState(pinState(f));
      setBusy(false);
    }
  };

  const retryable = state.kind === "found" || state.kind === "wrong";
  return (
    <GameShell theme={names?.theme}>
      <main className="gm-wrap">
        <div className="gm-head">
          {names?.logo ? (
            <img src={names.logo} alt="" />
          ) : null}
          <div>
            <h1 className="gm-title">{names?.event?.name || "Join the game"}</h1>
            {names ? <p className="gm-sub">{playableGames(names).map((g) => g.name).join(" and ")}</p> : null}
          </div>
        </div>
        {state.kind === "loading" ? (
          <p className="gm-note" role="status">
            Checking your code...
          </p>
        ) : state.kind === "notin" ? (
          <section className="gm-panel" role="status" data-state="notin">
            <h2 className="gm-title">Check in at the desk first</h2>
            <p className="gm-note">Once the desk has checked you in, scan your badge again.</p>
          </section>
        ) : state.kind === "locked" ? (
          <section className="gm-panel" role="alert" data-state="locked">
            <h2 className="gm-title">Too many tries</h2>
            <p className="gm-note">
              {lockedFor(state.until, now()) ? `Try again in ${lockedFor(state.until, now())}.` : "Try again in a few minutes."} The help desk can reset your PIN.
            </p>
          </section>
        ) : state.kind === "needbadge" ? (
          <section className="gm-panel">
            <h2 className="gm-title">Scan your badge first</h2>
            <p className="gm-note">Scan the QR on your badge and enter your PIN, then scan this code again.</p>
          </section>
        ) : state.kind === "error" ? (
          <section className="gm-panel">
            <p className="gm-err" role="alert">
              {state.message}
            </p>
          </section>
        ) : retryable ? (
          <form className="gm-panel" onSubmit={submit} data-state={state.kind}>
            <label className="gm-title" htmlFor="gm-pin">
              Enter your PIN
            </label>
            <p className="gm-note">The 4 digits printed under the QR on your badge, or on your ticket.</p>
            <input
              id="gm-pin"
              className="gm-input"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            {state.kind === "wrong" ? (
              <p className="gm-err" role="alert">
                {state.attemptsLeft == null ? "That PIN isn't right." : `That PIN isn't right. ${state.attemptsLeft} ${state.attemptsLeft === 1 ? "try" : "tries"} left.`}
              </p>
            ) : null}
            <button type="submit" className="gm-btn" disabled={pin.length !== 4 || busy}>
              {busy ? "Checking..." : "Let me in"}
            </button>
          </form>
        ) : null}
      </main>
    </GameShell>
  );
}
