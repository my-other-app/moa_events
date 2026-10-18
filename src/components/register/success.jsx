import { useEffect, useRef } from "react";
import { Link } from "@/lib/router";
import { QRCodeSVG } from "qrcode.react";
import { eventPath, eventUrl, scheduleLines } from "@/utils/eventpage";
import { rupees } from "@/utils/register";
import { StoreButtons } from "../discover/bits";
import { CalendarButton, EpIcon, ShareButton } from "../discover/eventparts";
import Icon from "../discover/icons";
import { Thumb } from "./summary";

/**
 * After the registration (and the payment, when there was one): the ticket
 * right here — the same QR the door scans, and the full ticket a tap away —
 * the calendar and sharing, and where the ticket lives from now on: in the
 * account, for someone who registered signed in; otherwise their email, and
 * the app once they sign in to it.
 */
export default function Success({ event, club, ticket }) {
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const url = eventUrl(event);
  const sched = scheduleLines(event);
  const where = event.is_online ? "Online" : event.location_name || "Venue to be announced";
  const first = String(ticket.name || "").trim().split(/\s+/)[0];
  const ticketPath = `/tickets/${encodeURIComponent(ticket.ticket_id)}`;

  return (
    <div className="rg-done">
      <div className="rg-done-main">
        <span className="rg-done-badge" aria-hidden="true">
          <EpIcon name="check" size={26} />
        </span>
        <h1 className="rg-done-title" ref={heading} tabIndex={-1}>
          <span>You&rsquo;re in</span>
        </h1>
        <p className="rg-done-lede">
          {first ? `${first}, your` : "Your"} spot at <strong>{event.name}</strong> is confirmed
          {ticket.paid && ticket.amount > 0 ? <> and your payment of {rupees(ticket.amount)} went through</> : null}.
        </p>

        <div className="rg-done-actions">
          <CalendarButton event={event} url={url} />
          <ShareButton title={event.name} text={`I'm going to ${event.name}${club?.name ? ` by ${club.name}` : ""}. Join me?`} url={url} />
        </div>

        {ticket.account ? (
          <div className="rg-done-app ac-inapp">
            <span className="rg-done-app-icon" aria-hidden="true">
              <Icon name="phone" size={20} />
            </span>
            <div>
              <p className="rg-done-app-title">It&rsquo;s in your MyOtherApp app</p>
              <p className="rg-done-app-text">
                This ticket is saved to your account, <strong className="rg-done-email">{ticket.account}</strong>: open it in the app on your phone, or in My
                tickets here. A copy is in your email too.
              </p>
              <div className="ac-inapp-links">
                <Link className="dc-btn dc-btn--sm" to="/me/tickets">
                  My tickets
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="rg-done-app">
            <span className="rg-done-app-icon" aria-hidden="true">
              <Icon name="mail" size={20} />
            </span>
            <div>
              <p className="rg-done-app-title">Your ticket is also in your email.</p>
              <p className="rg-done-app-text">
                Sign in to the MyOtherApp app with <strong className="rg-done-email">{ticket.email}</strong> to keep all your tickets in one place.
              </p>
              <StoreButtons />
            </div>
          </div>
        )}

        <p className="rg-done-more">
          <Link to={eventPath(event)}>Back to the event</Link>
          <span aria-hidden="true">·</span>
          <Link to="/events">Find more events</Link>
        </p>
      </div>

      <section className="rg-ticket" aria-label="Your ticket">
        <div className="rg-ticket-top">
          <Thumb event={event} className="rg-ticket-thumb" />
          <div className="rg-ticket-id">
            <p className="rg-ticket-kicker">Ticket</p>
            <p className="rg-ticket-name">{event.name}</p>
            {club?.name ? <p className="rg-ticket-club">by {club.name}</p> : null}
          </div>
        </div>
        <dl className="rg-ticket-facts">
          {sched ? (
            <div>
              <dt>When</dt>
              <dd>
                <time dateTime={event.starts_at}>{sched.day}</time>
                <span>{sched.time}</span>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Where</dt>
            <dd>{where}</dd>
          </div>
          <div>
            <dt>Name</dt>
            <dd>{ticket.name}</dd>
          </div>
        </dl>
        <div className="rg-ticket-bottom">
          <div className="rg-ticket-qr">
            <QRCodeSVG value={String(ticket.ticket_id)} size={132} level="H" marginSize={0} title={`QR code for ticket ${ticket.ticket_id}`} />
          </div>
          <div className="rg-ticket-code">
            <p className="rg-ticket-kicker">Ticket ID</p>
            <p className="rg-ticket-number">{ticket.ticket_id}</p>
            <p className="rg-ticket-hint">Show this at the entrance.</p>
            <Link className="dc-btn rg-ticket-open" to={ticketPath}>
              View ticket
              <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
