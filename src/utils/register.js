import { picksToPayload } from "./picks";

/**
 * What the registration flow works out without touching the page: which
 * steps an event's form has, how each organiser question is typed in,
 * what counts as a valid answer, the payload the API is sent, and what an
 * error from it means.
 */

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

/** Your details: a name the server accepts (3–100 letters), an email the ticket can reach, a phone number. */
export function validateDetails(values) {
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

/** Only the steps this event's form has: the details always, then its questions and its shelf if it has them, then review. */
export function stepsFor({ questions = [], items = [] } = {}) {
  return [
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
 * shelf picks when there are any. Unanswered optional questions are left
 * out, as an untouched field always was.
 */
export function buildPayload({ values, questions, answers, ref, items, picks }) {
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
  const store = picksToPayload(items, picks);
  if (store.length > 0) payload.store = store;
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

/**
 * Sorts an error from the register call into what the page shows:
 *   duplicate  409 ALREADY_REGISTERED (or any "already registered"): the
 *              server's words, and the app
 *   awaiting   409 REGISTRATION_AWAITING_PAYMENT: an unpaid registration under
 *              this address; the server says when to come back, or the app
 *   fields     the server named fields (or CLUB_EMAIL, which is about the
 *              email): shown beside them
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
  if (code === "CLUB_EMAIL") {
    return { kind: "fields", fields: { email: said || "This email belongs to a club's account. Register with your own email." }, message: null };
  }
  if (code === "ALREADY_REGISTERED" || status === 409 || (said && ALREADY.test(said))) {
    return { kind: "duplicate", message: said || "This email is already registered for this event." };
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

/* ---------- the order ---------- */

/** The order, line by line: the ticket (null = paid, amount unknown) and every add-on picked. */
export function orderLines({ fee, items = [], picks = {} }) {
  const lines = [{ id: "ticket", label: "Ticket", amount: fee }];
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

/** "₹1,340". */
export const rupees = (n) => `₹${INR.format(Number(n) || 0)}`;
