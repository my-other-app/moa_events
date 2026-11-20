"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { questsApi } from "@/api/quests";
import { useAuth } from "@/auth/context";
import { hasGuest } from "@/auth/session";
import { codeDoneLine, describeCodeRefusal, describeSizeRefusal, questView, whatsNew, withChoices, withClaim } from "@/utils/quests";
import { minutesWord } from "@/utils/questwords";
import { useAndroid } from "../profiles/openinapp";
import { QuestView } from "./questview";

/** While the card is on screen and the quest is on, it is read again this often (the server ticks tasks as they happen). */
export const REFRESH_MS = 2 * 60 * 1000;
/** Coming back to the tab (after a scan at a booth, a quiz in the live room) reads it again, at most this often. */
export const REVISIT_MS = 20 * 1000;

const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

/**
 * The guest's quest card for an event, read with the token that opens the
 * ticket (questsApi.card): null until it has answered, and null for "no
 * quest" (off, none, an API without quests). Read again every REFRESH_MS
 * while the page is in view and the quest is on, and when the guest comes
 * back to the tab; a read that fails keeps what is shown. `who` changes
 * when someone signs in or out here: the card is theirs, so it is read again.
 */
export function useQuestCard(eventId, { skip = false, who = "", load = questsApi.card } = {}) {
  const [card, setCard] = useState(null);
  const [fresh, setFresh] = useState({ ids: new Set(), line: "" });
  const last = useRef(0);
  const shown = useRef(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    shown.current = card;
  }, [card]);

  useEffect(() => {
    if (!eventId || skip) {
      setCard(null);
      return undefined;
    }
    let alive = true;
    last.current = Date.now();
    Promise.resolve()
      .then(() => load(eventId))
      .then(
        (next) => {
          if (!alive) return;
          setFresh(whatsNew(shown.current, next));
          setCard(next);
        },
        () => {},
      );
    return () => {
      alive = false;
    };
  }, [eventId, skip, who, tick, load]);

  // Read again while it's open on screen, and on coming back to the tab.
  const on = Boolean(card?.open && card?.me);
  useEffect(() => {
    if (!on) return undefined;
    const timer = setInterval(() => visible() && reload(), REFRESH_MS);
    const back = () => {
      if (visible() && Date.now() - last.current > REVISIT_MS) reload();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [on, reload]);

  return { card, setCard, reload, fresh };
}

/**
 * The card's actions (a code, a size) and its lock after too many wrong
 * codes, around a parsed card.
 */
function useQuestActions(eventId, card, setCard, reload) {
  const [lockUntil, setLockUntil] = useState(0);
  const [, setNow] = useState(0);

  // Once the lock is over, the card is read again (it says how many tries are left).
  useEffect(() => {
    if (!lockUntil) return undefined;
    const wait = Math.max(0, lockUntil - Date.now());
    const t = setTimeout(() => {
      setLockUntil(0);
      setNow(Date.now());
      reload();
    }, wait);
    return () => clearTimeout(t);
  }, [lockUntil, reload]);

  const mode = card?.mode || "checkmarks";
  const onCode = useCallback(
    async (code) => {
      try {
        const answer = await questsApi.code(eventId, code);
        if (answer.card) setCard(answer.card);
        else reload();
        return codeDoneLine(answer, mode);
      } catch (error) {
        const said = describeCodeRefusal(error);
        if (said.lockFor) setLockUntil(Date.now() + said.lockFor * 1000);
        if (said.reload) reload();
        return said;
      }
    },
    [eventId, mode, setCard, reload],
  );

  const onPickSize = useCallback(
    async (reward, label) => {
      if (!reward.claimId) return null;
      try {
        const claim = await questsApi.size(eventId, reward.claimId, label);
        setCard((c) => withClaim(c, reward.id, claim));
        return { tone: "good", line: `Size ${claim.size || label} kept for you.` };
      } catch (error) {
        const said = describeSizeRefusal(error);
        if (said.choices) setCard((c) => withChoices(c, reward.id, said.choices));
        if (said.reload) reload();
        return said;
      }
    },
    [eventId, setCard, reload],
  );

  const locked = lockUntil > Date.now() ? `Too many wrong codes. Try again in ${minutesWord((lockUntil - Date.now()) / 1000)}.` : null;
  return { onCode, onPickSize, locked };
}

/** The card laid out, with its actions; nothing at all for no card. */
function QuestCardBody({ card, ctx, eventId, setCard, reload, fresh }) {
  const { onCode, onPickSize, locked } = useQuestActions(eventId, card, setCard, reload);
  const loadBoard = useCallback(() => questsApi.leaderboard(eventId), [eventId]);
  const view = useMemo(() => questView(card, ctx), [card, ctx]);
  const shownView = locked ? { ...view, codeLock: view.codeLock || locked } : view;
  return <QuestView quest={shownView} where={ctx.where} onCode={onCode} onPickSize={onPickSize} loadBoard={loadBoard} fresh={fresh} />;
}

/**
 * Under the ticket (components/ticket.jsx): the holder's quest for the
 * ticket's event. Nothing for a quest that's off, an API without quests,
 * or a card that isn't the holder's (no `me`: the ticket is shown with a
 * token that isn't registered for the event). `skip` for a called-off event
 * or a revoked ticket, as the poster button.
 */
export function TicketQuests({ ticketId, event, skip = false }) {
  const auth = useAuth();
  const android = useAndroid();
  const eventId = event?.id ?? null;
  const signedIn = auth.ready && auth.status === "signed-in";
  const who = signedIn ? auth.user?.email || "account" : "";
  const { card, setCard, reload, fresh } = useQuestCard(eventId === null ? null : String(eventId), { skip, who });
  const ctx = useMemo(
    () => ({ where: "ticket", eventId: eventId === null ? null : String(eventId), event: eventId !== null ? { id: eventId, slug: event?.slug || null } : null, ticketId, android, signedIn }),
    [eventId, event?.slug, ticketId, android, signedIn],
  );
  if (!card || !card.me) return null;
  return <QuestCardBody card={card} ctx={ctx} eventId={String(eventId)} setCard={setCard} reload={reload} fresh={fresh} />;
}

/**
 * On the event's page (components/discover/eventpage.jsx), between its
 * tickets and its About: a guest with a ticket sees their quest; anyone
 * else, what the quest is and how to take part. Read in the browser (the
 * page's HTML is the same for everyone). Nothing for a called-off event,
 * and nothing for an ended one unless someone who may have taken part is
 * reading (signed in, or holding a registration's guest token).
 */
export function EventQuests({ event, clubSlug = null, canRegister = false }) {
  const auth = useAuth();
  const android = useAndroid();
  const signedIn = auth.ready && auth.status === "signed-in";
  const who = signedIn ? auth.user?.email || "account" : "";
  // Whether this browser holds a registration's guest token: known once the page is in the browser.
  const [guest, setGuest] = useState(null);
  useEffect(() => {
    setGuest(hasGuest());
  }, [who]);
  const cancelled = event.status === "cancelled";
  const ended = event.status === "ended";
  // Wait for the browser to say who is reading, so the card is read once, with the right token.
  const skip = cancelled || (auth.enabled && !auth.ready) || guest === null || (ended && !signedIn && !guest);
  const eventId = String(event.id);
  const { card, setCard, reload, fresh } = useQuestCard(eventId, { skip, who: `${who}|${guest ? "g" : ""}` });
  const ctx = useMemo(
    () => ({ where: "event", eventId, event: { id: event.id, slug: event.slug || null }, clubSlug, android, signedIn, canRegister }),
    [eventId, event.id, event.slug, clubSlug, android, signedIn, canRegister],
  );
  if (!card) return null;
  if (!card.me && (ended || card.tasks.length === 0)) return null;
  return <QuestCardBody card={card} ctx={ctx} eventId={eventId} setCard={setCard} reload={reload} fresh={fresh} />;
}
