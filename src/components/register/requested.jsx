"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { eventPath } from "@/utils/eventpage";
import { rupees } from "@/utils/register";
import { clubName, requestPath, underReviewNote } from "@/utils/requests";
import Icon from "../discover/icons";
import { Summary } from "./summary";

/**
 * After registering for an event that reviews registrations (registration
 * approval): the registration is under review, and there is no ticket yet.
 * What happens next, said once: the club reviews it, the email came, the
 * ticket (or, for a paid ticket, the link to pay) follows by email if it is
 * confirmed. The registration's own page (/requests/{token}) says where it
 * stands, and is where it can be cancelled.
 *
 * `done`: {kind: "request", request: {id, token, path, status}, name, email,
 * account, pays, amount, ticket_type}, as the form keeps it for a reload.
 *
 * The form sent again, signed out, for an address with an open registration
 * already: the API answers with that registration but without its link
 * (whoever typed the address hasn't shown it is theirs), and emails the link
 * to the address again instead. Then this says "You've already registered",
 * and has no "See your registration". One the club has confirmed already
 * says that instead.
 */
export default function Requested({ event, club, done }) {
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const path = done.request?.path || requestPath(done.request?.token);
  const confirmed = done.request?.status === "approved";
  // Sent again, signed out: no link came back, so it was emailed again.
  const again = !path && !confirmed;
  const email = done.email ? <strong>{done.email}</strong> : null;

  let title = <>You&rsquo;re registered!</>;
  let text = <p className="rg-closed-text">{underReviewNote(club)}</p>;
  if (confirmed) {
    title = "Your registration is confirmed";
    text = (
      <p className="rg-closed-text">
        You registered for <strong>{event.name}</strong> already, and {clubName(club, { start: false })} has confirmed it. Your ticket, or the link to pay
        for it, is in your email.
      </p>
    );
  } else if (again) {
    title = <>You&rsquo;ve already registered</>;
    text = (
      <p className="rg-closed-text">
        We&rsquo;ve emailed the link to your registration{email ? <> to {email}</> : null} again.
      </p>
    );
  }

  return (
    <div className="rg-layout">
      <Summary event={event} club={club} />
      <div className="rg-main">
        <div className="rg-closed rq-sent">
          <span className="rg-closed-icon" aria-hidden="true">
            <Icon name="mail" size={26} />
          </span>
          <h1 className="rg-h1" ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {text}
          {confirmed || again ? null : (
            <p className="rq-mine rq-emailed">
              <Icon name="mail" size={16} />
              <span>
                We&rsquo;ve emailed you a link to check on your registration{email ? <>, at {email}</> : null}.
              </span>
            </p>
          )}
          {done.pays && !confirmed ? (
            <p className="rg-closed-text">
              Nothing has been charged. If yours is confirmed, we&rsquo;ll email you a link to pay{done.amount > 0 ? ` ${rupees(done.amount)}` : ""}.
            </p>
          ) : null}
          <dl className="rg-dl rq-facts">
            {done.name ? (
              <div>
                <dt>Name</dt>
                <dd>{done.name}</dd>
              </div>
            ) : null}
            {done.email ? (
              <div>
                <dt>Email</dt>
                <dd>{done.email}</dd>
              </div>
            ) : null}
            {done.ticket_type ? (
              <div>
                <dt>Ticket</dt>
                <dd>{done.ticket_type}</dd>
              </div>
            ) : null}
          </dl>
          {done.account ? (
            <p className="rq-mine">
              <Icon name="ticket" size={16} />
              <span>
                It&rsquo;s in <Link href="/me/tickets">My tickets</Link> too, under &ldquo;Under review&rdquo;.
              </span>
            </p>
          ) : null}
          <div className="rg-closed-actions">
            {path ? (
              <Link className="dc-btn" href={path}>
                See your registration
              </Link>
            ) : null}
            <Link className={`dc-btn${path ? " dc-btn--ghost" : ""}`} href={eventPath(event)}>
              Back to the event
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
