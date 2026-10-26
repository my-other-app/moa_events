"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { eventPath } from "@/utils/eventpage";
import { rupees } from "@/utils/register";
import { clubName, requestPath } from "@/utils/requests";
import Icon from "../discover/icons";
import { Summary } from "./summary";

/**
 * After sending the form for an event whose club confirms each place
 * (registration approval): nobody is registered yet, and there is no
 * ticket. What happens next, said once: the club decides, the email came,
 * the ticket (or, for a paid ticket, the link to pay) follows by email. The
 * request's own page (/requests/{token}) says where it stands, and is where
 * it can be withdrawn.
 *
 * `done`: {kind: "request", request: {id, token, path, status}, name, email,
 * account, pays, amount, ticket_type}, as the form keeps it for a reload.
 */
export default function Requested({ event, club, done }) {
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const who = clubName(club);
  const path = done.request?.path || requestPath(done.request?.token);

  return (
    <div className="rg-layout">
      <Summary event={event} club={club} />
      <div className="rg-main">
        <div className="rg-closed rq-sent">
          <span className="rg-closed-icon" aria-hidden="true">
            <Icon name="mail" size={26} />
          </span>
          <h1 className="rg-h1" ref={heading} tabIndex={-1}>
            You&rsquo;re on the waiting list
          </h1>
          <p className="rg-closed-text">
            {who} confirms each registration. We&rsquo;ve emailed you, and your ticket will come by email as soon as they confirm your place.
          </p>
          {done.pays ? (
            <p className="rg-closed-text">
              Nothing has been charged. If they confirm, the email has a link to pay{done.amount > 0 ? ` ${rupees(done.amount)}` : ""}.
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
                It&rsquo;s in <Link href="/me/tickets">My tickets</Link> too, under Waiting for confirmation.
              </span>
            </p>
          ) : null}
          <div className="rg-closed-actions">
            {path ? (
              <Link className="dc-btn" href={path}>
                See your request
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
