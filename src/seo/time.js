/**
 * Times for machines: schema.org and RSS want them with a zone. The clubs
 * set every time in India, so structured data says it in India time
 * (+05:30) whatever zone the API wrote it in.
 */
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

const valid = (v) => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const pad = (n) => String(n).padStart(2, "0");

/** "2026-10-18T18:00:00+05:30" for any parseable time; null for none. */
export function istIso(value) {
  const d = valid(value);
  if (!d) return null;
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}+05:30`;
}

/** RFC 822, as RSS dates are written: "Sun, 18 Oct 2026 12:30:00 GMT". */
export function rfc822(value) {
  const d = valid(value);
  return d ? d.toUTCString() : null;
}

/** W3C datetime for sitemaps (ISO in UTC); null for none. */
export function w3c(value) {
  const d = valid(value);
  return d ? d.toISOString() : null;
}
