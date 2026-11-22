"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { gamesApi } from "@/api/games";
import { SITE_URL } from "@/config";
import { TIERS, TIER_BANNER, TIER_LABEL, collectToast, describeRefusal, filterDeck, playPath, rankLine, tierOf } from "@/utils/games";
import { PlayGate, sessionOver } from "./access";
import HeroCard from "./herocard";
import Scanner from "./scanner";

export const POLL_MS = 10 * 1000;

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <p className={`gm-toast gm-toast--${toast.tone}`} role={toast.tone === "bad" ? "alert" : "status"}>
      {toast.text}
    </p>
  );
}

/** The one-time reveal: a banner per tier (RARE PULL!), rays behind the card, Add to my deck and Share. */
export function Reveal({ hero, gameName, onAdd, share = defaultShare }) {
  const tier = tierOf(hero.tier);
  const [note, setNote] = useState("");
  return (
    <section className={`gm-reveal gm-reveal--${tier}`} aria-label={`Your ${gameName} reveal`}>
      <div className="gm-rays" aria-hidden="true" />
      <p className="gm-banner" role="status" data-tier={tier}>
        {TIER_BANNER[tier]}
      </p>
      <HeroCard hero={hero} size="lg" burst />
      {hero.holders != null ? (
        <p className="gm-note">
          About {hero.holders} {hero.holders === 1 ? "player holds" : "players hold"} this card.
        </p>
      ) : null}
      <div className="gm-row">
        <button type="button" className="gm-btn" onClick={onAdd}>
          Add to my deck
        </button>
        <button
          type="button"
          className="gm-btn gm-btn--ghost"
          onClick={async () => setNote(await share({ title: `${hero.name} (${TIER_LABEL[tier]})`, text: `I pulled ${hero.name} (${TIER_LABEL[tier]}) in ${gameName}!`, url: SITE_URL }))}
        >
          Share my card
        </button>
      </div>
      {note ? (
        <p className="gm-note" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}

async function defaultShare(data) {
  try {
    if (navigator.share) {
      await navigator.share(data);
      return "";
    }
    await navigator.clipboard.writeText(`${data.text} ${data.url}`);
    return "Copied. Paste it anywhere.";
  } catch {
    return "";
  }
}

/** My deck: progress, rank, the tier filter, every hero (held or locked), and what is missing. */
export function Deck({ deck, tier, onTier, onScan, onCode }) {
  const shown = filterDeck(deck.cards, tier);
  return (
    <section className="gm-panel" aria-label="My deck">
      <h2 className="gm-title">My deck</h2>
      <div className="gm-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={deck.percent} aria-label="Deck progress">
        <i style={{ width: `${deck.percent}%` }} />
      </div>
      <div className="gm-stats">
        <div className="gm-stat">
          <b>{deck.percent}%</b>
          <span>
            {deck.deck} of {deck.total} cards
          </span>
        </div>
        <div className="gm-stat" style={{ gridColumn: "span 2" }}>
          <b>{rankLine(deck.rank, deck.of)}</b>
          <span>Ranked by distinct heroes</span>
        </div>
      </div>
      {deck.complete ? <p className="gm-toast gm-toast--good">Deck complete! You have every hero.</p> : null}
      {!deck.complete && deck.missingLegendary > 0 ? (
        <p className="gm-note">{deck.missingLegendary === 1 ? "You're missing a Legendary card." : `You're missing ${deck.missingLegendary} Legendary cards.`}</p>
      ) : null}
      <div className="gm-row" role="group" aria-label="Filter by tier">
        {["all", ...TIERS].map((t) => (
          <button key={t} type="button" className="gm-chip" aria-pressed={tier === t} onClick={() => onTier(t)}>
            {t === "all" ? "All" : TIER_LABEL[t]}
          </button>
        ))}
      </div>
      <ul className="gm-deck">
        {shown.map((c) => (
          <li key={c.id}>
            <HeroCard hero={c} size="md" locked={!c.held} />
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p className="gm-note">No cards in this tier.</p> : null}
      <div className="gm-row">
        <button type="button" className="gm-btn" onClick={onScan}>
          Scan another player
        </button>
        <button type="button" className="gm-btn gm-btn--ghost" onClick={onCode}>
          My code
        </button>
      </div>
    </section>
  );
}

/** My badge QR and PIN, for others to scan; and the public-name opt-out. */
export function MyCode({ code, isPublic, onPublic, onClose }) {
  return (
    <section className="gm-panel" aria-label="My code">
      <h2 className="gm-title">My code</h2>
      <p className="gm-note">Let another player scan this to swap cards.</p>
      {code?.url ? (
        <div className="gm-qr">
          <QRCodeSVG value={code.url} size={220} marginSize={0} title="My game QR code" />
        </div>
      ) : (
        <p className="gm-note" role="status">
          Loading your code...
        </p>
      )}
      {code?.pin ? (
        <p className="gm-pin" aria-label={`Your PIN is ${code.pin.split("").join(" ")}`}>
          {code.pin}
        </p>
      ) : null}
      <label className="gm-row" style={{ alignItems: "center", minHeight: 44 }}>
        <input type="checkbox" style={{ width: 24, height: 24 }} checked={isPublic} onChange={(e) => onPublic(e.target.checked)} />
        <span>Show my name on the boards</span>
      </label>
      <p className="gm-sub">{isPublic ? "Shown as your first name and last initial." : "Shown as a player number."}</p>
      <button type="button" className="gm-btn gm-btn--ghost" onClick={onClose}>
        Back to my deck
      </button>
    </section>
  );
}

/** Hero Cards, all of it, for a session. `api` is the games API (injected in tests). */
export function CardsGame({ eventId, eventRef, token, names, end, api = gamesApi, collectToken = null, pollMs = POLL_MS }) {
  const gameName = names?.cards?.name || "Hero Cards";
  const [me, setMe] = useState(null);
  const [deck, setDeck] = useState(null);
  const [view, setView] = useState("deck");
  const [fresh, setFresh] = useState(null);
  const [tier, setTier] = useState("all");
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const collected = useRef(false);

  const guard = useCallback(
    (f) => {
      if (sessionOver(f)) end();
      return f;
    },
    [end],
  );

  const refresh = useCallback(async () => {
    try {
      const m = await api.me(eventId, token);
      setMe(m);
      if (m.cards.hero) setDeck(await api.deck(eventId, token));
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

  const reveal = async () => {
    setBusy(true);
    try {
      const hero = await api.reveal(eventId, token);
      setFresh(hero);
      setView("reveal");
      await refresh();
    } catch (f) {
      guard(f);
      setToast({ tone: "bad", text: describeRefusal(f.code, f) });
    }
    setBusy(false);
  };

  const collect = useCallback(
    async (scanned, { quiet = false } = {}) => {
      setView("deck");
      try {
        const r = await api.collect(eventId, token, scanned);
        setToast(collectToast(r));
        await refresh();
      } catch (f) {
        guard(f);
        if (!(quiet && f.code === "SELF_SCAN")) setToast({ tone: f.code === "ALREADY_MET" ? "info" : "bad", text: describeRefusal(f.code, f) });
      }
    },
    [api, eventId, token, guard, refresh],
  );

  // A code opened from the phone's camera app arrives as /g/{token}, then here as ?collect=.
  useEffect(() => {
    if (collectToken && !collected.current && me?.cards.hero) {
      collected.current = true;
      collect(collectToken, { quiet: true });
    }
  }, [collectToken, me, collect]);

  const showCode = async () => {
    setView("code");
    try {
      setCode(await api.code(eventId, token));
    } catch (f) {
      guard(f);
      setToast({ tone: "bad", text: describeRefusal(f.code, f) });
    }
  };

  const setPublic = async (v) => {
    setMe((m) => ({ ...m, public: v }));
    try {
      await api.setPublic(eventId, token, v);
    } catch (f) {
      guard(f);
      setMe((m) => ({ ...m, public: !v }));
      setToast({ tone: "bad", text: describeRefusal(f.code, f) });
    }
  };

  const onScanned = useCallback((scanned) => collect(scanned), [collect]);

  return (
    <main className="gm-wrap">
      <div className="gm-head">
        <h1 className="gm-title">{gameName}</h1>
        {me ? <span className="gm-sub">{me.public ? me.name : `Player #${me.playerNo ?? ""}`}</span> : null}
      </div>
      <Toast toast={toast} />
      {error && !me ? (
        <section className="gm-panel">
          <p className="gm-err" role="alert">
            {error}
          </p>
          <button type="button" className="gm-btn" onClick={refresh}>
            Try again
          </button>
        </section>
      ) : !me ? (
        <p className="gm-note" role="status">
          Loading...
        </p>
      ) : view === "reveal" && fresh ? (
        <Reveal hero={fresh} gameName={gameName} onAdd={() => setView("deck")} />
      ) : !me.cards.hero ? (
        <section className="gm-panel">
          <h2 className="gm-title">Unlock your hero</h2>
          <p className="gm-note">One card, once. The luck of the draw is decided by the game, not your phone.</p>
          <button type="button" className="gm-btn" onClick={reveal} disabled={busy}>
            {busy ? "Unlocking..." : "Reveal my hero"}
          </button>
        </section>
      ) : view === "scan" ? (
        <Scanner onCode={onScanned} onClose={() => setView("deck")} label="Scan another player" />
      ) : view === "code" ? (
        <MyCode code={code} isPublic={me.public} onPublic={setPublic} onClose={() => setView("deck")} />
      ) : deck ? (
        <Deck deck={deck} tier={tier} onTier={setTier} onScan={() => setView("scan")} onCode={showCode} />
      ) : (
        <p className="gm-note" role="status">
          Loading your deck...
        </p>
      )}
      <Link className="gm-btn gm-btn--ghost" href={playPath(eventRef)}>
        All games
      </Link>
    </main>
  );
}

/** /play/{ref}/cards, once the server has found the event. */
export default function CardsPage({ eventId, eventRef }) {
  const params = useSearchParams();
  const collectToken = params?.get("collect") || null;
  return <PlayGate eventId={eventId} eventRef={eventRef}>{(a) => <CardsGame eventId={eventId} eventRef={eventRef} token={a.token} names={a.names} end={a.end} collectToken={collectToken} />}</PlayGate>;
}
