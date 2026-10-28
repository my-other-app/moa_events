import { formatWhen } from "./format";
import { rupees } from "./register";
import { parseRequestRef, tokenOf } from "./requestlink";
import { apiFailure } from "./ticketing";

export { requestPath, tokenFromStatusUrl } from "./requestlink";

/**
 * Registration approval, called "Review registrations" wherever people read
 * it: a club can review every registration for an event. Whoever registers
 * gets a registration under review (the API's "request") and an email, and
 * the club confirms or declines it. Confirmed and free, they get their
 * ticket by email; confirmed and paid, they get a pay link (the waiting
 * list's claim flow, /claim/{token}) and the ticket is held for a while.
 *
 * The words people read follow feature-register/review-wording-contract.md:
 * never "request a place", "your request", "waiting list" or "place" (a
 * seat) on such an event. "Request" stays in code, routes and the API.
 *
 * Nothing here touches the page: the request's shape as the API sends it
 * (GET /registration-requests/{token}, and each item of
 * GET /registration-requests/mine), read defensively, and what its refusals
 * mean. An API without requests never sends `approval`, nor
 * `requires_approval`, and every page stays what it was.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const iso = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const idOf = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? v : null);

export const REQUEST_STATUSES = new Set(["pending", "approved", "declined", "withdrawn", "lapsed", "closed"]);

/**
 * Why a closed request closed (`closed_reason`): the event ended or was
 * deleted while it was under review, the event was cancelled, or the person
 * got a ticket another way.
 */
export const CLOSED_REASONS = new Set(["event_ended", "event_deleted", "event_cancelled", "registered_directly"]);

/**
 * A registration request, as the pages read it:
 *
 *   {id, token, status, event: {id, slug, name, starts_at, location_name, is_online, poster, club},
 *    ticketType: {id, name} | null, fullName, submittedAt, decidedAt, declineNote,
 *    closedReason, ticketId, pay: {amount, payBy, claimToken, claimUrl} | null}
 *
 * `status` is one of REQUEST_STATUSES, or "other" for one this site doesn't
 * know yet. `ticketId` once registered; `pay` only for a confirmed paid
 * request still inside its hold (the claim link pays it). `closedReason`
 * only for a closed one, and only one of CLOSED_REASONS (else null, said as
 * the event having ended). `token` when the answer carries one (`token`, or
 * `status_url`): the status page's address. Null when it isn't a request.
 */
export function parseRequest(d) {
  const o = obj(d);
  const ev = obj(o?.event);
  if (!o || !ev || idOf(ev.id) === null || !str(ev.name)) return null;
  const club = obj(ev.club);
  const tt = obj(o.ticket_type);
  const pay = obj(o.pay);
  const claimToken = str(pay?.claim_token);
  const ticket = o.ticket_id === null || o.ticket_id === undefined ? null : str(String(o.ticket_id));
  const token = tokenOf(o);
  return {
    id: o.id === null || o.id === undefined ? null : String(o.id),
    token,
    status: REQUEST_STATUSES.has(o.status) ? o.status : "other",
    event: {
      id: ev.id,
      slug: str(ev.slug),
      name: str(ev.name),
      starts_at: iso(ev.event_datetime) || iso(ev.starts_at),
      location_name: str(ev.location_name),
      is_online: ev.is_online === true,
      poster: ev.poster || null,
      club: club && str(club.name) ? { name: str(club.name), slug: str(club.slug) } : null,
    },
    ticketType: tt && str(tt.name) ? { id: idOf(tt.id), name: str(tt.name) } : null,
    fullName: str(o.full_name) || "",
    submittedAt: iso(o.submitted_at),
    decidedAt: iso(o.decided_at),
    declineNote: str(o.decline_note),
    closedReason: o.status === "closed" && CLOSED_REASONS.has(o.closed_reason) ? o.closed_reason : null,
    ticketId: ticket,
    pay: claimToken ? { amount: Math.max(0, num(pay.amount) ?? 0), payBy: iso(pay.pay_by), claimToken, claimUrl: str(pay.claim_url) } : null,
  };
}

const WORDS = { pending: "Under review", declined: "Not confirmed", withdrawn: "Cancelled", lapsed: "Expired", closed: "Closed" };

/**
 * The status chip, in the attendee's words: "Under review", "Confirmed",
 * "Confirmed · pay by Tue, 27 Oct · 10:15 AM IST to get your ticket" (paid,
 * not paid yet, inside the hold), "Not confirmed", "Cancelled", "Expired",
 * "Closed". Null for a status this site doesn't know.
 */
export function statusWord(request) {
  const status = request?.status;
  if (status === "approved") {
    if (request.ticketId || !request.pay) return "Confirmed";
    const by = formatWhen(request.pay.payBy);
    return `Confirmed · pay ${by ? `by ${by} IST ` : ""}to get your ticket`;
  }
  return WORDS[status] || null;
}

/**
 * A confirmed paid registration's line: "Pay ₹199 by Tue, 27 Oct · 10:15 AM
 * IST to get your ticket." Whatever `pay` doesn't say is left out ("Pay to
 * get your ticket." without it).
 */
export function payLine(pay) {
  const amount = pay && pay.amount > 0 ? rupees(pay.amount) : null;
  const by = pay ? formatWhen(pay.payBy) : "";
  return `Pay ${amount ? `${amount} ` : ""}${by ? `by ${by} IST ` : ""}to get your ticket.`;
}

/** "Pay ₹199", or "Pay now" without an amount. */
export const payButton = (pay) => (pay && pay.amount > 0 ? `Pay ${rupees(pay.amount)}` : "Pay now");

/** GET /registration-requests/mine: `{items: [...]}` (a bare list is read too). */
export function parseRequestList(d) {
  const o = obj(d);
  const items = Array.isArray(o?.items) ? o.items : Array.isArray(d) ? d : [];
  return items.map(parseRequest).filter(Boolean);
}

/**
 * The requests still waiting on something, for My tickets: pending, or
 * confirmed and not yet paid (no ticket yet). Open ones first as the server
 * sends them; one with a ticket is in the tickets list already.
 */
export const openRequests = (list) => (Array.isArray(list) ? list.filter((r) => r.status === "pending" || (r.status === "approved" && !r.ticketId)) : []);

/** The club's name for a sentence: "Circuit Society", else "The club" (or "the club" mid-sentence). */
export const clubName = (club, { start = true } = {}) => str(club?.name) || (start ? "The club" : "the club");

/**
 * Beside the event's register button, and on the form's steps: "Circuit
 * Society reviews every registration and emails tickets to the people it
 * confirms."
 */
export const approvalNote = (club) => `${clubName(club)} reviews every registration and emails tickets to the people it confirms.`;

/**
 * The short form, for one-line stat spots only (the full note sits by the
 * button): where an open event with nobody going yet says "Be the first to
 * register", one that reviews registrations says "Circuit Society reviews
 * every registration" instead (people may have registered already; the page
 * shows no numbers under review).
 */
export const confirmsEachPlace = (club) => `${clubName(club)} reviews every registration`;

/** Registered, and under review: "Circuit Society reviews every registration. If yours is confirmed, your ticket will come by email." */
export const underReviewNote = (club) => `${clubName(club)} reviews every registration. If yours is confirmed, your ticket will come by email.`;

/** Nobody going yet: what the event says in place of a count. */
export const nobodyGoingLine = (event, club) => (event?.requires_approval === true ? confirmsEachPlace(club) : "Be the first to register");

/**
 * The event's "Review registrations" setting: the form's GET
 * /events/info (freshest) says it at the top or in its `ticketing`;
 * otherwise the event page's. False when nobody says it (an older server).
 */
export function requiresApproval(info, event = null) {
  const o = obj(info);
  if (o && typeof o.requires_approval === "boolean") return o.requires_approval;
  const t = obj(o?.ticketing);
  if (t && typeof t.requires_approval === "boolean") return t.requires_approval;
  return event?.requires_approval === true;
}

/**
 * The register call's `approval` (with `accepts_approval: true`, for an
 * event that reviews registrations): {id, status, submittedAt, token,
 * path}. `token` and `path` are null when the form was sent again, signed
 * out, for an address with an open registration: the API emails the link
 * to the address instead. Null when the answer is a registration.
 */
export const parseApproval = (data) => parseRequestRef(obj(data)?.approval);

const TOO_MANY = "Too many tries in a row. Wait a minute, then try again.";

/**
 * Reading a request, or withdrawing it:
 *   {kind: "gone"}      no such request (404): the link isn't valid
 *   {kind: "changed"}   it can't be withdrawn any more (it was decided meanwhile)
 *   {kind: "limit" | "network" | "message", message}
 */
export function describeRequestError(error) {
  const f = apiFailure(error);
  if (f.status === 404) return { kind: "gone", message: "This link isn't valid." };
  // REQUEST_NOT_WITHDRAWABLE carries the request as it stands now.
  if (f.status === 409 && f.errors?.request) return { kind: "changed", message: f.message, request: parseRequest(f.errors.request) };
  if (f.status === 429) return { kind: "limit", message: TOO_MANY };
  if (f.network) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again." };
  if (f.status === 409 || f.status === 400 || f.status === 422) return { kind: "changed", message: f.message };
  return { kind: "message", message: "Something went wrong on our side. Try again in a moment." };
}
