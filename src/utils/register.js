import { formatWhen } from "./format";
import { picksToPayload } from "./picks";
import { discountRefusal, ticketTypeRefusal } from "./ticketing";

/**
 * What the registration flow works out without touching the page: which
 * steps an event's form has, how each organiser question is typed in,
 * what counts as a valid answer, the payload the API is sent, what an
 * error from it means, and where the signed-in person's own registration
 * stands.
 */

/** "Hack Night tee M is sold out" → "Hack Night tee M is sold out." */
const sentence = (s) => {
  const t = String(s || "").trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};

/* ---------- questions ---------- */

/**
 * The event's own questions (`additional_details` from /events/info/{id}),
 * cleaned up. A question the server left `required` off is required: that
 * is the server's default too.
 */
export function parseQuestions(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const q of list) {
    if (!q || typeof q !== "object") continue;
    const key = typeof q.key === "string" ? q.key : q.key !== null && q.key !== undefined ? String(q.key) : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const options = Array.isArray(q.options) ? q.options.filter((o) => typeof o === "string" && o.trim()) : [];
    out.push({
      key,
      label: typeof q.label === "string" && q.label.trim() ? q.label.trim() : key,
      type: typeof q.field_type === "string" ? q.field_type.toLowerCase() : "text",
      required: q.required !== false,
      options,
    });
  }
  return out;
}

const TEXT_INPUTS = {
  text: { type: "text" },
  email: { type: "email", inputMode: "email", autoCapitalize: "none", spellCheck: false },
  url: { type: "url", inputMode: "url", autoCapitalize: "none", spellCheck: false },
  tel: { type: "tel", inputMode: "tel" },
  number: { type: "text", inputMode: "decimal" },
  date: { type: "date" },
  time: { type: "time" },
  datetime: { type: "datetime-local" },
};

/**
 * How a question is answered. The server takes one string per question and,
 * for select, radio and checkbox, insists it is one of the options — so a
 * "checkbox" is a single tick box when it has one option ("I agree"), and a
 * pick-one list when it has several. Anything unknown is a text box, never
 * nothing: an invisible required field can't be filled in.
 */
export function questionControl(q) {
  if (q.type === "select") return { kind: "select" };
  if (q.type === "radio") return { kind: "choice" };
  if (q.type === "checkbox") return q.options.length > 1 ? { kind: "choice" } : { kind: "check", value: q.options[0] || "Yes" };
  if (q.type === "textarea") return { kind: "textarea" };
  return { kind: "text", ...(TEXT_INPUTS[q.type] || TEXT_INPUTS.text) };
}

/* ---------- validation ---------- */

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;
const digits = (s) => String(s || "").replace(/\D/g, "");

export const isEmail = (s) => EMAIL.test(String(s || "").trim());

/* ---------- WhatsApp ---------- */

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * The number WhatsApp would be sent to, as the server reads it
 * (app/core/whatsapp.py `normalise`), or null when it can't be: "98765 43210"
 * → "+919876543210". Without a country code it is taken as Indian: ten
 * digits from 6 to 9, or those after a 0 or 91. With one, 7 to 15 digits,
 * and an Indian mobile after +91.
 */
export function whatsappNumber(phone) {
  let s = String(phone || "").trim().replace(/[\s\-().\u00a0/]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (s.startsWith("+")) {
    const d = s.slice(1);
    if (!/^\d+$/.test(d)) return null;
    if (d.startsWith("91")) return INDIAN_MOBILE.test(d.slice(2)) ? `+${d}` : null;
    return d.length >= 7 && d.length <= 15 && !d.startsWith("0") ? `+${d}` : null;
  }
  if (!/^\d+$/.test(s)) return null;
  if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
  else if (s.length === 12 && s.startsWith("91")) s = s.slice(2);
  return INDIAN_MOBILE.test(s) ? `+91${s}` : null;
}

/** Whether the WhatsApp box applies: ticked, with a phone number typed (the box only shows then). */
export const wantsWhatsapp = (values, whatsapp) => Boolean(whatsapp && String(values?.phone || "").trim());

/**
 * Your details: a name the server accepts (3–100 letters), an email the
 * ticket can reach, a phone number -- one WhatsApp can reach, when the
 * WhatsApp box is ticked.
 */
export function validateDetails(values, { whatsapp = false } = {}) {
  const errors = {};
  const name = String(values.name || "").trim();
  if (!name) errors.name = "Enter your full name.";
  else if (name.length < 3) errors.name = "Enter your full name — at least 3 letters.";
  else if (String(values.name).length > 100) errors.name = "That's too long — keep it under 100 characters.";

  const email = String(values.email || "").trim();
  if (!email) errors.email = "Enter your email address.";
  else if (!isEmail(email)) errors.email = "That doesn't look like an email address. Check it for typos.";

  const phone = String(values.phone || "").trim();
  const n = digits(phone).length;
  if (!phone) errors.phone = "Enter your phone number.";
  else if (/[^\d\s()+.-]/.test(phone) || n < 10 || n > 15) errors.phone = "Enter a 10-digit mobile number, or include your country code.";
  else if (whatsapp && !whatsappNumber(phone)) errors.phone = "WhatsApp needs a mobile number: 10 digits, or with your country code. Or untick the WhatsApp box.";
  return errors;
}

const looksLikeUrl = (s) => {
  const v = s.trim();
  if (/\s/.test(v)) return false;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".");
  } catch {
    return false;
  }
};

/** One answer: null when it is fine, otherwise what to fix. */
export function validateAnswer(q, value) {
  const v = typeof value === "string" ? value : "";
  const control = questionControl(q);
  if (!v.trim()) {
    if (!q.required) return null;
    if (control.kind === "check") return "Tick this box to continue.";
    if (control.kind === "choice" || control.kind === "select") return "Choose one of the options.";
    return "This question needs an answer.";
  }
  if (control.kind === "choice" || control.kind === "select") return q.options.includes(v) ? null : "Choose one of the options.";
  if (control.kind === "check") return v === control.value ? null : "Tick this box to continue.";
  switch (q.type) {
    case "email":
      return isEmail(v) ? null : "Enter an email address, like name@example.com.";
    case "url":
      return looksLikeUrl(v) ? null : "Enter a web address, like example.com.";
    case "tel": {
      const n = digits(v).length;
      return /[^\d\s()+.-]/.test(v) || n < 6 || n > 15 ? "Enter a phone number." : null;
    }
    case "number":
      return /^-?\d+([.,]\d+)?$/.test(v.trim()) ? null : "Enter a number.";
    default:
      return null;
  }
}

export function validateAnswers(questions, answers) {
  const errors = {};
  for (const q of questions) {
    const e = validateAnswer(q, answers[q.key]);
    if (e) errors[q.key] = e;
  }
  return errors;
}

/* ---------- a likely typo in an email ---------- */

const DOMAIN_TYPOS = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.in": "gmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outllok.com": "outlook.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
};

/** "asha@gmial.com" → "asha@gmail.com"; null when nothing looks wrong. The ticket goes to this address. */
export function suggestEmail(email) {
  const v = String(email || "").trim();
  const at = v.lastIndexOf("@");
  if (at < 1) return null;
  const domain = v.slice(at + 1).toLowerCase();
  const fix = DOMAIN_TYPOS[domain];
  return fix ? `${v.slice(0, at)}@${fix}` : null;
}

/* ---------- the steps ---------- */

/**
 * Only the steps this event's form has: the ticket when there is a choice of
 * them (docs/TICKETING.md: `requires_choice`, or a hidden type a link names
 * beside the others), the details always, then its questions and its shelf
 * if it has them, then review.
 */
export function stepsFor({ questions = [], items = [], chooseTicket = false } = {}) {
  return [
    chooseTicket && { id: "ticket", label: "Ticket", title: "Choose your ticket" },
    { id: "details", label: "Details", title: "Your details" },
    questions.length > 0 && { id: "questions", label: "Questions", title: "A few questions" },
    items.length > 0 && { id: "addons", label: "Add-ons", title: "Add to your ticket" },
    { id: "review", label: "Review", title: "Review" },
  ].filter(Boolean);
}

/* ---------- the payload ---------- */

/**
 * POST /events/registration/{id}/register, exactly as the form has always
 * sent it: the three details as typed, the answers (or `{}` for an event
 * that asks nothing), the tracking link's code when there is one, and the
 * shelf picks. Unanswered optional questions are left out, as an untouched
 * field always was. `whatsapp_opt_in: true` goes only when the WhatsApp box
 * is ticked with a phone number in, and `club_updates_whatsapp: true` only
 * when "Get updates from <club> on WhatsApp" is (the form shows that box only
 * for a club that offers it, and passes `clubUpdates` false otherwise).
 *
 * `store` goes whenever the event has a shelf, as `[]` when nothing is
 * picked. The server re-places a registration's order only when `store` is
 * there, so leaving it out after taking every pick off kept charging for the
 * earlier picks on the way back to pay. An event with nothing on its shelf
 * still sends no `store`, as it never did.
 *
 * `ticket_type_id` goes only when a ticket was chosen (or a link named one),
 * and `discount_code` only when one was typed: an event with one ticket and
 * no code sends exactly what it always did.
 */
export function buildPayload({
  values,
  questions,
  answers,
  ref,
  items = [],
  picks = {},
  whatsapp = false,
  clubUpdates = false,
  ticketTypeId = null,
  discountCode = null,
}) {
  let details = {};
  if (questions.length > 0) {
    details = undefined;
    for (const q of questions) {
      const v = answers[q.key];
      if (typeof v === "string" && v !== "") details = { ...details, [q.key]: v };
    }
  }
  const payload = {
    full_name: values.name,
    email: values.email,
    phone: values.phone,
    additional_details: details,
    ...(ref ? { ref } : {}),
  };
  if (items.length > 0) payload.store = picksToPayload(items, picks);
  // Only when ticked: unticked is the server's default, and the form's old shape stays as it was.
  if (wantsWhatsapp(values, whatsapp)) payload.whatsapp_opt_in = true;
  if (wantsWhatsapp(values, clubUpdates)) payload.club_updates_whatsapp = true;
  if (ticketTypeId !== null && ticketTypeId !== undefined) payload.ticket_type_id = Number(ticketTypeId);
  const code = typeof discountCode === "string" ? discountCode.trim() : "";
  if (code) payload.discount_code = code;
  return payload;
}

/* ---------- what an error means ---------- */

const DETAIL_FIELDS = { full_name: "name", name: "name", email: "email", phone: "phone" };

/** Field errors the API named, keyed the way the form keys its fields. */
function fieldErrors(source, questionKeys, into = {}) {
  if (!source || typeof source !== "object") return into;
  for (const [k, v] of Object.entries(source)) {
    if (k === "additional_details" && v && typeof v === "object") {
      fieldErrors(v, questionKeys, into);
    } else if (DETAIL_FIELDS[k] && typeof v === "string") {
      into[DETAIL_FIELDS[k]] = v;
    } else if (questionKeys.includes(k) && typeof v === "string") {
      into[`q:${k}`] = v;
    }
  }
  return into;
}

/** FastAPI's own 422: {detail: [{loc: ["body", "email"], msg}]}. */
function detailList(detail) {
  if (!Array.isArray(detail)) return null;
  const out = {};
  for (const d of detail) {
    const loc = Array.isArray(d?.loc) ? d.loc.filter((p) => p !== "body") : [];
    if (!loc.length || typeof d.msg !== "string") continue;
    let cur = out;
    loc.slice(0, -1).forEach((p) => {
      cur = cur[p] = cur[p] || {};
    });
    cur[loc[loc.length - 1]] = d.msg;
  }
  return out;
}

const ALREADY = /already\s+registered/i;

const when = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? formatWhen(iso) : null;
};

/**
 * Why registration is closed (REGISTRATIONS_CLOSED), in words. Never why the
 * server stopped taking registrations when it doesn't say it was the dates:
 * that is the organiser's business, not the reader's.
 */
function closedCopy(errors, status) {
  const reason = typeof errors?.closed_reason === "string" ? errors.closed_reason : null;
  if (reason === "cancelled") {
    return { reason, title: "This event was cancelled", message: "The organisers called it off, so it isn't taking registrations. Nothing was charged." };
  }
  if (reason === "deadline_passed") {
    const at = when(errors.closed_at);
    return { reason, title: "Registration has closed", message: at ? `Registration closed on ${at} IST. The organisers aren't taking new registrations.` : "The organisers aren't taking new registrations." };
  }
  if (reason === "not_started") {
    const at = when(errors.opens_at);
    return { reason, title: "Registration hasn't opened yet", message: at ? `It opens ${at} IST. Come back then.` : "Come back once it opens." };
  }
  return {
    reason: status === 409 ? "paused" : "closed",
    title: "Registration is closed for now",
    message: "This event isn't taking more registrations right now. Keep an eye on the event page in case that changes.",
  };
}

/**
 * Sorts an error from the register call into what the page shows. The
 * server names each refusal with an `error_code`, its sentence in `message`
 * (always a string now) and field errors in `errors`; an older server's
 * shapes (a 409 with no code, `message` as an object of fields, FastAPI's
 * 422 list) are still read.
 *
 *   duplicate  ALREADY_REGISTERED (409 from the public form, 400 signed in),
 *              or a code-less 409 / "already registered": the app, My tickets
 *   awaiting   REGISTRATION_AWAITING_PAYMENT (409): this address has a
 *              registration waiting for payment: Finish payment
 *   closed     REGISTRATIONS_CLOSED: 400 with errors.closed_reason
 *              ("deadline_passed" + closed_at, "not_started" + opens_at,
 *              "cancelled": the club called the event off), or 409 when the
 *              event takes no more right now. {reason, title, message}
 *   full       EVENT_FULL (400, errors.max_participants); `waitlist` when
 *              errors.waitlist says its waiting list can be joined instead
 *   soldout    SOLD_OUT / ITEM_UNAVAILABLE (422, errors {item_id, variant_id,
 *              available}): the add-on is marked on the form
 *   fields     fields the server named, shown beside them: INVALID_ANSWERS
 *              (errors {question_key: message}), CLUB_EMAIL and EMAIL_MISMATCH
 *              (the email), the ticket (`ticket_type`: TICKET_TYPE_REQUIRED,
 *              _NOT_FOUND, _NOT_ON_SALE, _SOLD_OUT, _LIMIT; `ticketTypes` says
 *              the types should be read again, `waitlist` that the sold-out
 *              one's list can be joined), the discount code (`discount_code`:
 *              DISCOUNT_CODE_*), the older shapes
 *   network    no answer at all: try again
 *   auth       signed in, but the sign-in ran out and couldn't be renewed:
 *              nothing was sent as a guest; sign in again, or go on as one
 *   message    anything else the server explained, in its own words
 *   server     a 5xx with nothing to say
 */
export function describeRegisterError(error, questionKeys = []) {
  const status = error?.status ?? error?.response?.status ?? 0;
  const data = error?.data ?? error?.response?.data ?? null;
  const said =
    typeof data?.message === "string" && data.message.trim()
      ? data.message.trim()
      : typeof data?.detail === "string" && data.detail.trim()
        ? data.detail.trim()
        : null;
  const errors = data?.errors && typeof data.errors === "object" && !Array.isArray(data.errors) ? data.errors : null;

  if (error?.authExpired) {
    return { kind: "auth", message: "Your sign-in expired before we could register you. Sign in again to keep this ticket in your account, or register with your email." };
  }
  if (error?.network || (!status && !data)) {
    return { kind: "network", message: "Check your connection and try again — you won't be registered twice." };
  }
  const code = typeof data?.error_code === "string" ? data.error_code : null;
  if (code === "REGISTRATION_AWAITING_PAYMENT") {
    return { kind: "awaiting", message: said || "This email already has a registration for this event that is waiting for payment." };
  }
  if (code === "REGISTRATIONS_CLOSED") return { kind: "closed", ...closedCopy(errors, status) };
  if (code === "EVENT_FULL") {
    const n = Number(errors?.max_participants);
    const waitlist = errors?.waitlist === true;
    return {
      kind: "full",
      title: "This event is full",
      message: `${n > 0 ? `All ${n} seats are taken.` : "Every seat is taken."} ${
        waitlist ? "Join the waiting list and we'll email you if a place opens up." : "Keep an eye on the event page in case one opens up."
      }`,
      ...(waitlist ? { waitlist: true } : {}),
    };
  }
  const typeLine = ticketTypeRefusal(code, errors);
  if (typeLine) {
    return {
      kind: "fields",
      fields: { ticket_type: typeLine },
      message: null,
      ticketTypes: true,
      waitlist: code === "TICKET_TYPE_SOLD_OUT" && errors?.waitlist === true,
      code,
    };
  }
  const codeLine = discountRefusal(code);
  if (codeLine) return { kind: "fields", fields: { discount_code: codeLine }, message: null, code };
  if ((code === "SOLD_OUT" || code === "ITEM_UNAVAILABLE") && errors?.item_id !== undefined && errors?.item_id !== null) {
    return {
      kind: "soldout",
      itemId: String(errors.item_id),
      variantId: errors.variant_id !== undefined && errors.variant_id !== null ? String(errors.variant_id) : null,
      available: code === "SOLD_OUT" ? Math.max(0, Number(errors.available) || 0) : 0,
      message: said ? sentence(said) : "Something in your order has sold out.",
    };
  }
  if (code === "WHATSAPP_NUMBER") {
    return { kind: "fields", fields: { phone: "WhatsApp can't reach this number. Enter a mobile number, or untick the WhatsApp box." }, message: null };
  }
  if (code === "CLUB_EMAIL") {
    return { kind: "fields", fields: { email: said || "This email belongs to a club's account. Register with your own email." }, message: null };
  }
  if (code === "EMAIL_MISMATCH") {
    return { kind: "fields", fields: { email: "This isn't the email you're signed in with. Sign out to register with another one." }, message: null };
  }
  if (code === "ALREADY_REGISTERED" || (!code && status === 409) || (said && ALREADY.test(said))) {
    // Signed in, the server says only "Already registered for this event" (400): where the ticket is says more.
    const mine = status === 400 && (!said || /^already registered for this event\.?$/i.test(said));
    return { kind: "duplicate", message: mine ? "Your ticket is in My tickets, and in your email." : said || "This email is already registered for this event." };
  }
  const fields = {};
  if (data && typeof data.message === "object") fieldErrors(data.message, questionKeys, fields);
  fieldErrors(data?.errors, questionKeys, fields);
  fieldErrors(detailList(data?.detail), questionKeys, fields);
  if (Object.keys(fields).length) return { kind: "fields", fields, message: said && said !== "Invalid request" ? said : null };
  if (said && !(status >= 500 && /internal server error/i.test(said))) return { kind: "message", message: said };
  if (status >= 500) return { kind: "server", message: "Our server ran into a problem. Wait a moment and try again — you won't be registered twice." };
  return { kind: "message", message: "We couldn't register you. Try again in a moment." };
}

/* ---------- a draft, kept for the tab ---------- */

const draftKey = (eventId) => `moa.register.${eventId}`;

/** What was typed, so a refresh or a step back and forth loses nothing. Kept for this tab only. */
export function loadDraft(eventId) {
  try {
    const raw = sessionStorage.getItem(draftKey(eventId));
    const d = raw ? JSON.parse(raw) : null;
    if (!d || typeof d !== "object") return null;
    const strings = (o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([, v]) => typeof v === "string"));
    return {
      values: { name: "", email: "", phone: "", ...strings(d.values) },
      answers: strings(d.answers),
      picks: d.picks && typeof d.picks === "object" ? d.picks : {},
      whatsapp: d.whatsapp === true,
      clubUpdates: d.clubUpdates === true,
      // The ticket chosen, when the event sells more than one.
      ...(Number.isInteger(d.ticketType) && d.ticketType > 0 ? { ticketType: d.ticketType } : {}),
    };
  } catch {
    return null;
  }
}

export function saveDraft(eventId, draft) {
  try {
    sessionStorage.setItem(draftKey(eventId), JSON.stringify(draft));
  } catch {
    /* private mode: the draft just isn't kept */
  }
}

export function clearDraft(eventId) {
  try {
    sessionStorage.removeItem(draftKey(eventId));
  } catch {
    /* nothing kept */
  }
}

/* ---------- the ticket just made, kept for a reload ---------- */

const doneKey = (eventId) => `moa.register.done.${eventId}`;

/**
 * The ticket the form just made, so reloading the page shows it again
 * rather than an empty form. Kept for this tab while the page is open: the
 * page forgets it when it is left (registering a friend next starts afresh).
 */
export function keepDone(eventId, ticket) {
  try {
    sessionStorage.setItem(doneKey(eventId), JSON.stringify(ticket));
  } catch {
    /* private mode: a reload shows the form */
  }
}

export function loadDone(eventId) {
  try {
    const t = JSON.parse(sessionStorage.getItem(doneKey(eventId)) || "null");
    return t && typeof t === "object" && String(t.eventId) === String(eventId) && t.ticket_id ? t : null;
  } catch {
    return null;
  }
}

export function forgetDone(eventId) {
  try {
    sessionStorage.removeItem(doneKey(eventId));
  } catch {
    /* nothing kept */
  }
}

/* ---------- the signed-in person's own registration ---------- */

/**
 * The signed-in person's registration for an event, from GET
 * /events/info/{id} sent with their token:
 *
 *   {state: "none"}                               not registered
 *   {state: "unpaid", registrationId, ticketId}   registered, waiting for payment:
 *                                                 Finish payment pays registrationId
 *   {state: "registered", ticketId}               registered and good at the door
 *                                                 (paid, or a free event)
 *   {state: "unknown", ticketId}                  registered, but the server didn't
 *                                                 say whether it is paid (an older
 *                                                 one): the form's old path
 *
 * null when there is no answer to read.
 */
export function myRegistration(info) {
  if (!info || typeof info !== "object") return null;
  if (!info.is_registered) return { state: "none", registrationId: null, ticketId: null };
  const ticketId = typeof info.ticket_id === "string" && info.ticket_id ? info.ticket_id : null;
  const id = info.registration_id;
  const registrationId = id !== null && id !== undefined && id !== "" ? String(id) : null;
  if (info.is_paid === false && registrationId) return { state: "unpaid", registrationId, ticketId };
  if (info.is_paid === true) return { state: "registered", registrationId, ticketId };
  return { state: "unknown", registrationId, ticketId };
}

/* ---------- an add-on that sold out meanwhile ---------- */

/**
 * The shelf and the picks after the server said an add-on ran out between
 * the shelf loading and the registration (422 SOLD_OUT with what is left, or
 * ITEM_UNAVAILABLE: none at all). The item (or the size) shows what is left,
 * and the pick is cut to fit: to nothing, size and all, when none is.
 */
export function applyStockRefusal(items, picks, { itemId, variantId = null, available = 0 }) {
  const id = String(itemId);
  const left = Math.max(0, Number(available) || 0);
  const item = items.find((i) => String(i.id) === id);
  if (!item) return { items, picks };
  const sized = item.variants.length > 0;
  const variant = sized && variantId !== null ? String(variantId) : null;
  const nextItem = !sized
    ? { ...item, left }
    : { ...item, variants: item.variants.map((v) => (variant === null || String(v.id) === variant ? { ...v, left: variant === null ? 0 : left } : v)) };
  const nextItems = items.map((i) => (i === item ? nextItem : i));

  const p = picks[item.id];
  if (!p || !p.qty) return { items: nextItems, picks };
  let pick = p;
  if (!sized) pick = { ...p, qty: Math.min(p.qty, left) };
  else if (variant === null) pick = { qty: 0, variant_id: null };
  else if (String(p.variant_id) === variant) pick = left > 0 ? { ...p, qty: Math.min(p.qty, left) } : { qty: 0, variant_id: null };
  return { items: nextItems, picks: { ...picks, [item.id]: pick } };
}

/* ---------- the order ---------- */

/**
 * The order, line by line: the ticket (null = paid, amount unknown; `ticket`
 * names its type when there is a choice of them), what a discount code took
 * off it (`discount`: {code, amount}, a negative line), and every add-on picked.
 */
export function orderLines({ fee, items = [], picks = {}, ticket = null, discount = null }) {
  const lines = [ticket ? { id: "ticket", label: "Ticket", sub: ticket, amount: fee } : { id: "ticket", label: "Ticket", amount: fee }];
  if (discount && Number(discount.amount) > 0) lines.push({ id: "discount", label: "Discount", sub: discount.code, amount: -Number(discount.amount) });
  for (const item of items) {
    const p = picks[item.id];
    if (!p || !p.qty) continue;
    const sized = item.variants.length > 0;
    if (sized && !p.variant_id) continue;
    const variant = sized ? item.variants.find((v) => v.id === p.variant_id) : null;
    lines.push({ id: item.id, label: item.name, sub: [variant ? `Size ${variant.label}` : null, `× ${p.qty}`].filter(Boolean).join(" "), amount: item.price * p.qty });
  }
  return lines;
}

/** The id a form field's control gets, so a label, an error and "focus the first problem" all find it. */
export const fieldId = (key) => `rg-f-${String(key).replace(/[^A-Za-z0-9_-]/g, "_")}`;

/* ---------- money ---------- */

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const INR_PAISE = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "₹1,340"; with paise, both places: "₹159.20" (a discount code's share), never "₹159.2". */
export const rupees = (n) => {
  const v = Number(n) || 0;
  return `₹${Number.isInteger(Math.round(v * 100) / 100) ? INR.format(v) : INR_PAISE.format(v)}`;
};
