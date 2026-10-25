"use client";

import { useEffect, useState } from "react";
import { discoverApi } from "@/api/discover";
import { CANCELLED_TITLE, REFUND_DETAIL, REFUND_NOTE, cancelledLine, parseCancellation } from "@/utils/cancelled";

/**
 * A cancelled event, where a ticket is shown: the ticket's own page and My
 * tickets. Neither the ticket (GET /events/tickets/{id}) nor the list of
 * one's registrations (GET /events/list?is_registered=true) says whether
 * the event was called off, so each event's public page (GET
 * /discover/events/{slug}, kept a minute by api/discover.js) is asked, and
 * says "cancelled" with the club's reason. A row that already carries
 * `status` and `cancellation` (a newer API) is taken as it is.
 */

/** The state of each event named, by slug: {status, cancellation}. Events whose page can't be read are left out. */
export function useEventStates(slugs) {
  const key = Array.from(new Set(slugs.filter(Boolean))).sort().join("|");
  const [states, setStates] = useState({});
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    for (const slug of key.split("|")) {
      Promise.resolve()
        .then(() => discoverApi.event(slug))
        .then(
          (page) => {
            if (!alive || !page?.event) return;
            setStates((s) => ({ ...s, [slug]: { status: page.event.status, cancellation: page.event.cancellation || null } }));
          },
          () => {},
        );
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return states;
}

/** What a row or a ticket says of its own event's state, when it says anything (`status`, `cancellation`). */
export function ownState(event) {
  if (!event || event.status !== "cancelled") return null;
  return { status: "cancelled", cancellation: parseCancellation(event.cancellation) };
}

/**
 * "This event was cancelled", the club's reason, and for a ticket that was
 * paid for, that the money is on its way back.
 */
export function CancelledNote({ cancellation, paid = false, compact = false, className = "" }) {
  const c = cancellation || {};
  return (
    <div className={`cx-note${compact ? " is-compact" : ""} ${className}`} role="status">
      <p className="cx-title">{CANCELLED_TITLE}</p>
      {c.reason ? (
        <p className="cx-reason">
          <span>The organisers said:</span> {c.reason}
        </p>
      ) : null}
      {compact ? null : <p className="cx-when">{cancelledLine(c)}. This ticket is no longer valid.</p>}
      {paid ? (
        <p className="cx-refund">
          <strong>{REFUND_NOTE}</strong>
          {compact ? null : <> {REFUND_DETAIL}</>}
        </p>
      ) : null}
    </div>
  );
}
