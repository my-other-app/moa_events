"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { eventsApi } from "@/api/events";
import { competitionApi } from "@/api/competition";
import { QRCodeCanvas } from "qrcode.react";
import Download from "@/components/download";
import { formatDate, formatPrice, formatTime } from "@/utils/format";
import { loadDone } from "@/utils/register";
import { ticketTypeName } from "@/utils/ticketing";
import { CancelledNote, ownState, useEventStates } from "./cancelled";

/**
 * The ticket's type (docs/TICKETING.md), when the event sells more than one:
 * from the ticket when the API says it, else from the registration this tab
 * just made (the form keeps it until the page is left). Null otherwise: a
 * single-type event's ticket reads as it always did.
 */
function typeOfTicket(ticket, ticketid) {
  const said = ticketTypeName(ticket);
  if (said) return said;
  const id = ticket?.event?.id;
  const kept = id !== undefined && id !== null ? loadDone(String(id)) : null;
  return kept && String(kept.ticket_id) === String(ticketid) && typeof kept.ticket_type === "string" ? kept.ticket_type : null;
}

/** Paid for (so refunded when the event is cancelled): a paid ticket that isn't waiting for its payment. */
const wasPaid = (ticket) => ticket?.is_paid !== false && (Number(ticket?.paid_amount) > 0 || (Boolean(ticket?.event?.has_fee) && Number(ticket?.actual_amount) > 0));

/**
 * What kind of ticket it is. The API has no ticket tiers: a ticket is free,
 * paid (for what was paid), or waiting for its payment (the door refuses
 * that one until it is paid).
 */
export function ticketKind(ticket) {
  const fee = Number(ticket?.actual_amount);
  const paidEvent = Boolean(ticket?.event?.has_fee) || (Number.isFinite(fee) && fee > 0);
  if (!paidEvent) return "Free";
  if (ticket?.is_paid === false) return "Payment pending";
  const paid = Number(ticket?.paid_amount ?? ticket?.actual_amount);
  return Number.isFinite(paid) && paid > 0 ? `Paid · ${formatPrice(true, paid)}` : "Paid";
}

/** The event's own page, where its guidelines are; null when the ticket doesn't say which event. */
function eventPageOf(event) {
  if (event?.slug) return `/events/${encodeURIComponent(event.slug)}`;
  if (event?.id !== undefined && event?.id !== null) return `/${event.id}`;
  return null;
}

/**
 * A ticket, from the link in its email or My tickets. Its server half
 * (src/app/tickets/[ticketid]/page.jsx) hands over the id; the ticket itself
 * is read in the browser, with the token that may open it (the account's, or
 * the guest token the registration left). The date and time are India
 * time, whatever the offset the API wrote them in and the visitor's clock.
 */
const Ticket = ({ ticketid }) => {
  const [competition, setCompetition] = useState(null);
  const [ticketData, setTicketData] = useState(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const id = ticketData?.event?.id;
    if (!id) return;
    let alive = true;
    competitionApi.leaderboard(id).then((b) => alive && setCompetition(b)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [ticketData?.event?.id]);

  useEffect(() => {
    if (!ticketid) return;
    setError(false);
    const getTicketDetails = async () => {
      const data = await eventsApi.fetchTicketDetails(ticketid);
      if (data) {
        setTicketData(data);
      } else {
        setError(true);
      }
    };

    getTicketDetails();
  }, [ticketid, retryCount]);

  // Whether the event was called off: the ticket doesn't say, its event's public page does.
  const slug = ticketData?.event?.slug || null;
  const states = useEventStates(slug && !ownState(ticketData?.event) ? [slug] : []);
  const state = ownState(ticketData?.event) || (slug ? states[slug] : null) || null;
  const cancelled = state?.status === "cancelled";


  if (error) {
    return (
      <div className="ticket-container">
        <p>Failed to load ticket details. Please check your connection and try again.</p>
        <button className="download-button" onClick={() => setRetryCount((c) => c + 1)}>
          RETRY
        </button>
      </div>
    );
  }

  if (!ticketData) {
    return <div>Loading ticket details...</div>;
  }

  const startsAt = ticketData.event?.event_datetime;
  const time = formatTime(startsAt);
  const eventPage = eventPageOf(ticketData.event);
  const typeName = typeOfTicket(ticketData, ticketid);
  const kind = ticketKind(ticketData);

  return (
    <div className="ticket-container">
      {cancelled ? <CancelledNote cancellation={state.cancellation} paid={wasPaid(ticketData)} className="ticket-cancelled" /> : null}
      <div
        className={`ticket${cancelled ? " is-cancelled" : ""}`}
        id="ticket"
        style={{
          background: `url(${ticketData.event?.poster?.original || ""}) no-repeat center center`,
          backgroundSize: "cover",
        }}
      >
        <div className="ticket-header">
          <h1>{ticketData.event?.name || "N/A"}</h1>
        </div>

        <div className="ticket-info-grid">
          <div className="ticket-info">
            <span className="ticket-info-label">Date</span>
            <span className="ticket-info-value">{formatDate(startsAt) || "N/A"}</span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Time</span>
            <span className="ticket-info-value">{time ? `${time} IST` : "N/A"}</span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Location</span>
            <span className="ticket-info-value">{ticketData.event?.is_online ? "Online" : ticketData.event?.location_name || "N/A"}</span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Ticket ID</span>
            <span className="ticket-info-value">{ticketid || "N/A"}</span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Ticket Holder Name</span>
            <span className="ticket-info-value">{ticketData.user?.full_name || "N/A"}</span>
          </div>

          <div className="ticket-info">
            <span className="ticket-info-label">Ticket Type</span>
            <span className="ticket-info-value">{cancelled ? "Cancelled" : typeName ? `${typeName} · ${kind}` : kind}</span>
          </div>
        </div>

        {eventPage ? (
          <div className="guidelines">
            <Link href={`${eventPage}#guidelines`} className="guidelines-link">
              Check Out Guidelines
            </Link>
          </div>
        ) : null}

        <div className="ticket-divider"></div>

        {cancelled ? (
          // No QR for an event that isn't happening: nothing to scan at a door.
          <div className="qr-section qr-section--void">
            <p className="ticket-void">Cancelled</p>
            <p className="qr-info">This event was called off, so this ticket is no longer valid.</p>
          </div>
        ) : (
          <div className="qr-section">
            <div className="qr-code">
              <QRCodeCanvas value={ticketid || "N/A"} size={150} level="H" includeMargin={true} aria-label={`QR code for ticket ${ticketid}`} />
            </div>
            <p className="qr-info">
              Generate this ticket at the venue to mark attendance and get other complimentaries
            </p>
          </div>
        )}
      </div>

      {competition?.enabled && ticketData.event?.id && !cancelled ? (
        <Link href={`/${ticketData.event.id}/compete`} className="live-btn" style={{ display: "inline-flex", marginTop: 12, textDecoration: "none" }}>
          Your team and submission
        </Link>
      ) : null}
      {cancelled ? null : <Download />}
    </div>
  );
};

export default Ticket;
