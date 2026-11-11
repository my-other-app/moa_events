/**
 * "Can't come? Give your ticket back" (feature-register/ticket-self-cancel-contract.md):
 * the link in the ticket emails, /tickets/cancel?t=<token>. Its shapes, read
 * and said plainly; pure.
 *
 *   GET  /api/v1/tickets/cancel/{token}  → {event: {id, name, slug, starts_at, poster},
 *        attendee_name, ticket_code_masked, cancellable, reason?, organiser_email}
 *   POST /api/v1/tickets/cancel/{token}  {reason?: ≤300} → {cancelled: true}, or 409
 *        with the reason code
 *
 * Only free tickets, before the event starts and before check-in, for an
 * event that allows it; nothing about money is done here.
 */

/** The link's token: signed and URL-safe (base64url, maybe with dots), never anything else. */
const TOKEN = /^[A-Za-z0-9._~-]{16,600}$/;
export const isCancelToken = (v) => TOKEN.test(String(v ?? ""));

export const REASONS = ["paid", "started", "checked_in", "already_cancelled", "not_allowed", "invalid"];
export const MAX_REASON = 300;

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const reasonOf = (v) => {
  const s = str(v)?.toLowerCase();
  return s && REASONS.includes(s) ? s : null;
};
const email = (v) => (str(v) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? v.trim() : null);

/** GET's answer, or null when it isn't one. */
export function parseCancelInfo(d) {
  const o = obj(d);
  const e = obj(o?.event);
  if (!o || !e || !str(e.name)) return null;
  const cancellable = o.cancellable === true;
  return {
    event: {
      id: e.id ?? null,
      slug: str(e.slug),
      name: str(e.name),
      starts_at: str(e.starts_at),
      poster: e.poster || null,
    },
    attendeeName: str(o.attendee_name),
    ticketCode: str(o.ticket_code_masked),
    cancellable,
    reason: cancellable ? null : reasonOf(o.reason) || "invalid",
    organiserEmail: email(o.organiser_email),
  };
}

/** The reason a refusal (apiFailure's shape) carries: its error_code, or a `reason` in its body. */
export function refusalReason(f = {}) {
  return reasonOf(f.code) || reasonOf(f.errors?.reason) || reasonOf(f.errors?.code) || null;
}

/**
 * What a refusal means: {kind: "reason", reason} (show that refusal), "invalid"
 * (not a link of ours; also an API without the route), "limit", "network",
 * "server", "message".
 */
export function describeCancelError(f = {}) {
  const reason = refusalReason(f);
  if (reason && reason !== "invalid") return { kind: "reason", reason };
  if (reason === "invalid" || f.status === 404 || f.status === 405 || f.status === 410) return { kind: "invalid" };
  if (f.status === 409) return { kind: "reason", reason: "already_cancelled" };
  if (f.status === 429) return { kind: "limit", message: "That's a lot of tries in a row. Wait a minute, then try again." };
  if (f.network) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again." };
  if (!f.status || f.status >= 500) return { kind: "server", message: "Something went wrong on our side. Try again in a moment." };
  return { kind: "message", message: f.message || "That didn't go through. Try again." };
}

/**
 * Each refusal in plain words: {title, text}. `email` is the organiser's
 * address (null when the API has none: "the organisers").
 */
export function refusalWords(reason, email = null) {
  const to = email || "the organisers";
  switch (reason) {
    case "paid":
      return { title: "This ticket was paid for", text: `Paid tickets can't be given back here, and nothing is refunded automatically. Write to ${to} for a refund.` };
    case "started":
      return { title: "This event has started", text: "Tickets can be given back only before the event starts." };
    case "checked_in":
      return { title: "You've been checked in", text: "This ticket was used at the door, so it can't be given back." };
    case "already_cancelled":
      return { title: "You've given this ticket back", text: "It's cancelled already, and your seat is free for someone else. There's nothing more to do." };
    case "not_allowed":
      return { title: "This event doesn't take tickets back here", text: `If you can't come, write to ${to} and let them know.` };
    default:
      return { title: "This link isn't valid", text: "Check that the whole link was copied from your email: each link gives back one ticket." };
  }
}
