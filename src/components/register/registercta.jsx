"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { eventsApi } from "@/api/events";
import { useAuth } from "@/auth/context";
import { myRegistration } from "@/utils/register";
import { clubName } from "@/utils/requests";
import { liveEntries, waitlistTypes } from "@/utils/ticketing";
import { askToJoin } from "./eventtickets";
import { FinishPaymentButton } from "./finishpayment";
import { useEventTicketing, useLinkedType } from "./tickets";

/**
 * The event page's register button (inside its server-rendered register
 * card), made personal once the browser knows who is reading. The page is
 * the same HTML for everyone, so the first paint is always the button the
 * server drew from the event's state (`state`: registerState's kind, label,
 * href and `also`). Then, signed in:
 *
 *   waiting for payment   Finish payment, right here (no form; past the
 *                         deadline too, until the event ends)
 *   registered            View your ticket (on a live event, the live room
 *                         stays first and the ticket is the second link)
 *
 * and, for anyone, from the event's tickets (docs/TICKETING.md):
 *
 *   sold out, with a waiting list   Join the waiting list (the page's
 *                                   tickets section opens its form)
 *   in line already                 You're on the waiting list
 *   a link naming a hidden type     Register keeps `?ticket_type=`
 *
 * and, signed in, for an event whose club confirms each place
 * (registration approval), the viewer's own open request
 * (`ticketing.viewer_request`): "View your request" (waiting for the club),
 * or "Pay for your ticket" (confirmed, not yet paid), both to its page.
 *
 * GET /events/info/{id} is asked only for someone signed in; a cancelled or
 * ended event asks nothing.
 */
export function RegisterGo({ eventId, state, club = null }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const ended = state.kind === "ended" || state.kind === "cancelled";
  const [mine, setMine] = useState(null);
  const [paidNow, setPaidNow] = useState(false);
  const [look, setLook] = useState(0);
  const who = signedIn ? auth.user?.email || "account" : "";
  const linked = useLinkedType();
  const { ticketing } = useEventTicketing(eventId, { enabled: state.kind === "open" || state.kind === "full", ticketType: linked });

  useEffect(() => {
    if (!who || ended) {
      setMine(null);
      return undefined;
    }
    let alive = true;
    Promise.resolve(eventsApi.fetchEvent(String(eventId)))
      .then((info) => alive && setMine(myRegistration(info)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [eventId, who, ended, look]);

  const ticketHref = mine?.ticketId ? `/tickets/${encodeURIComponent(mine.ticketId)}` : null;

  if (mine?.state === "unpaid") {
    return (
      <>
        <FinishPaymentButton
          eventId={eventId}
          registrationId={mine.registrationId}
          className="dc-btn ep-cta-btn"
          onPaid={() => {
            setPaidNow(true);
            setLook((n) => n + 1);
          }}
        />
        <p className="ep-cta-mine">Your registration is waiting for payment.</p>
      </>
    );
  }

  if (mine?.state === "registered" && ticketHref) {
    const line = paidNow ? "Payment received — you're in." : "You're registered.";
    if (state.kind === "live" && state.href) {
      return (
        <>
          <Link className="dc-btn ep-cta-btn" href={state.href}>
            {state.label}
          </Link>
          <Link className="ep-cta-also" href={ticketHref}>
            Your ticket
          </Link>
        </>
      );
    }
    return (
      <>
        <Link className="dc-btn ep-cta-btn" href={ticketHref}>
          View your ticket
        </Link>
        <p className="ep-cta-mine" role="status">
          {line}
        </p>
      </>
    );
  }

  // The club confirms each place, and the viewer has asked for one already: where it stands.
  const asked = ticketing?.viewerRequest || null;
  if (asked) {
    const confirmed = asked.status === "approved";
    return (
      <>
        {asked.path ? (
          <Link className={`dc-btn ep-cta-btn${confirmed ? "" : " dc-btn--ghost"}`} href={asked.path}>
            {confirmed ? "Pay for your ticket" : "View your request"}
          </Link>
        ) : (
          <button type="button" className="dc-btn ep-cta-btn" disabled>
            Request sent
          </button>
        )}
        <p className="ep-cta-mine" role="status">
          {confirmed
            ? `${clubName(club)} confirmed your place. Pay to get your ticket.`
            : `Waiting for ${clubName(club, { start: false })} to confirm your place.`}
        </p>
      </>
    );
  }

  // Sold out (the page's state, or the tickets read just now): the waiting list, when there is one.
  const soldOut = state.kind === "full" || (state.kind === "open" && ticketing?.soldOut === true);
  if (soldOut && ticketing) {
    const inLine = liveEntries(ticketing.viewerWaitlist);
    if (inLine.length) {
      return (
        <>
          <a className="dc-btn dc-btn--ghost ep-cta-btn" href="#tickets">
            You&rsquo;re on the waiting list
          </a>
          <p className="ep-cta-mine" role="status">
            {inLine.some((e) => e.status === "offered") ? "A place is held for you: check your email." : "We'll email you if a place opens up."}
          </p>
        </>
      );
    }
    if (waitlistTypes(ticketing).length) {
      return (
        <>
          <a
            className="dc-btn ep-cta-btn"
            href="#tickets"
            onClick={(e) => {
              e.preventDefault();
              askToJoin(eventId);
            }}
          >
            Join the waiting list
          </a>
          <p className="ep-cta-mine">Sold out: get a link if a place opens up.</p>
        </>
      );
    }
    if (state.kind === "open") {
      return (
        <button type="button" className="dc-btn ep-cta-btn" disabled>
          Sold out
        </button>
      );
    }
  }

  // A link naming a hidden ticket type: the form opens with it.
  const href = state.href && linked && state.kind === "open" ? `${state.href}?ticket_type=${linked}` : state.href;
  return (
    <>
      {href ? (
        <Link className="dc-btn ep-cta-btn" href={href}>
          {state.label}
        </Link>
      ) : (
        <button type="button" className="dc-btn ep-cta-btn" disabled>
          {state.label}
        </button>
      )}
      {state.also ? (
        <Link className="ep-cta-also" href={state.also.href}>
          {state.also.label}
        </Link>
      ) : null}
    </>
  );
}
