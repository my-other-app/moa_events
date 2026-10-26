import { formatWhen } from "./format";

/**
 * Ticket types, discount codes and the waiting list, as the site reads them
 * (the API's docs/TICKETING.md). Nothing here touches the page: the shapes
 * the API answers with, read defensively, and what each of its refusals
 * means, in words.
 *
 * An API older than ticket types sends no `ticketing` at all, and
 * parseTicketing() is then null: every caller keeps the flow it had.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const count = (v) => {
  const n = num(v);
  return n === null ? null : Math.max(0, Math.floor(n));
};
const idOf = (v) => {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
};
const iso = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const INR_PAISE = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "₹199", "₹159.20". */
const money = (n) => {
  const v = Number(n) || 0;
  return `₹${Number.isInteger(Math.round(v * 100) / 100) ? INR.format(v) : INR_PAISE.format(v)}`;
};

/* ---------- the event's tickets ---------- */

const TYPE_STATUSES = new Set(["on_sale", "sold_out", "not_started", "ended", "closed"]);

function parseType(t) {
  const o = obj(t);
  const id = idOf(o?.id);
  if (!o || id === null || !str(o.name)) return null;
  const price = Math.max(0, num(o.price) ?? 0);
  return {
    id,
    name: str(o.name),
    description: str(o.description),
    price,
    isFree: o.is_free === true || price === 0,
    capacity: count(o.capacity),
    available: count(o.available),
    status: TYPE_STATUSES.has(o.status) ? o.status : "on_sale",
    salesStart: iso(o.sales_start),
    salesEnd: iso(o.sales_end),
    perPersonLimit: count(o.per_person_limit),
    isHidden: o.is_hidden === true,
    waitlist: o.waitlist === true,
  };
}

/** One of the viewer's places in line (`viewer_waitlist`, or what joining answers). */
export function parseWaitlistEntry(e) {
  const o = obj(e);
  if (!o || !str(o.status)) return null;
  return {
    id: o.id === null || o.id === undefined ? null : String(o.id),
    ticketTypeId: idOf(o.ticket_type_id),
    ticketTypeName: str(o.ticket_type_name),
    status: o.status,
    position: count(o.position),
    offerExpiresAt: iso(o.offer_expires_at),
    joinedAt: iso(o.joined_at),
    created: o.created === false ? false : o.created === true ? true : null,
  };
}

/**
 * The event's `ticketing` (GET /events/info/{id}, or GET
 * /events/{id}/ticket-types):
 *
 *   {types, requiresChoice, available, soldOut, waitlist: {enabled, offerHours}, viewerWaitlist}
 *
 * null when the API has no ticket types (an older server), or sent nothing usable.
 */
export function parseTicketing(raw) {
  const o = obj(raw);
  if (!o || !Array.isArray(o.types)) return null;
  const types = o.types.map(parseType).filter(Boolean);
  if (!types.length) return null;
  const wl = obj(o.waitlist) || {};
  const hours = count(wl.offer_hours);
  return {
    types,
    requiresChoice: o.requires_choice === true,
    available: count(o.available),
    soldOut: o.sold_out === true,
    waitlist: { enabled: wl.enabled === true, offerHours: hours && hours > 0 ? hours : 24 },
    viewerWaitlist: Array.isArray(o.viewer_waitlist) ? o.viewer_waitlist.map(parseWaitlistEntry).filter(Boolean) : [],
    // The club confirms each place (registration approval): the form sends a request, not a registration.
    requiresApproval: o.requires_approval === true,
  };
}

/** Whether the form shows a choice of tickets: more than one to choose from. */
export const needsPicker = (ticketing) => Boolean(ticketing && ticketing.types.length > 1);

/**
 * The ticket chosen before anyone picks: the one a link names (`?ticket_type=`,
 * a hidden type the club shared), or the only one. Null when there is a
 * choice to make.
 */
export function defaultType(ticketing, linkedId = null) {
  if (!ticketing) return null;
  const linked = idOf(linkedId);
  if (linked !== null && ticketing.types.some((t) => t.id === linked)) return linked;
  if (ticketing.types.length === 1) return ticketing.types[0].id;
  return null;
}

export const typeById = (ticketing, id) => (ticketing && id !== null && id !== undefined ? ticketing.types.find((t) => t.id === Number(id)) || null : null);

/** "Free", "₹199". */
export const typePrice = (type) => (type.isFree ? "Free" : money(type.price));

/** Prices, for the event's card: "₹199", "₹199 – ₹499", "Free – ₹499". */
export function priceRange(ticketing) {
  if (!ticketing) return null;
  const prices = ticketing.types.map((t) => (t.isFree ? 0 : t.price));
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const say = (n) => (n === 0 ? "Free" : money(n));
  return lo === hi ? say(lo) : `${say(lo)} – ${say(hi)}`;
}

/** Whether anything on sale costs money: the discount code field only shows then. */
export const anyPaid = (ticketing) => Boolean(ticketing && ticketing.types.some((t) => !t.isFree));

const LOW = 10;

/**
 * The line under a ticket's name: what can be done with it now.
 *   on_sale       "Only 3 left" (10 or fewer), "Sales end Sat, 1 Nov · 11:59 PM IST", or nothing
 *   sold_out      "Sold out", "Sold out · join the waiting list"
 *   not_started   "On sale from Sat, 1 Nov · 10:00 AM IST"
 *   ended         "Sales ended"
 *   closed        "Registration closed"
 */
export function typeNote(type) {
  switch (type.status) {
    case "sold_out":
      return { text: type.waitlist ? "Sold out · waiting list open" : "Sold out", tone: "muted" };
    case "not_started": {
      const when = formatWhen(type.salesStart);
      return { text: when ? `On sale from ${when} IST` : "Not on sale yet", tone: "muted" };
    }
    case "ended":
      return { text: "Sales ended", tone: "muted" };
    case "closed":
      return { text: "Registration closed", tone: "muted" };
    default: {
      if (type.available !== null && type.available <= LOW) {
        return { text: type.available === 0 ? "Sold out" : `Only ${type.available} left`, tone: "warn" };
      }
      const ends = formatWhen(type.salesEnd);
      return ends ? { text: `Sales end ${ends} IST`, tone: null } : null;
    }
  }
}

/** Whether a ticket can be chosen on the form now. */
export const onSale = (type) => Boolean(type) && type.status === "on_sale" && (type.available === null || type.available > 0);

/** The types whose waiting list can be joined now (sold out, the list on). */
export const waitlistTypes = (ticketing) => (ticketing && ticketing.waitlist.enabled ? ticketing.types.filter((t) => t.waitlist) : []);

/* ---------- a place in line, in words ---------- */

/**
 * "You're 3rd in line for Early bird", "A place is held for you until …".
 * `kind`: "waiting" | "offered" | "other" (claimed, expired, left: nothing to show).
 */
export function entryLine(entry) {
  const what = entry.ticketTypeName ? ` for ${entry.ticketTypeName}` : "";
  if (entry.status === "offered") {
    const until = formatWhen(entry.offerExpiresAt);
    return {
      kind: "offered",
      title: `A place${what} is yours to claim`,
      text: until ? `It's held for you until ${until} IST. The claim link is in your email.` : "The claim link is in your email.",
    };
  }
  if (entry.status === "waiting") {
    const n = entry.position;
    return {
      kind: "waiting",
      title: n === 1 ? `You're next in line${what}` : n ? `You're number ${n} in line${what}` : `You're on the waiting list${what}`,
      text: "If a place opens up, we'll email you a link to claim it.",
    };
  }
  return { kind: "other", title: null, text: null };
}

/** The places still standing: waiting, or offered and not yet claimed. */
export const liveEntries = (entries) => (Array.isArray(entries) ? entries.filter((e) => e.status === "waiting" || e.status === "offered") : []);

/* ---------- what a refusal means ---------- */

const sentence = (s) => {
  const t = String(s || "").trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};

/** A ticket type the server refused, as the line under the ticket picker. Null for a code that isn't one. */
export function ticketTypeRefusal(code, errors = null) {
  switch (code) {
    case "TICKET_TYPE_REQUIRED":
      return "Choose a ticket.";
    case "TICKET_TYPE_NOT_FOUND":
      return "That ticket isn't available any more. Choose another.";
    case "TICKET_TYPE_NOT_ON_SALE": {
      if (errors?.closed_reason === "not_started") {
        const when = formatWhen(errors.opens_at);
        return when ? `This ticket goes on sale ${when} IST.` : "This ticket isn't on sale yet.";
      }
      return "Sales for this ticket have ended. Choose another.";
    }
    case "TICKET_TYPE_SOLD_OUT":
      return errors?.waitlist ? "This ticket just sold out. You can join its waiting list." : "This ticket just sold out. Choose another.";
    case "TICKET_TYPE_LIMIT":
      return "You already hold as many of this ticket as one person may.";
    default:
      return null;
  }
}

/** A discount code the server refused, as the line under the code field. Null for a code that isn't one. */
export function discountRefusal(code) {
  switch (code) {
    case "DISCOUNT_CODE_INVALID":
      return "That code isn't valid for this event. Check it for typos.";
    case "DISCOUNT_CODE_NOT_STARTED":
      return "That code can't be used yet.";
    case "DISCOUNT_CODE_EXPIRED":
      return "That code has expired.";
    case "DISCOUNT_CODE_NOT_FOR_TYPE":
      return "That code doesn't work for this ticket.";
    case "DISCOUNT_CODE_USED_UP":
      return "That code has been used up.";
    case "DISCOUNT_CODE_LIMIT":
      return "You've already used that code as often as it allows.";
    default:
      return null;
  }
}

/**
 * Normalises an error from the API (axios's, or one of ours) to
 * {status, code, errors, message, network, retryAfter}.
 */
export function apiFailure(error) {
  if (error && error.__apiFailure) return error;
  const response = error?.response;
  const data = obj(response?.data) || obj(error?.data);
  const status = response?.status ?? error?.status ?? 0;
  const said = str(data?.message) || str(data?.detail);
  const retry = Number(response?.headers?.["retry-after"]);
  return {
    __apiFailure: true,
    status,
    code: str(data?.error_code),
    errors: obj(data?.errors),
    message: said,
    network: !response && !error?.status && !error?.authExpired,
    authExpired: Boolean(error?.authExpired),
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
  };
}

const TOO_MANY = "Too many tries in a row. Wait a minute, then try again.";

/** Checking a code (POST …/discount-codes/check): the line under the field. */
export function describeCodeCheck(error) {
  const f = apiFailure(error);
  if (f.status === 429) return TOO_MANY;
  if (f.network) return "We couldn't check the code. Check your connection and try again.";
  const known = discountRefusal(f.code) || ticketTypeRefusal(f.code, f.errors);
  if (known) return f.code === "TICKET_TYPE_REQUIRED" ? "Choose a ticket first." : known;
  if (f.status === 422 && !f.code) return "Enter the code as it was given to you.";
  return f.message && f.status < 500 ? sentence(f.message) : "We couldn't check the code just now. Try again in a moment.";
}

/**
 * Joining the waiting list (POST /events/{id}/waitlist):
 *   {field, message}   a field to fix: "email", "phone", "name" or "ticket_type"
 *   {kind, message}    "registered" | "not_needed" | "closed" | "limit" | "network" | "message"
 */
export function describeWaitlistError(error) {
  const f = apiFailure(error);
  if (f.status === 429) return { kind: "limit", message: TOO_MANY };
  if (f.network) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again." };
  switch (f.code) {
    case "WAITLIST_CONTACT_REQUIRED":
      return { field: "email", message: "Enter your email, so we can tell you when a place opens up." };
    case "WHATSAPP_NUMBER":
      return { field: "phone", message: "WhatsApp can't reach this number. Enter a mobile number, or untick the WhatsApp box." };
    case "WAITLIST_NOT_NEEDED":
      return { kind: "not_needed", message: "Good news: tickets are available again. Register now instead." };
    case "WAITLIST_CLOSED":
      return { kind: "closed", message: "This event's waiting list isn't open." };
    case "ALREADY_REGISTERED":
      return { kind: "registered", message: "You're already registered for this event: your ticket is in your email." };
    default:
      break;
  }
  const typeLine = ticketTypeRefusal(f.code, f.errors);
  if (typeLine) return { field: "ticket_type", message: f.code === "TICKET_TYPE_REQUIRED" ? "Choose which ticket to wait for." : typeLine };
  const errs = f.errors || {};
  if (typeof errs.email === "string") return { field: "email", message: errs.email };
  if (typeof errs.phone === "string") return { field: "phone", message: errs.phone };
  if (typeof errs.full_name === "string") return { field: "name", message: errs.full_name };
  if (f.status === 422) return { field: "email", message: "Check your details: an email we can reach, or a phone number." };
  return { kind: "message", message: f.message && f.status < 500 ? sentence(f.message) : "We couldn't add you to the waiting list. Try again in a moment." };
}

/**
 * Claiming an offer (POST /waitlist/offers/{token}/claim):
 *   {kind: "expired" | "claimed" | "gone" | "registered" | "cancelled" | "closed" | "limit" | "network" | "message", message}
 *   {kind: "fields", fields: {email?, name?, discount_code?}, message}
 */
export function describeClaimError(error) {
  const f = apiFailure(error);
  if (f.status === 429) return { kind: "limit", message: TOO_MANY };
  if (f.network) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again — you won't be registered twice." };
  switch (f.code) {
    case "OFFER_EXPIRED":
      return { kind: "expired", message: "This offer ran out, and the place went to the next person in line." };
    case "OFFER_CLAIMED":
      return { kind: "claimed", message: "This place has been claimed already." };
    case "OFFER_NOT_FOUND":
      return { kind: "gone", message: "This claim link isn't valid." };
    case "EMAIL_REQUIRED":
      return { kind: "fields", fields: { email: "Enter your email: your ticket is sent here." }, message: null };
    case "CLUB_EMAIL":
      return { kind: "fields", fields: { email: "This email belongs to a club's account. Use your own email." }, message: null };
    case "ALREADY_REGISTERED":
      return { kind: "registered", message: "You're already registered for this event: your ticket is in your email." };
    case "REGISTRATIONS_CLOSED":
      return f.errors?.closed_reason === "cancelled"
        ? { kind: "cancelled", message: "This event was cancelled, so its places can't be claimed." }
        : { kind: "closed", message: "This event isn't taking registrations any more." };
    case "EVENT_CANCELLED":
      return { kind: "cancelled", message: "This event was cancelled, so its places can't be claimed." };
    default:
      break;
  }
  const code = discountRefusal(f.code);
  if (code) return { kind: "fields", fields: { discount_code: code }, message: null };
  const errs = f.errors || {};
  const fields = {};
  if (typeof errs.email === "string") fields.email = errs.email;
  if (typeof errs.full_name === "string") fields.name = `Enter your full name — ${errs.full_name.replace(/\.$/, "").toLowerCase()}.`;
  if (Object.keys(fields).length) return { kind: "fields", fields, message: null };
  return { kind: "message", message: f.message && f.status < 500 ? sentence(f.message) : "We couldn't claim your place just now. Try again in a moment." };
}

/* ---------- a claim link's offer ---------- */

const OFFER_STATUSES = new Set(["offered", "expired", "claimed", "left", "removed"]);

/**
 * GET /waitlist/offers/{token}, as the claim page reads it:
 *   {id, status, reason, event: {id, slug, name, starts_at, location_name, poster, club}, ticketType: {id, name, price, isFree},
 *    fullName, email, phone, expiresAt, needsEmail, needsPayment, registrationId}
 * `reason`: "approved" when the place is one the club confirmed (a
 * registration request on a paid ticket: the claim is its pay link), else
 * null (a place that opened up on the waiting list). `event.club`: {name}
 * when the API says it (on the event, or beside it). null when it isn't one.
 */
export function parseOffer(d) {
  const o = obj(d);
  const ev = obj(o?.event);
  const tt = obj(o?.ticket_type) || {};
  if (!o || !ev || ev.id === null || ev.id === undefined || !str(ev.name)) return null;
  const price = Math.max(0, num(tt.price) ?? 0);
  const club = obj(ev.club) || obj(o.club);
  return {
    id: o.id === null || o.id === undefined ? null : String(o.id),
    status: OFFER_STATUSES.has(o.status) ? o.status : "removed",
    reason: o.reason === "approved" ? "approved" : null,
    event: {
      id: ev.id,
      slug: str(ev.slug),
      name: str(ev.name),
      starts_at: iso(ev.event_datetime) || iso(ev.starts_at),
      location_name: str(ev.location_name),
      poster: ev.poster || null,
      club: club && str(club.name) ? { name: str(club.name) } : null,
    },
    ticketType: { id: idOf(tt.id), name: str(tt.name) || "Ticket", price, isFree: price === 0 },
    fullName: str(o.full_name) || "",
    email: str(o.email),
    phone: str(o.phone),
    expiresAt: iso(o.expires_at),
    needsEmail: o.needs_email === true,
    needsPayment: o.needs_payment === true || price > 0,
    registrationId: o.registration_id === null || o.registration_id === undefined ? null : String(o.registration_id),
  };
}

/* ---------- the ticket's type ---------- */

/**
 * The ticket type's name, from whichever field the answer carries it in:
 * `ticket_type: {name}` (registering), `ticket_type_name` (lists),
 * `ticket_label` (a registration). Null when none does: a single-type
 * event's ticket says nothing more than it always did.
 */
export function ticketTypeName(r) {
  const o = obj(r);
  if (!o) return null;
  return str(obj(o.ticket_type)?.name) || str(typeof o.ticket_type === "string" ? o.ticket_type : null) || str(o.ticket_type_name) || str(o.ticket_label) || null;
}
