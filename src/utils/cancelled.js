import { formatDate } from "./format";

/**
 * An event its club called off. The API says so on the event's page
 * (GET /discover/events/{slug}) and its detail (GET /events/info/{id}):
 * `status: "cancelled"`, `registration_open: false` and
 * `cancellation: {reason, cancelled_at}`. A cancelled event is in no list,
 * but its page still opens; registering is refused (400 REGISTRATIONS_CLOSED,
 * closed_reason "cancelled") and so is paying (409 EVENT_CANCELLED). Every
 * online payment is refunded in full.
 */

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** {reason, cancelled_at} from the API, or null. */
export function parseCancellation(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const at = str(v.cancelled_at);
  return { reason: str(v.reason), cancelled_at: at && !Number.isNaN(new Date(at).getTime()) ? at : null };
}

export const isCancelled = (event) => event?.status === "cancelled";

/** What everyone is told. */
export const CANCELLED_TITLE = "This event was cancelled";

/** What someone who paid is told. */
export const REFUND_NOTE = "Your payment is being refunded.";
export const REFUND_DETAIL = "It goes back the way you paid, usually within 5–7 working days, and we'll email you when it's done.";

/** "Cancelled on 18 Oct 2026", or "Cancelled by the organisers" without a date. */
export function cancelledLine(cancellation) {
  const when = formatDate(cancellation?.cancelled_at);
  return when ? `Cancelled on ${when}` : "Cancelled by the organisers";
}
