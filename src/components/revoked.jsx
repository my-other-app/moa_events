"use client";

import { REVOKED_DETAIL, REVOKED_HELP, REVOKED_SHORT, REVOKED_TITLE } from "@/utils/revoked";

/**
 * A revoked ticket, where a ticket is shown: the ticket's own page and My
 * tickets. Both already read `ticket_revoked` from the API (see
 * src/utils/revoked.js); this says what it means, in the same shape as the
 * note a cancelled event gets (./cancelled).
 */
export function RevokedNote({ eventName = null, ticketId = null, compact = false, className = "" }) {
  const which = [eventName, ticketId].filter(Boolean).join(" · ");
  return (
    <div className={`cx-note${compact ? " is-compact" : ""} ${className}`} role="status">
      <p className="cx-title">{REVOKED_TITLE}</p>
      {compact ? (
        <p className="cx-when">{REVOKED_SHORT}</p>
      ) : (
        <>
          {which ? <p className="cx-reason">{which}</p> : null}
          <p className="cx-when">{REVOKED_DETAIL}</p>
          <p className="cx-refund">
            <strong>{REVOKED_HELP}</strong>
          </p>
        </>
      )}
    </div>
  );
}

export default RevokedNote;
