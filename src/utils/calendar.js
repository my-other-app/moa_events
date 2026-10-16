/**
 * "Add to calendar": a Google Calendar link and an .ics file, both made
 * here from the event, with nothing sent anywhere. Times go out in UTC, so
 * every calendar puts the event at the right hour wherever the reader is.
 */

const DEFAULT_HOURS = 2;

const valid = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** 2026-10-18T12:30:00.000Z → "20261018T123000Z". */
export const utcStamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Start and end as Dates; an event with no end is given two hours. Null without a start. */
export function calendarTimes(startIso, end) {
  const start = valid(startIso);
  if (!start) return null;
  const stop = valid(end);
  return { start, end: stop && stop > start ? stop : new Date(start.getTime() + DEFAULT_HOURS * 3600 * 1000) };
}

/** A Google Calendar "add event" link. */
export function googleCalendarUrl({ title, start, end, details, location }) {
  const q = new URLSearchParams({ action: "TEMPLATE", text: title || "Event", dates: `${utcStamp(start)}/${utcStamp(end)}` });
  if (details) q.set("details", details);
  if (location) q.set("location", location);
  q.set("ctz", "Asia/Kolkata");
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Text in an .ics field: backslashes, commas, semicolons and line breaks are escaped (RFC 5545 §3.3.11). */
export const icsText = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");

const utf8Length = (s) => new TextEncoder().encode(s).length;

/** Lines longer than 75 bytes are folded: broken, and the rest carried on a line starting with a space. */
export function foldLine(line) {
  if (utf8Length(line) <= 75) return line;
  const out = [];
  let current = "";
  let limit = 75;
  for (const ch of line) {
    if (utf8Length(current + ch) > limit) {
      out.push(current);
      current = "";
      limit = 74; // the leading space takes one
    }
    current += ch;
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

/** The whole .ics file for one event. */
export function buildIcs({ uid, title, start, end, description, location, url, now = new Date() }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyOtherApp//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(uid)}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${icsText(title || "Event")}`,
    description ? `DESCRIPTION:${icsText(description)}` : null,
    location ? `LOCATION:${icsText(location)}` : null,
    url ? `URL:${icsText(url)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** The file as a link a browser downloads (and a phone offers to add to its calendar). */
export const icsHref = (ics) => `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

/** A safe file name from the event's slug: "hack-night-04.ics". */
export const icsFilename = (name) => `${String(name || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "event"}.ics`;
