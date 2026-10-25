"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { liveEntries, onSale, typeNote, typePrice, waitlistTypes } from "@/utils/ticketing";
import { useEventTicketing, useLinkedType, WaitlistPanel } from "./tickets";

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
 * the page's address (`?ticket_type=`) is listed too.
 *
 * The register card's button (registercta.jsx) asks to join with
 * askToJoin(): this opens the form and comes into view.
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

export function EventTickets({ eventId, kind, registerHref = null }) {
  const linked = useLinkedType();
  const enabled = kind !== "ended" && kind !== "cancelled";
  const { ticketing, reload } = useEventTicketing(eventId, { enabled, ticketType: linked });
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
  const joinable = waitlistTypes(ticketing);
  const inLine = liveEntries(ticketing.viewerWaitlist);
  if (!several && !joinable.length && !inLine.length) return null;
  const choose = (t) => (registerHref && onSale(t) && (kind === "open" || kind === "live") ? `${registerHref}?ticket_type=${t.id}` : null);

  return (
    <section id="tickets" ref={box} className="ep-section ep-tickets" aria-labelledby="tickets-title">
      <div className="ep-section-head">
        <h2 className="ep-h2" id="tickets-title">
          Tickets
        </h2>
      </div>
      {several ? (
        <ul className="ep-tt-list">
          {ticketing.types.map((t) => {
            const note = typeNote(t);
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
      <WaitlistPanel eventId={String(eventId)} ticketing={ticketing} open={open} onChanged={reload} headingLevel={3} />
    </section>
  );
}
