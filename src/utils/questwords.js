import { formatWhen, formatTime, plural } from "./format";

/**
 * The quest card's words, from plain values (utils/quests.js reads the API
 * into them). Every time is India time, whatever the visitor's clock.
 */

const valid = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const sameIstDay = (a, b) => IST_DAY.format(a) === IST_DAY.format(b);

/** "6:00 PM" when it's the same India day as `now`, else "Sat, 28 Nov · 6:00 PM". */
export function whenShort(iso, now = Date.now()) {
  const d = valid(iso);
  if (!d) return "";
  return sameIstDay(d, new Date(now)) ? formatTime(iso) : formatWhen(iso);
}

/** "at 6:00 PM" the same India day as `now`, else "on Sat, 28 Nov at 6:00 PM"; "" when missing. */
export function atWhen(iso, now = Date.now()) {
  const d = valid(iso);
  if (!d) return "";
  return sameIstDay(d, new Date(now)) ? `at ${formatTime(iso)}` : `on ${formatWhen(iso).replace(" · ", " at ")}`;
}

/** "3 points" / "1 point"; "2 tasks" / "1 task". */
export const unitWord = (mode, n) => (mode === "points" ? plural(n, "point") : plural(n, "task"));

/** A task's own time window, said for a task not yet done: "Opens at 2:00 PM", "Until 3:00 PM", "2:00 PM – 3:00 PM", "Closed". */
export function windowLine(from, to, now = Date.now()) {
  const f = valid(from);
  const t = valid(to);
  if (!f && !t) return null;
  if (t && t.getTime() <= now) return "Closed";
  if (f && f.getTime() > now) return t ? `${whenShort(from, now)} – ${formatTime(to)}` : `Opens ${atWhen(from, now)}`;
  return t ? `Until ${whenShort(to, now)}` : null;
}

/** Whether a window is shut right now (not open yet, or over). */
export function outsideWindow(from, to, now = Date.now()) {
  const f = valid(from);
  const t = valid(to);
  return Boolean((f && f.getTime() > now) || (t && t.getTime() <= now));
}

/** "At 10 points" / "After 3 tasks". */
export const milestoneAt = (mode, threshold) => (mode === "points" ? `At ${plural(threshold, "point")}` : `After ${plural(threshold, "task")}`);

/** "a T-shirt", "Stickers and a mug", "A, B and C": a list in a sentence. */
export function rewardList(names) {
  const n = names.filter(Boolean);
  if (n.length === 0) return "";
  if (n.length === 1) return n[0];
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/** Where to collect: the swag desks' own names, or "the swag desk". */
export const desksLine = (names) => (names && names.length ? rewardList(names) : "the swag desk");

/** "a minute", "10 minutes": a wait in seconds, rounded up to minutes. */
export function minutesWord(secs) {
  const m = Math.max(1, Math.ceil((Number(secs) || 60) / 60));
  return m === 1 ? "a minute" : `${m} minutes`;
}
