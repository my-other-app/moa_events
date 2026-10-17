/**
 * Calendar days as India sees them. A day is a plain "YYYY-MM-DD" string
 * and a month is "YYYY-MM": the API takes them that way, they sort as
 * text, and they never shift with the visitor's own clock. The arithmetic
 * runs on UTC midnights, so no daylight-saving change can skip or repeat
 * a day.
 */
import { TZ } from "./format";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const MS_DAY = 86400000;

const pad = (n) => String(n).padStart(2, "0");
const toUtc = (day) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
const fromUtc = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const istYmd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const fmt = (options) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options });
const longDay = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDay = fmt({ day: "numeric", month: "short" });
const shortDayYear = fmt({ day: "numeric", month: "short", year: "numeric" });
const weekdayDay = fmt({ weekday: "short", day: "numeric", month: "short" });
const monthName = fmt({ month: "long", year: "numeric" });
const monthOnly = fmt({ month: "long" });

/** A real calendar day ("2026-02-30" is not one). */
export function isDay(value) {
  const m = typeof value === "string" ? DAY.exec(value) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isMonth(value) {
  const m = typeof value === "string" ? MONTH.exec(value) : null;
  return Boolean(m) && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1970;
}

/** The day it is in India now (or at `at`, a Date, an ISO string or a timestamp); null for a broken time. */
export function istDay(at = Date.now()) {
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? null : istYmd.format(d);
}

export const addDays = (day, n) => fromUtc(toUtc(day) + n * MS_DAY);
export const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / MS_DAY);
/** 0 for Monday … 6 for Sunday: weeks here start on a Monday. */
export const weekdayIndex = (day) => (new Date(toUtc(day)).getUTCDay() + 6) % 7;

export const monthOf = (day) => day.slice(0, 7);
export function addMonths(month, n) {
  const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export const firstOfMonth = (month) => `${month}-01`;
export const lastOfMonth = (month) => addDays(firstOfMonth(addMonths(month, 1)), -1);

/** The same day of the month in another month, kept inside it (31 Jan + 1 month is 28 or 29 Feb). */
export function shiftMonths(day, n) {
  const month = addMonths(monthOf(day), n);
  const last = lastOfMonth(month);
  const candidate = `${month}-${day.slice(8, 10)}`;
  return isDay(candidate) && candidate <= last ? candidate : last;
}

/** The month as weeks of seven, Monday first; a day outside the month is null. */
export function monthWeeks(month) {
  const first = firstOfMonth(month);
  const count = +lastOfMonth(month).slice(8, 10);
  const cells = Array.from({ length: weekdayIndex(first) }, () => null);
  for (let i = 1; i <= count; i += 1) cells.push(`${month}-${pad(i)}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Monday to Sunday, for the column heads: [short, full]. */
export const WEEKDAYS = [
  ["Mo", "Monday"],
  ["Tu", "Tuesday"],
  ["We", "Wednesday"],
  ["Th", "Thursday"],
  ["Fr", "Friday"],
  ["Sa", "Saturday"],
  ["Su", "Sunday"],
];

const at = (day) => new Date(toUtc(day));

/** "Saturday, 17 October 2026" — what a screen reader says for a day. */
export const dayName = (day) => longDay.format(at(day));
/** "Sat 17 Oct". */
export const dayShort = (day) => weekdayDay.format(at(day));
/** "October 2026". */
export const monthLabel = (month) => monthName.format(at(firstOfMonth(month)));
/** "October". */
export const monthWord = (month) => monthOnly.format(at(firstOfMonth(month)));

/**
 * A chosen day or span, short: "17 Oct", "17–24 Oct", "28 Oct – 3 Nov";
 * the year is added when it is not this year's.
 */
export function rangeLabel(from, to = from, today = istDay()) {
  if (!isDay(from)) return "";
  const end = isDay(to) && to > from ? to : from;
  const year = (today || "").slice(0, 4);
  const withYear = from.slice(0, 4) !== year || end.slice(0, 4) !== year;
  const one = (d) => (withYear ? shortDayYear : shortDay).format(at(d));
  if (end === from) return one(from);
  if (monthOf(from) === monthOf(end)) return `${+from.slice(8, 10)}–${one(end)}`;
  return `${one(from)} – ${one(end)}`;
}

/**
 * A span from the address: both ends real days, in order, no more than a
 * year apart (what the API accepts). One end alone is that single day.
 * Null when there is nothing usable.
 */
export function dayRange(from, to) {
  const a = isDay(from) ? from : null;
  const b = isDay(to) ? to : null;
  if (!a && !b) return null;
  let lo = a || b;
  let hi = b || a;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (daysBetween(lo, hi) > 365) return null;
  return { from: lo, to: hi };
}

/**
 * The India days an event covers: [first, last]. An event that ends on the
 * stroke of midnight does not spill into the next day.
 */
export function eventDays(event) {
  const start = istDay(event?.starts_at);
  if (!start || !event.starts_at) return null;
  const endMs = event.ends_at ? new Date(event.ends_at).getTime() : NaN;
  const startMs = new Date(event.starts_at).getTime();
  const end = Number.isFinite(endMs) && endMs > startMs ? istDay(endMs - 1) : start;
  return [start, end && end > start ? end : start];
}
