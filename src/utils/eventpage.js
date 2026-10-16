import { SITE_URL } from "@/config";
import { TZ, formatDate, formatTime, formatWhen } from "./format";

/**
 * What the event page works out from the event: its addresses, when it
 * runs in words, and what the register button can do right now. Every
 * time is India time, the way the clubs set them.
 */

const valid = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The event's name in addresses: its slug, or its id while it has none. */
export const eventRef = (event) => (event?.slug ? event.slug : event?.id !== null && event?.id !== undefined ? String(event.id) : "");

/** "/events/hack-night-04", or a page under it: "/events/hack-night-04/register". */
export const eventPath = (event, sub = "") => `/events/${encodeURIComponent(eventRef(event))}${sub ? `/${sub}` : ""}`;

/** The canonical address, the one to share: always on the site's own domain. */
export const eventUrl = (event) => (event?.slug || !event?.url ? `${SITE_URL}${eventPath(event)}` : event.url);

/** When it ends: the end it was given, or the start plus its length; null when neither is known. */
export function eventEnd(event) {
  const start = valid(event?.starts_at);
  const end = valid(event?.ends_at);
  if (end && (!start || end > start)) return end;
  const hours = Number(event?.duration_hours);
  if (start && Number.isFinite(hours) && hours > 0) return new Date(start.getTime() + hours * 3600 * 1000);
  return null;
}

const fmt = (options) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...options });
const tileFmt = fmt({ month: "short", day: "numeric" });
const longFmt = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortFmt = fmt({ weekday: "short", day: "numeric", month: "short" });
const dateOnlyFmt = fmt({ day: "numeric", month: "short" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const yearFmt = fmt({ year: "numeric" });

const part = (parts, type) => parts.find((p) => p.type === type)?.value || "";

/** The calendar tile beside the date: {month: "OCT", day: "18"}; null without a date. */
export function dateTile(iso) {
  const d = valid(iso);
  if (!d) return null;
  const p = tileFmt.formatToParts(d);
  return { month: part(p, "month").replace(".", "").slice(0, 3).toUpperCase(), day: part(p, "day") };
}

/** "Saturday, 18 October", with the year only when it isn't this one. */
function longDay(d, now) {
  const p = longFmt.formatToParts(d);
  const year = part(p, "year");
  const head = `${part(p, "weekday")}, ${part(p, "day")} ${part(p, "month")}`;
  return year && year !== yearFmt.format(now) ? `${head} ${year}` : head;
}

const shortDay = (d) => {
  const p = shortFmt.formatToParts(d);
  return `${part(p, "weekday")}, ${part(p, "day")} ${part(p, "month")}`;
};

/**
 * The two lines under the calendar tile:
 *   Saturday, 18 October / 6:00 PM – 9:00 PM IST
 * or, over more than a day:
 *   Sat, 18 Oct – Sun, 19 Oct / Starts 9:00 AM · ends 6:00 PM IST
 */
export function scheduleLines(event, now = new Date()) {
  const start = valid(event?.starts_at);
  if (!start) return null;
  const end = eventEnd(event);
  if (end && dayKeyFmt.format(end) !== dayKeyFmt.format(start)) {
    return { day: `${shortDay(start)} – ${shortDay(end)}`, time: `Starts ${formatTime(start.toISOString())} · ends ${formatTime(end.toISOString())} IST` };
  }
  const time = end ? `${formatTime(start.toISOString())} – ${formatTime(end.toISOString())} IST` : `${formatTime(start.toISOString())} IST`;
  return { day: longDay(start, now), time };
}

/** "Sat, 18 Oct · 6:00 PM", with the year when it isn't this one. */
export function whenLine(iso, now = new Date()) {
  const d = valid(iso);
  if (!d) return "";
  const year = yearFmt.format(d);
  return year === yearFmt.format(now) ? formatWhen(iso) : `${formatWhen(iso)} · ${year}`;
}

/** "18 Oct". */
export const shortDate = (iso) => {
  const d = valid(iso);
  return d ? dateOnlyFmt.format(d) : "";
};

/** Seats still free, when the event has a limit; null when it doesn't (or nobody said). */
export function seatsLeft(event) {
  if (!event?.capacity) return null;
  if (event.seats_left !== null && event.seats_left !== undefined) return Math.max(0, event.seats_left);
  return Math.max(0, event.capacity - (event.going || 0));
}

const LOW_SEATS = 10;

/**
 * What the register button says and does, from the event's status and
 * whether registration is open. Exactly one of these:
 *
 *   open    "Register"                       → the form
 *   soon    "Registration opens 18 Oct"      (disabled)
 *   closed  "Registration closed"            (disabled)
 *   full    "Event full"                     (disabled)
 *   live    "Join the live room", headed "Happening now"
 *   ended   "This event has ended"           (disabled)
 *
 * `note` is the line under the price; `tone: "warn"` when it is urgent.
 */
export function registerState(event, now = Date.now()) {
  const register = eventPath(event, "register");
  const left = seatsLeft(event);
  if (event.status === "ended") {
    const when = formatDate(event.ends_at || event.starts_at);
    return { kind: "ended", label: "This event has ended", note: when ? `Ended ${when}` : null };
  }
  if (event.status === "live") {
    return {
      kind: "live",
      label: "Join the live room",
      href: eventPath(event, "live"),
      eyebrow: "Happening now",
      note: "Polls, questions and the quiz are in the live room.",
      also: event.registration_open ? { label: "Register", href: register } : null,
    };
  }
  if (event.status === "full" || (left === 0 && event.registration_open)) {
    return { kind: "full", label: "Event full", note: event.capacity ? `All ${event.capacity} seats are taken.` : "Every seat is taken." };
  }
  if (event.registration_open) {
    const closes = formatWhen(event.reg_closes_at);
    if (left !== null && left <= LOW_SEATS) {
      return { kind: "open", label: "Register", href: register, note: `Only ${left} ${left === 1 ? "seat" : "seats"} left`, tone: "warn" };
    }
    if (event.status === "closing_soon") {
      return { kind: "open", label: "Register", href: register, note: closes ? `Closing soon · closes ${closes}` : "Registration closes soon", tone: "warn" };
    }
    return { kind: "open", label: "Register", href: register, note: closes ? `Registration closes ${closes}` : null };
  }
  const opens = valid(event.reg_opens_at);
  if (opens && opens.getTime() > now) {
    return { kind: "soon", label: `Registration opens ${shortDate(event.reg_opens_at)}`, note: `Opens ${formatWhen(event.reg_opens_at)} IST` };
  }
  return { kind: "closed", label: "Registration closed", note: "Registration has closed." };
}

/** A short plain-text description for tags and previews: the first lines of the about, on one line. */
export function summary(text, max = 155) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "")}…`;
}
