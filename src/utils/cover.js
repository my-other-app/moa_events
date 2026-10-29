/**
 * The small decisions behind the cards: where an event links to, the look of
 * the cover we draw when there is no poster, the date pieces in India time,
 * and how full an event is. Kept apart from the components so they can be
 * tested on their own and shared by the cards, the hero and the club page.
 */
import { TZ } from "./format";
import { appliedCount } from "./eventpage";

/** Just what a drawn cover is made from: the id, the category, the date and whether it is online. */
export const coverFields = (event) => ({
  id: event?.id ?? null,
  category: event?.category ? { id: event.category.id, name: event.category.name || "" } : null,
  starts_at: event?.starts_at || null,
  is_online: Boolean(event?.is_online),
});

/** A stable number for anything: a numeric id is its own seed, text is hashed. */
export function seedOf(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.abs(Math.floor(value));
  const s = String(value ?? "");
  if (/^\d{1,9}$/.test(s)) return Number(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The cover palettes: the site's slate, ink, pale yellow and sky, in light
 * and dark. `ink` is the text on the cover, `accent` the main shape, `pop` a
 * small second shape, `line` the strokes and `soft` the quiet fills.
 */
export const COVER_PALETTES = [
  { name: "night", bg: "linear-gradient(160deg, #2c3440 0%, #111827 100%)", ink: "#ffffff", sub: "rgba(255,255,255,0.72)", accent: "#f9ffa1", pop: "#38bdf8", line: "rgba(255,255,255,0.22)", soft: "rgba(255,255,255,0.08)" },
  { name: "citron", bg: "linear-gradient(160deg, #fbffc8 0%, #eef77a 100%)", ink: "#111827", sub: "rgba(17,24,39,0.66)", accent: "#2c3440", pop: "#0284c7", line: "rgba(17,24,39,0.22)", soft: "rgba(17,24,39,0.07)" },
  { name: "sky", bg: "linear-gradient(160deg, #0284c7 0%, #075985 100%)", ink: "#ffffff", sub: "rgba(255,255,255,0.78)", accent: "#f9ffa1", pop: "#111827", line: "rgba(255,255,255,0.3)", soft: "rgba(255,255,255,0.1)" },
  { name: "paper", bg: "linear-gradient(160deg, #f9fafb 0%, #e5e7eb 100%)", ink: "#111827", sub: "rgba(17,24,39,0.62)", accent: "#0284c7", pop: "#f9ffa1", line: "rgba(17,24,39,0.18)", soft: "rgba(17,24,39,0.06)" },
  { name: "ink", bg: "linear-gradient(160deg, #1f2937 0%, #0b1120 100%)", ink: "#ffffff", sub: "rgba(255,255,255,0.7)", accent: "#38bdf8", pop: "#f9ffa1", line: "rgba(56,189,248,0.35)", soft: "rgba(56,189,248,0.1)" },
  { name: "mist", bg: "linear-gradient(160deg, #eef9ff 0%, #c4e8fb 100%)", ink: "#111827", sub: "rgba(17,24,39,0.62)", accent: "#0284c7", pop: "#2c3440", line: "rgba(2,132,199,0.3)", soft: "rgba(2,132,199,0.1)" },
];

/** The shapes a cover can carry. */
export const COVER_MOTIFS = ["rings", "grid", "burst", "arches", "bars", "waves", "stripes", "blocks"];

/**
 * The look of a generated cover, the same every time for the same event:
 *  - the colour comes from the event (or club) id, so neighbours differ;
 *  - the shape comes from a small set that belongs to the category (three
 *    shapes each), picked by the id — a row of workshops reads as one
 *    family without being eight copies of the same picture.
 */
export function coverLook({ id, category } = {}) {
  const idSeed = seedOf(id);
  const catId = category && typeof category === "object" ? category.id : category;
  const hasCat = catId !== null && catId !== undefined && catId !== "";
  const shape = hasCat ? seedOf(catId) * 3 + (Math.floor(idSeed / 2) % 3) : idSeed;
  return {
    palette: COVER_PALETTES[idSeed % COVER_PALETTES.length],
    motif: COVER_MOTIFS[shape % COVER_MOTIFS.length],
    variant: Math.floor(idSeed / COVER_PALETTES.length) % 3,
  };
}

/** The colour behind someone's initials: theirs every time, and never one too pale to read on the card. */
export function faceLook(name) {
  const strong = COVER_PALETTES.filter((p) => p.name !== "paper");
  return { palette: strong[seedOf(String(name || "").toLowerCase()) % strong.length] };
}

const partsFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });

/** { day: "17", month: "Oct", weekday: "Sat" } in India time; null when the date is missing or broken. */
export function dateParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = partsFmt.formatToParts(d);
  const get = (type) => p.find((x) => x.type === type)?.value || "";
  return { day: get("day"), month: get("month"), weekday: get("weekday") };
}

/**
 * Where a card opens: the event page by its slug, or by its id while the API
 * does not send slugs yet.
 */
export function eventHref(event) {
  if (!event) return "/events";
  if (typeof event.slug === "string" && event.slug.trim()) return `/events/${encodeURIComponent(event.slug.trim())}`;
  return `/${encodeURIComponent(event.id)}`;
}

/**
 * How full an event is, when the club set a capacity:
 *  - "open":  nobody yet, so just the number of seats
 *  - "bar":   filling up, shown as a slim bar
 *  - "few":   ten or fewer seats (or the last 15%) left
 *  - "full":  nothing left
 * Null when there is no capacity or the event is over, and on an event that
 * reviews registrations (the club decides who gets in: the card says how
 * many applied instead).
 */
export function seatsInfo(event) {
  const capacity = Number(event?.capacity);
  if (!event || !Number.isFinite(capacity) || capacity <= 0 || event.status === "ended" || appliedCount(event) !== null) return null;
  const going = Math.max(0, Number(event.going) || 0);
  const left = Math.max(0, Math.round(capacity - going));
  const pct = Math.min(100, Math.round((going / capacity) * 100));
  if (left === 0 || event.status === "full") return { kind: "full", capacity, going, left: 0, pct: 100 };
  if (going === 0) return { kind: "open", capacity, going, left, pct: 0 };
  if (left <= Math.max(10, Math.ceil(capacity * 0.15))) return { kind: "few", capacity, going, left, pct };
  return { kind: "bar", capacity, going, left, pct };
}

/** "Asha Rao" → "AR", "madonna" → "M". */
export function initials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0] || "";
  const last = words.length > 1 ? words[words.length - 1][0] || "" : "";
  return (first + last).toUpperCase();
}

/**
 * The events the home hero shows off: live first, then ones with a poster,
 * then the soonest; never one that has ended, never the same one twice.
 */
export function heroPicks(home, count = 3) {
  if (!home) return [];
  const seen = new Set();
  const pool = [];
  for (const key of ["near", "this_week", "popular", "online"]) {
    for (const e of home[key] || []) {
      if (!e || seen.has(e.id) || e.status === "ended") continue;
      seen.add(e.id);
      pool.push(e);
    }
  }
  const time = (e) => {
    const t = Date.parse(e.starts_at || "");
    return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
  };
  return pool
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const live = (b.e.status === "live") - (a.e.status === "live");
      if (live) return live;
      const poster = Boolean(b.e.poster) - Boolean(a.e.poster);
      if (poster) return poster;
      return time(a.e) - time(b.e) || a.i - b.i;
    })
    .slice(0, count)
    .map(({ e }) => e);
}
