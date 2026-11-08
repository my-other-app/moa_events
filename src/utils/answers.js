import { siteHref } from "@/lib/href";
import { conditionOf, visibleKeys } from "./conditions";
import { formatWhen } from "./format";
import { parseQuestions, validateAnswers } from "./register";
import { apiFailure } from "./ticketing";

/**
 * Missing answers (feature-register/missing-answers-contract.md): a club
 * changed its sign-up questions after people signed up, and asks those
 * people for the answers it is missing, with a personal link
 * (/answers/{eventId}/{ref}?k=, §2.2). Nothing here touches the page: the
 * answers page's shape as the API sends it (GET and POST
 * /events/{id}/answers/{ref}, §2.3), which of the form's questions the page
 * shows and sends, what a refusal means, and the "details needed" note's
 * flag on a ticket, a My tickets row and a registration request (§2.4).
 *
 * An API without missing answers sends no `answers_needed`, and every page
 * stays what it was.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const iso = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const idOf = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? v : null);
const blank = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.every(blank));

/* ---------- the note: "2 details needed · Add them" ---------- */

/**
 * `answers_needed` on a ticket, a My tickets row or a registration request:
 * {count, href, deadline}, or null when there is nothing to ask (null, or an
 * API that doesn't send it). `href` is the personal link as the site links
 * it (its path on this site); without one there is no note, as there would
 * be nowhere to add them. `count` is null when the API gave none worth
 * saying; a count of 0 is nothing to ask.
 */
export function parseAnswersNeeded(v) {
  const o = obj(v);
  const href = siteHref(o?.url);
  if (!o || !href) return null;
  const n = typeof o.count === "string" && o.count.trim() !== "" ? Number(o.count) : o.count;
  const counted = typeof n === "number" && Number.isFinite(n);
  if (counted && n < 1) return null;
  return { count: counted && Number.isInteger(n) ? n : null, href, deadline: iso(o.deadline) };
}

/** "2 details", "1 detail". */
export const detailsWord = (n) => `${n} ${n === 1 ? "detail" : "details"}`;

/** "2 details needed", "1 detail needed"; "Details needed" without a count. */
export const detailsNeeded = (count) => (count > 0 ? `${detailsWord(count)} needed` : "Details needed");

/** "Add them", or "Add it" for one. */
export const addThem = (count) => (count === 1 ? "Add it" : "Add them");

/** "Sat, 14 Nov · 6:00 PM IST", or null without a deadline. */
export const byWhen = (deadline) => {
  const at = formatWhen(deadline);
  return at ? `${at} IST` : null;
};

/* ---------- the answers page ---------- */

export const ANSWER_STATUSES = new Set(["open", "done", "closed", "nothing"]);

/**
 * GET (and POST) /events/{id}/answers/{ref}, as the page reads it:
 *
 *   {status, event: {id, slug, name, startsAt, orgName, poster},
 *    person: {firstName, kind}, deadline, message,
 *    questions (parseQuestions: the whole form), asked (keys, in the form's
 *    order), answers (what they have already), ticketHref, requestHref}
 *
 * `status`: open (something to add), done (nothing left), closed (past the
 * deadline, or the event ended), nothing (the registration no longer
 * counts). One this site doesn't know is read as open while something is
 * asked, else done; so is "open" with nothing asked. `asked` holds only keys
 * the form has. `ticketHref` is the ticket's page (a confirmed
 * registration). `requestHref` is a registration request's page, when an API
 * sends `request_url` (the contract's v1 doesn't). Null when it isn't one.
 */
export function parseAnswersPage(d) {
  const o = obj(d);
  if (!o) return null;
  const ev = obj(o.event) || {};
  const person = obj(o.person) || {};
  const questions = parseQuestions(o.questions);
  const order = questions.map((q) => q.key);
  const said = new Set(Array.isArray(o.asked) ? o.asked.filter((k) => typeof k === "string") : []);
  const asked = order.filter((k) => said.has(k));
  let status = ANSWER_STATUSES.has(o.status) ? o.status : asked.length ? "open" : "done";
  if (status === "open" && !asked.length) status = "done";
  return {
    status,
    event: {
      id: idOf(ev.id),
      slug: str(ev.slug),
      name: str(ev.name) || "this event",
      startsAt: iso(ev.starts_at) || iso(ev.event_datetime),
      orgName: str(ev.org_name) || str(obj(ev.club)?.name),
      poster: ev.poster || null,
    },
    person: { firstName: str(person.first_name), kind: person.kind === "request" ? "request" : "registration" },
    deadline: iso(o.deadline),
    message: str(o.message),
    questions,
    asked,
    answers: obj(o.answers) || {},
    ticketHref: siteHref(o.ticket_url),
    requestHref: siteHref(o.request_url),
  };
}

/**
 * The questions this page may show and send: the asked ones, and every
 * question that hangs off one (a child, its children, …: contract §2.3
 * "questions that become visible through them"). One pass in the form's
 * order, as a parent always comes before its children (rule R1).
 */
export function editableKeys(questions, asked) {
  const keys = new Set(asked);
  for (const q of questions) {
    const cond = conditionOf(q);
    if (cond && keys.has(cond.key)) keys.add(q.key);
  }
  return keys;
}

/**
 * A stored answer as the form's controls hold it: one string. A number as
 * its digits; a list of ticks (the app may send one) as its first, which is
 * what a pick-one control can show; anything else as nothing.
 */
export function asText(v) {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    const first = v.find((x) => (typeof x === "string" && x.trim()) || (typeof x === "number" && Number.isFinite(x)));
    return first === undefined ? "" : String(first);
  }
  return "";
}

/**
 * What the form starts from:
 *
 *   base     the answers to questions this page doesn't ask, as they are:
 *            they still decide which questions are shown (a parent answered
 *            at sign-up)
 *   values   the asked questions and their children, prefilled from what
 *            the person has already (as text)
 *   stored   those as they were, to tell an answer left alone from one changed
 *   asked, editable
 */
export function startAnswers(page) {
  const questions = page?.questions || [];
  const asked = page?.asked || [];
  const editable = editableKeys(questions, asked);
  const stored = page?.answers || {};
  const base = {};
  const values = {};
  for (const [k, v] of Object.entries(stored)) {
    if (!editable.has(k)) base[k] = v;
  }
  for (const q of questions) {
    if (editable.has(q.key)) values[q.key] = asText(stored[q.key]);
  }
  return { questions, asked, editable, base, stored, values };
}

/** Every answer as the questions' visibility reads it: the form's own over the rest. */
const everything = (form, values = form.values) => ({ ...form.base, ...values });

/** The questions shown, in the form's order: those this page asks (and their children) that apply to this person now. */
export function shownQuestions(form, values = form.values) {
  const visible = visibleKeys(form.questions, everything(form, values));
  return form.questions.filter((q) => form.editable.has(q.key) && visible.has(q.key));
}

/**
 * An answer the person gave before to a question that isn't asked (a child
 * of one), and hasn't changed here: the API has it, so it is neither checked
 * again nor sent.
 */
export const untouched = (form, key, values = form.values) => !form.asked.includes(key) && !blank(form.stored[key]) && values[key] === asText(form.stored[key]);

/**
 * One answer changed: {values, added, removed}. A question it hides is taken
 * off and its answer cleared (contract §8); the questions it brings in and
 * those it takes away come back for the screen reader's note
 * (utils/register.js revealNote).
 */
export function changeAnswer(form, values, key, value) {
  const next = { ...values, [key]: value };
  const before = visibleKeys(form.questions, everything(form, values));
  const after = visibleKeys(form.questions, everything(form, next));
  const added = [];
  const removed = [];
  for (const q of form.questions) {
    if (!form.editable.has(q.key)) continue;
    if (after.has(q.key) && !before.has(q.key)) added.push(q);
    else if (before.has(q.key) && !after.has(q.key)) {
      removed.push(q);
      next[q.key] = "";
    }
  }
  return { values: next, added, removed };
}

/** What to fix before saving, keyed by question: the register form's own checks, on the questions shown and not left alone. */
export function answersErrors(form, values = form.values) {
  const keys = shownQuestions(form, values)
    .filter((q) => !untouched(form, q.key, values))
    .map((q) => q.key);
  return validateAnswers(form.questions, everything(form, values), { keys });
}

/**
 * The POST's `answers`: every question shown and not left alone that has an
 * answer. A blank one is left out, as the register form leaves it out
 * (utils/register.js buildPayload); a hidden one never goes (the API prunes
 * it too).
 */
export function answersPayload(form, values = form.values) {
  const out = {};
  for (const q of shownQuestions(form, values)) {
    if (untouched(form, q.key, values)) continue;
    const v = values[q.key];
    if (typeof v === "string" && v.trim() !== "") out[q.key] = v;
  }
  return out;
}

/* ---------- what a refusal means ---------- */

const TOO_MANY = "Too many tries in a row. Wait a minute, then try again.";

/** Field messages the API named, for the questions in `keys`: `errors` ({key: message}, or under `answers`) or FastAPI's 422 list. */
function fieldMessages(data, keys) {
  const known = new Set(keys);
  const out = {};
  const take = (source) => {
    for (const [k, v] of Object.entries(obj(source) || {})) {
      if (known.has(k) && typeof v === "string" && v.trim()) out[k] = v.trim();
    }
  };
  const errors = obj(data?.errors);
  take(errors);
  take(errors?.answers);
  if (Array.isArray(data?.detail)) {
    for (const d of data.detail) {
      const loc = Array.isArray(d?.loc) ? d.loc.map(String) : [];
      const k = loc.find((p) => known.has(p));
      if (k && typeof d.msg === "string") out[k] = d.msg;
    }
  }
  return out;
}

/**
 * Reading the page, or saving it:
 *
 *   invalid   404 (a bad ref or key), or 401 / 403 (no key, and not the
 *             holder): "This link doesn't work"
 *   closed    409 (CLOSED: past the deadline, or the event ended)
 *   fields    the answers the API refused (422, or 400 INVALID_ANSWERS as
 *             registration does), {fields: {key: message}, message}
 *   limit     429 (20 a minute per person)
 *   network   no answer at all
 *   server    a 5xx
 *   message   anything else, in the API's words when it said some
 */
export function describeAnswersError(error, keys = []) {
  const f = apiFailure(error);
  const data = obj(error?.data) || obj(error?.response?.data);
  if (f.status === 404 || f.status === 401 || f.status === 403) return { kind: "invalid" };
  if (f.status === 409) return { kind: "closed" };
  if (f.status === 429) return { kind: "limit", message: TOO_MANY };
  if (f.status === 400 || f.status === 422) {
    const fields = fieldMessages(data, keys);
    if (Object.keys(fields).length) return { kind: "fields", fields, message: f.message && f.message !== "Check your answers." ? f.message : null };
  }
  if (f.network) return { kind: "network", message: "We couldn't reach MyOtherApp. Check your connection and try again." };
  if (f.status >= 500) return { kind: "server", message: "Something broke on our side. Wait a moment and try again." };
  return { kind: "message", message: f.message || "That didn't save. Try again in a moment." };
}
