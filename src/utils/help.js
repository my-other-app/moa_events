/**
 * Help (/help): the support desk's shapes, read and said plainly, shared by
 * the page, its islands and the "Get help" links on error states. Pure.
 *
 * The API (feature-register/support-leads-contract.md, prefix
 * /api/v1/support): GET /help, GET /topics, POST /uploads, POST /requests,
 * GET /requests, GET /requests/{id}, POST /requests/{id}/replies,
 * POST /requests/{id}/survey, POST /survey/{token}; and POST
 * /api/v1/leads/talk-to-us for the For-clubs page. Until the backend has
 * them every call answers 404, and the site says "email us" instead
 * (CONTACT_EMAIL), as it did before.
 */
import { CONTACT_EMAIL } from "@/config";

export const HELP_PATH = "/help";

/** At most this many screenshots (or PDFs) go with a request or a reply, each at most 5 MB. */
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const FILE_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
export const FILE_ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";
/** The longest message the desk takes (the API's own limit). */
export const MAX_MESSAGE = 5000;

/** The topics, when the API has none to say (it always should once the desk exists). */
export const DEFAULT_TOPICS = [
  { key: "account", label: "My account" },
  { key: "tickets", label: "Tickets and registration" },
  { key: "payments", label: "Payments and refunds" },
  { key: "dashboard", label: "The clubs dashboard" },
  { key: "report", label: "Report a post or a person" },
  { key: "bug", label: "Something isn't working" },
  { key: "other", label: "Something else" },
];

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const idOf = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() ? v.trim() : null);
const isoOrNull = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const list = (v, fn) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : []);
/** A short key from the API ("payments", "reply_out"), or null. */
const key = (v) => (typeof v === "string" && /^[a-z][a-z0-9_]{0,40}$/i.test(v.trim()) ? v.trim().toLowerCase() : null);
const text = (v) => (typeof v === "string" && v.trim() ? v.replace(/\r\n?/g, "\n").trim() : null);

/* ---------- reading the answers ---------- */

/** GET /support/help: [{id, topic, question, answer}], in the desk's order; rows without words are dropped. */
export function parseHelpAnswers(d) {
  const rows = Array.isArray(d) ? d : Array.isArray(obj(d)?.items) ? d.items : null;
  if (!rows) return null;
  return list(rows, (r, i) => {
    const o = obj(r);
    if (!o || !str(o.question) || !text(o.answer)) return null;
    return { id: idOf(o.id) ?? `a${i}`, topic: key(o.topic), question: str(o.question), answer: text(o.answer) };
  });
}

/** GET /support/topics: [{key, label}]. Null when it isn't a list. */
export function parseTopics(d) {
  const rows = Array.isArray(d) ? d : Array.isArray(obj(d)?.items) ? d.items : null;
  if (!rows) return null;
  const seen = new Set();
  return list(rows, (r) => {
    const o = obj(r);
    const k = key(o?.key);
    if (!k || seen.has(k)) return null;
    seen.add(k);
    return { key: k, label: str(o.label) || k };
  });
}

export const CASE_STATUSES = ["new", "open", "waiting", "resolved", "closed"];

/** What a request's status means to the person who asked. */
export function statusLabel(status) {
  switch (status) {
    case "new":
      return "Sent";
    case "open":
      return "We're on it";
    case "waiting":
      return "Waiting for you";
    case "resolved":
      return "Solved";
    case "closed":
      return "Closed";
    default:
      return "Sent";
  }
}

/** "#1042": how a request is named to the person and in our emails. */
export const caseNumber = (n) => (n === null || n === undefined || n === "" ? "" : `#${String(n).replace(/^#/, "")}`);

const statusOf = (v) => (CASE_STATUSES.includes(key(v)) ? key(v) : "new");

/** GET /support/requests: the reader's own, newest first as the API sends them. Null when it isn't a list. */
export function parseRequestList(d) {
  const rows = Array.isArray(d) ? d : Array.isArray(obj(d)?.items) ? d.items : null;
  if (!rows) return null;
  return list(rows, (r) => {
    const o = obj(r);
    if (!o || idOf(o.id) === null) return null;
    return {
      id: idOf(o.id),
      number: idOf(o.number),
      subject: str(o.subject),
      topic: key(o.topic),
      status: statusOf(o.status),
      updatedAt: isoOrNull(o.updated_at),
      unread: o.unread === true,
    };
  });
}

const parseAttachment = (a) => {
  const o = obj(a);
  const url = str(o?.url);
  // Private files with links that expire: only a real https link is offered.
  if (!o || !url || !/^https:\/\//i.test(url)) return null;
  return { name: str(o.name) || "Attachment", url };
};

const parseMessage = (m, i) => {
  const o = obj(m);
  const kind = key(o?.kind);
  // Notes never reach the person (the API leaves them out); anything else that isn't to or from them is dropped too.
  if (!o || (kind !== "reply_in" && kind !== "reply_out" && kind !== "system")) return null;
  const body = text(o.body_text);
  const attachments = list(o.attachments, parseAttachment);
  if (!body && !attachments.length) return null;
  return {
    id: idOf(o.id) ?? `m${i}`,
    kind,
    body: body || "",
    authorName: str(o.author_name),
    createdAt: isoOrNull(o.created_at),
    attachments,
  };
};

/** GET /support/requests/{id}: the request and its thread (never notes). Null when it isn't one. */
export function parseRequestDetail(d) {
  const o = obj(d);
  if (!o || idOf(o.id) === null) return null;
  const survey = obj(o.survey);
  return {
    id: idOf(o.id),
    number: idOf(o.number),
    subject: str(o.subject),
    topic: key(o.topic),
    status: statusOf(o.status),
    createdAt: isoOrNull(o.created_at),
    messages: list(o.messages, parseMessage),
    canReply: o.can_reply === true,
    survey: survey ? { solved: survey.solved === true, comment: str(survey.comment) } : null,
  };
}

/* ---------- what goes with a request ---------- */

/**
 * The page a "Get help" link was pressed on, as a path the desk may keep:
 * no query, no #fragment, and the codes in the addresses that are
 * themselves a credential (a ticket, a claim or request link, a survey…)
 * replaced by [code], as Sentry masks them (src/sentry/options.js).
 */
const PRIVATE = /^\/(tickets|certificates|verify|claim|requests|answers|feedback|speakers\/claim|help\/survey)(\/.*)?$/;

export function safePagePath(href) {
  if (typeof href !== "string" || !href.trim()) return null;
  let path;
  try {
    path = new URL(href, "https://myotherapp.in").pathname;
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.length > 300) return null;
  const m = PRIVATE.exec(path);
  if (m && m[2] && m[2] !== "/") {
    // /tickets/cancel is a page of its own (its token is in the query, already gone).
    if (m[1] === "tickets" && m[2] === "/cancel") return path;
    return `/${m[1]}/[code]`;
  }
  return path;
}

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const TRACK = /^[A-Za-z0-9._:-]{1,80}$/;
const EVENT_ID = /^\d{1,12}$/;

/**
 * Where a "Get help" button sends people: /help with what went wrong, so the
 * form opens with it filled in.
 *   topic       one of the desk's topic keys ("payments", "account", …)
 *   errorCode   the API's error_code ("PAYMENT_ORDER_MISMATCH")
 *   trackId     the API's track_id for that refusal, when it sent one
 *   eventId     the event it was about
 *   from        the page it happened on (masked: safePagePath)
 */
export function helpHref({ topic = null, errorCode = null, trackId = null, eventId = null, from = null } = {}) {
  const q = new URLSearchParams();
  if (key(topic)) q.set("topic", key(topic));
  if (typeof errorCode === "string" && CODE.test(errorCode)) q.set("error_code", errorCode);
  if (typeof trackId === "string" && TRACK.test(trackId)) q.set("track_id", trackId);
  if (eventId !== null && eventId !== undefined && EVENT_ID.test(String(eventId))) q.set("event_id", String(eventId));
  const page = safePagePath(from);
  if (page) q.set("from", page);
  const s = q.toString();
  return `${HELP_PATH}${s ? `?${s}` : ""}#ask`;
}

/** What a "Get help" link put in /help's address, checked: {topic, error_code, track_id, event_id, page_url}, each or null. */
export function readHelpPrefill(get) {
  const read = (name) => {
    const v = typeof get === "function" ? get(name) : null;
    return typeof v === "string" ? v.trim() : "";
  };
  const topic = key(read("topic"));
  const code = read("error_code");
  const track = read("track_id");
  const event = read("event_id");
  const from = read("from");
  return {
    topic,
    error_code: CODE.test(code) ? code : null,
    track_id: TRACK.test(track) ? track : null,
    event_id: EVENT_ID.test(event) ? Number(event) : null,
    page_url: from ? safePagePath(from) : null,
  };
}

/** The context a request carries ({platform: "web", page_url, error_code, …}), the empty ones left out. */
export function requestContext(prefill = {}, { pageUrl = null } = {}) {
  const out = { platform: "web" };
  const page = prefill.page_url || safePagePath(pageUrl);
  if (page) out.page_url = `https://myotherapp.in${page}`;
  for (const k of ["error_code", "track_id", "event_id"]) {
    if (prefill[k] !== null && prefill[k] !== undefined && prefill[k] !== "") out[k] = prefill[k];
  }
  return out;
}

/* ---------- checking what is typed ---------- */

export const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());

/**
 * A run of 13 to 19 digits (spaces and dashes allowed) that passes the Luhn
 * check: what a card number looks like. The desk masks them anyway; the form
 * says so before they are sent.
 */
export function looksLikeCard(value) {
  for (const m of String(value || "").matchAll(/(?:\d[ -]?){13,19}/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    let sum = 0;
    for (let i = 0; i < digits.length; i += 1) {
      let d = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}

/** Why a file can't go with a request, in words; null when it can. */
export function fileProblem(file) {
  if (!file) return "Choose a file.";
  const type = String(file.type || "").toLowerCase();
  const byName = /\.(png|jpe?g|webp|pdf)$/i.test(String(file.name || ""));
  if (!(FILE_TYPES.includes(type) || (!type && byName))) return `${file.name || "That file"} isn't a picture or a PDF. Add a PNG, JPG, WebP or PDF.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name || "That file"} is over 5 MB. Add a smaller screenshot.`;
  return null;
}

/** "1.2 MB", "320 KB". */
export function fileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/* ---------- what a refusal means ---------- */

/** A mailto: link to the support address with a subject and the person's words already in it. */
export function mailtoHref({ subject = "", body = "", to = CONTACT_EMAIL } = {}) {
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  if (body) q.set("body", body.slice(0, 1800));
  const s = q.toString().replace(/\+/g, "%20");
  return `mailto:${to}${s ? `?${s}` : ""}`;
}

const FIELD = { message: "message", email: "email", name: "name", topic: "topic", subject: "subject", organisation: "organisation", phone: "phone", city: "city", type: "type" };

/** The API's field errors ({errors: {email: "…"}}, or FastAPI's [{loc, msg}]) as {field: words}. */
function fieldErrors(f) {
  const out = {};
  const errors = obj(f?.errors);
  if (errors) {
    for (const [k, v] of Object.entries(errors)) {
      const field = FIELD[k];
      const said = Array.isArray(v) ? str(v[0]) : str(v);
      if (field && said) out[field] = said;
    }
  }
  return out;
}

/**
 * What a desk call's refusal (apiFailure's shape) means:
 *   {kind: "off"}             the API has no desk yet (404, 405): email us instead
 *   {kind: "fields", fields}  something to fix in the form
 *   {kind: "limit", message}  too many in a row (429)
 *   {kind: "signin", message} the sign-in ran out
 *   {kind: "gone", message}   the request isn't there (404 on one request)
 *   {kind: "network"|"server"|"message", message}
 * `what`: "send" (a new request), "reply", "read", "survey", "upload", "lead".
 */
export function describeSupportError(failure, what = "send") {
  const f = failure || {};
  if (f.authExpired) return { kind: "signin", message: "Your sign-in ran out. Sign in again, then send it." };
  if (f.network) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again." };
  if (f.status === 404 && (what === "read" || what === "reply")) return { kind: "gone", message: "We couldn't find this request. It may belong to another account." };
  if (f.status === 404 && what === "survey") return { kind: "gone", message: "This link isn't valid any more. Thanks all the same." };
  if (f.status === 404 || f.status === 405 || f.status === 501) return { kind: "off" };
  if (f.status === 429) {
    const wait = f.retryAfter ? Math.max(1, Math.ceil(f.retryAfter / 60)) : null;
    return { kind: "limit", message: `That's a lot of messages in a row. Wait ${wait && wait > 1 ? `${wait} minutes` : "a minute"}, then try again.` };
  }
  if (f.status === 401 || f.status === 403) return { kind: "signin", message: "Sign in again to see this request." };
  if (f.status === 409 && what === "survey") return { kind: "done", message: "You've already told us. Thank you." };
  if (f.status === 413) return { kind: "fields", fields: { files: "That file is too big. Add one under 5 MB." } };
  const fields = fieldErrors(f);
  if (Object.keys(fields).length) return { kind: "fields", fields };
  if (f.status >= 500 || !f.status) return { kind: "server", message: "Something went wrong on our side. Try again in a moment." };
  if (f.message) return { kind: "message", message: /[.!?]$/.test(f.message) ? f.message : `${f.message}.` };
  return { kind: "message", message: "That didn't go through. Check what you typed and try again." };
}
