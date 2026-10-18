"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { eventsApi } from "@/api/events";
import { useAuth } from "@/auth/context";
import { myRegistration } from "@/utils/register";
import { FinishPaymentButton } from "./finishpayment";

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
 * GET /events/info/{id} is asked only for someone signed in.
 */
export function RegisterGo({ eventId, state }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const ended = state.kind === "ended";
  const [mine, setMine] = useState(null);
  const [paidNow, setPaidNow] = useState(false);
  const [look, setLook] = useState(0);
  const who = signedIn ? auth.user?.email || "account" : "";

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

  return (
    <>
      {state.href ? (
        <Link className="dc-btn ep-cta-btn" href={state.href}>
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
