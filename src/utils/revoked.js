/**
 * A ticket its organiser revoked. The API says so on the ticket itself
 * (GET /events/tickets/{id}: `ticket_revoked`) and on each of the reader's
 * registrations (GET /events/list?is_registered=true, the same name). The
 * door refuses it, and so do its image, its PDF and its Wallet pass (410,
 * TICKET_REVOKED) -- so this page must show no QR by any route: not the
 * club's rendered design, not the one it draws itself, and not the PDF the
 * Download button makes from whichever is on screen.
 *
 * A revoked ticket is not a cancelled event: the event is still happening,
 * this one person's way in was taken away. Only the organiser can give it
 * back, so that is who we send them to.
 */

/** Whether the API says this ticket (or registration row) was revoked. */
export const isTicketRevoked = (ticket) => ticket?.ticket_revoked === true;

/** What the holder is told, in the words the app uses for it. */
export const REVOKED_TITLE = "This ticket was revoked by the organiser";

/** What that means at the door. */
export const REVOKED_DETAIL = "It won't be accepted at the venue, so there's no code to show.";

/** What to do about it. */
export const REVOKED_HELP = "If you think this is a mistake, contact the organiser of the event.";

/** The stamp where the QR would have been. */
export const REVOKED_STAMP = "Revoked";

/** The row in My tickets, in one line. */
export const REVOKED_SHORT = "The organiser revoked this ticket. Contact them if you think this is a mistake.";
