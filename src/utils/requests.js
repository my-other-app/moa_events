import { parseRequestRef, tokenOf } from "./requestlink";
import { apiFailure } from "./ticketing";

export { requestPath, tokenFromStatusUrl } from "./requestlink";

/**
 * Registration approval ("Confirm each registration"): a club can confirm
 * each place at an event. Whoever fills in its form isn't registered yet:
 * they get a request, and an email, and the club confirms or declines it.
 * Confirmed and free, they are registered and the ticket email goes out;
 * confirmed and paid, they get a pay link (the waiting list's claim flow,
 * /claim/{token}) and the place is held for a while.
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
 * A registration request, as the pages read it:
 *
 *   {id, token, status, event: {id, slug, name, starts_at, location_name, is_online, poster, club},
 *    ticketType: {id, name} | null, fullName, submittedAt, decidedAt, declineNote,
 *    ticketId, pay: {amount, payBy, claimToken, claimUrl} | null}
 *
 * `status` is one of REQUEST_STATUSES, or "other" for one this site doesn't
 * know yet. `ticketId` once registered; `pay` only for a confirmed paid
 * request still inside its hold (the claim link pays it). `token` when the
 * answer carries one (`token`, or `status_url`): the status page's address.
 * Null when it isn't a request.
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
    ticketId: ticket,
    pay: claimToken ? { amount: Math.max(0, num(pay.amount) ?? 0), payBy: iso(pay.pay_by), claimToken, claimUrl: str(pay.claim_url) } : null,
  };
}

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

/** Beside the event's register button: "Circuit Society confirms each place. You'll get your ticket by email when they do." */
export const approvalNote = (club) => `${clubName(club)} confirms each place. You’ll get your ticket by email when they do.`;

/**
 * Where an open event with nobody going yet says "Be the first to register":
 * on an event whose club confirms each place, "Circuit Society confirms each
 * place" instead (people may have asked already; the page shows no request numbers).
 */
export const confirmsEachPlace = (club) => `${clubName(club)} confirms each place`;

/** Nobody going yet: what the event says in place of a count. */
export const nobodyGoingLine = (event, club) => (event?.requires_approval === true ? confirmsEachPlace(club) : "Be the first to register");

/**
 * The event's "Confirm each registration" setting: the form's GET
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
 * event whose club confirms each place): {id, status, submittedAt, token,
 * path}. `token` and `path` are null when the form was sent again, signed
 * out, for an address with an open request: the API emails the link to the
 * address instead. Null when the answer is a registration.
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
