"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { liveEntries, onSale, typeNote, typePrice, waitlistTypes } from "@/utils/ticketing";
import { LinkedTicketGone, ticketQuery, useEventTicketing, useTicketLink, WaitlistPanel } from "./tickets";

/**
 * The event page's tickets (a client island in the server-rendered page):
 * read in the browser once the page is up, so the page stays the same HTML
 * for everyone. It shows only what there is:
 *
 *   several ticket types   each with its price and what can be done with it
 *                          now; one on sale links to the form with it chosen
 *   a waiting list         the viewer's own places in line (and leaving
 *                          them), and joining it for a sold-out type
 *
 * and nothing at all for an event with one ticket and no line, an ended or
 * cancelled event, or a server without ticket types. A hidden type named by
 * the page's address (`?ticket_type=`, with the `ticket_key` its link
 * carries) is listed too, and its "Choose" keeps the key. A link naming a
 * ticket the list doesn't have says so.
 *
 * The register card's button (registercta.jsx) asks to join with
 * askToJoin(): this opens the form and comes into view.
 *
 * An event that reviews registrations (`approval`, or its tickets say
 * so) has no waiting list: none is offered or mentioned here.
 */

export const JOIN_EVENT = "moa:join-waitlist";

/** Opens the event page's waiting-list form (`typeId`: for that ticket). */
export function askToJoin(eventId, typeId = null) {
  try {
    window.dispatchEvent(new CustomEvent(JOIN_EVENT, { detail: { eventId: String(eventId), typeId } }));
  } catch {
    /* not in a browser */
  }
}

export function EventTickets({ eventId, kind, registerHref = null, approval = false }) {
  const { type: linked, key: linkedKey } = useTicketLink();
  const enabled = kind !== "ended" && kind !== "cancelled";
  const { ticketing, reload } = useEventTicketing(eventId, { enabled, ticketType: linked, ticketKey: linkedKey });
  const [open, setOpen] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    const onAsk = (e) => {
      if (String(e.detail?.eventId) !== String(eventId)) return;
      setOpen({ typeId: e.detail?.typeId ?? null });
      try {
        box.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      } catch {
        /* not in a browser */
      }
    };
    window.addEventListener(JOIN_EVENT, onAsk);
    return () => window.removeEventListener(JOIN_EVENT, onAsk);
  }, [eventId]);

  if (!ticketing) return null;
  const several = ticketing.types.length > 1;
  const noLine = approval || ticketing.requiresApproval;
  const joinable = noLine ? [] : waitlistTypes(ticketing);
  const inLine = liveEntries(ticketing.viewerWaitlist);
  const gone = linked !== null && !ticketing.types.some((t) => t.id === linked);
  if (!several && !joinable.length && !inLine.length && !gone) return null;
  const choose = (t) =>
    registerHref && onSale(t) && (kind === "open" || kind === "live") ? `${registerHref}?${ticketQuery(t.id, { linked, key: linkedKey })}` : null;

  return (
    <section id="tickets" ref={box} className="ep-section ep-tickets" aria-labelledby="tickets-title">
      <div className="ep-section-head">
        <h2 className="ep-h2" id="tickets-title">
          Tickets
        </h2>
      </div>
      <LinkedTicketGone ticketing={ticketing} linked={linked} />
      {several ? (
        <ul className="ep-tt-list">
          {ticketing.types.map((t) => {
            const note = typeNote(noLine ? { ...t, waitlist: false } : t);
            const href = choose(t);
            return (
              <li key={t.id} className={`ep-tt${onSale(t) ? "" : " is-off"}`}>
                <div className="ep-tt-main">
                  <p className="ep-tt-name">
                    {t.name}
                    {t.isHidden ? <span className="ep-tt-tag">Shared with you</span> : null}
                  </p>
                  {t.description ? <p className="ep-tt-desc">{t.description}</p> : null}
                  {note ? <p className={`ep-tt-note${note.tone ? ` is-${note.tone}` : ""}`}>{note.text}</p> : null}
                </div>
                <div className="ep-tt-side">
                  <p className="ep-tt-price">{typePrice(t)}</p>
                  {href ? (
                    <Link className="ep-tt-go" href={href} aria-label={`Register with ${t.name}`}>
                      Choose
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <WaitlistPanel
        eventId={String(eventId)}
        ticketing={ticketing}
        open={open}
        onChanged={reload}
        headingLevel={3}
        approval={noLine}
        ticketLink={{ type: linked, key: linkedKey }}
      />
    </section>
  );
}
