import { eventPath } from "./eventpage";
import { clampFraming } from "./posterframe";
import { apiFailure } from "./ticketing";

/**
 * "I'm attending" posters (feature-register/posters/CONTRACT.md): what the
 * API says about one guest's poster (GET /posters/{ticket}, §6.1, the same
 * body after every change), read into the shape the pages use, and what
 * each refusal means. Nothing here touches the page.
 *
 * An API without posters answers 404 with no code: read as "off", and the
 * ticket shows nothing more than it did.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const positive = (v) => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};
const iso = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const https = (v) => {
  const s = str(v);
  if (!s) return null;
  try {
    return new URL(s).protocol === "https:" || new URL(s).protocol === "http:" ? s : null;
  } catch {
    return null;
  }
};

/** The formats, in the order the page offers them. */
export const FORMAT_KEYS = ["square", "portrait", "story"];

/** The link's key (`?s=`, and `key` in the answer): a URL-safe secret, 32 hex characters today. */
const KEY = /^[A-Za-z0-9_-]{16,128}$/;
export const isPosterKey = (v) => KEY.test(String(v ?? ""));

/** A render's state: "none" (never drawn for what the poster holds now), "rendering", "ready", "failed". */
const RENDER_STATES = new Set(["none", "rendering", "ready", "failed"]);

function readFrame(v) {
  const f = obj(v);
  const w = positive(f?.width);
  const h = positive(f?.height);
  if (!f || !w || !h) return null;
  const r = Array.isArray(f.radius) ? f.radius : [f.radius, f.radius, f.radius, f.radius];
  const radius = [0, 1, 2, 3].map((i) => Math.max(0, num(r[i]) ?? 0));
  return { x: num(f.x) ?? 0, y: num(f.y) ?? 0, width: w, height: h, radius };
}

/** A framing from the API ({zoom, x, y}) as the page holds it ({zoom, cx, cy}: utils/posterframe.js). */
export const framingFromApi = (v) => {
  const f = obj(v);
  return clampFraming({ zoom: num(f?.zoom) ?? 1, cx: num(f?.x) ?? 0.5, cy: num(f?.y) ?? 0.5 });
};

/** The page's framing as the API takes it (PUT …/framing, §6.5). */
export const framingToApi = (f) => {
  const g = clampFraming(f);
  return { zoom: g.zoom, x: g.cx, y: g.cy };
};

/** One render's state: `{status, fingerprint, retryAfterMs, caption}`. */
export function readRender(v) {
  const r = obj(v);
  const status = RENDER_STATES.has(r?.status) ? r.status : "none";
  const fp = str(r?.fingerprint);
  return {
    status: status === "ready" && !fp ? "none" : status,
    fingerprint: fp,
    retryAfterMs: positive(r?.retry_after_ms),
    caption: str(r?.caption),
  };
}

function readFormat(v) {
  const f = obj(v);
  const key = str(f?.key);
  if (!key || !FORMAT_KEYS.includes(key)) return null;
  return {
    key,
    width: positive(f.width) || 1080,
    height: positive(f.height) || (key === "story" ? 1920 : key === "portrait" ? 1350 : 1080),
    variant: str(f.variant),
    frame: readFrame(f.frame),
    framing: framingFromApi(f.framing),
    render: readRender(f.render),
  };
}

/**
 * The answer to GET /posters/{ticket} (and to every change): null when it
 * isn't one. Not available, it is `{available: false, reason, event?,
 * guest?}`; available, everything the page needs:
 *
 *   key        the link's key: the pictures and every later call go with it
 *   event      {id, name, slug, startsAt, endsAt, path}: path is its page on this site
 *   guest      {name, firstName, initials, role, roleLabel}
 *   moment     {key, phrase, caption}: the caption already filled in
 *   shareUrl   the guest's own link to the event page
 *   photo      {width, height, uploadedAt} or null
 *   formats    [{key, width, height, variant, frame, framing, render}], only those offered
 */
export function parsePoster(d) {
  const o = obj(d);
  if (!o || typeof o.available !== "boolean") return null;
  const e = obj(o.event);
  const event = e
    ? {
        id: num(e.id),
        name: str(e.name) || "this event",
        slug: str(e.slug),
        startsAt: iso(e.starts_at),
        endsAt: iso(e.ends_at),
        path: str(e.slug) || num(e.id) !== null ? eventPath({ slug: str(e.slug), id: num(e.id) }) : null,
      }
    : null;
  const g = obj(o.guest);
  const guest = g
    ? { name: str(g.name), firstName: str(g.first_name), initials: str(g.initials), role: str(g.role) || "attendee", roleLabel: str(g.role_label) }
    : null;
  if (!o.available) return { available: false, reason: str(o.reason) || "off", event, guest };
  const m = obj(o.moment);
  const p = obj(o.photo);
  const pw = positive(p?.width);
  const ph = positive(p?.height);
  const formats = (Array.isArray(o.formats) ? o.formats : []).map(readFormat).filter(Boolean);
  const seen = new Set();
  const offered = formats.filter((f) => !seen.has(f.key) && seen.add(f.key)).sort((a, b) => FORMAT_KEYS.indexOf(a.key) - FORMAT_KEYS.indexOf(b.key));
  // Available with nothing to make (no format): not available, as far as the page can tell.
  if (!offered.length) return { available: false, reason: "off", event, guest };
  return {
    available: true,
    reason: null,
    key: isPosterKey(o.key) ? o.key : null,
    event,
    guest,
    moment: m ? { key: str(m.key) || "before", phrase: str(m.phrase), caption: str(m.caption) } : { key: "before", phrase: null, caption: null },
    shareUrl: https(o.share_url),
    photo: p && pw && ph ? { width: pw, height: ph, uploadedAt: iso(p.uploaded_at) } : null,
    formats: offered,
  };
}

/** The format `key` of a poster, or null. */
export const formatOf = (poster, key) => (poster?.formats || []).find((f) => f.key === key) || null;

/**
 * The frame's corners as CSS, from its radii in canvas px: each corner's
 * share of the frame's width and of its height, so the editor's frame has
 * the design's shape at any size (a circle stays a circle).
 */
export function frameRadius(frame) {
  if (!frame) return undefined;
  const pct = (r, side) => `${Math.round(Math.min(50, (r / side) * 100) * 100) / 100}%`;
  const across = frame.radius.map((r) => pct(r, frame.width)).join(" ");
  const down = frame.radius.map((r) => pct(r, frame.height)).join(" ");
  return `${across} / ${down}`;
}

/** The photo frame's width ÷ height; the format's own when its design has no frame. */
export const frameAspect = (fmt) => (fmt?.frame ? fmt.frame.width / fmt.frame.height : fmt ? fmt.width / fmt.height : 1);

/** "im-attending-devfest-2026-square.png": the name the server gives a download too. */
export function posterFilename(poster, format) {
  const slug = (poster?.event?.slug || "event").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "event";
  const phrase = (poster?.moment?.phrase || "I'm attending").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "poster";
  return `${phrase}-${slug}-${format}.png`;
}

/* ---------- not available: why, in words ---------- */

/**
 * What the poster page says for each `reason` (§5). The ticket itself shows
 * no way in for any of them; the page says them for a guest who followed a
 * link from their email.
 */
export const UNAVAILABLE = {
  off: {
    title: "Posters aren’t on for this event",
    text: "The organisers haven’t turned on posters for this event. Your ticket is unchanged.",
  },
  event_cancelled: {
    title: "This event was called off",
    text: "There’s no poster to make for an event that isn’t happening.",
  },
  cancelled: {
    title: "This registration is no longer active",
    text: "The ticket was given back or removed, so there’s no poster for it.",
  },
  revoked: {
    title: "This ticket was revoked",
    text: "The organisers revoked this ticket, so there’s no poster for it. If you think this is a mistake, contact them.",
  },
  not_sent: {
    title: "Your poster isn’t ready yet",
    text: "You can make your poster once your ticket has been sent to you. Check back after it arrives.",
  },
  moment_off: {
    title: "Posters aren’t open right now",
    text: "The organisers have posters switched off for now. Check back later.",
  },
};

export const unavailableWords = (reason) => UNAVAILABLE[reason] || UNAVAILABLE.off;

/* ---------- what a refusal means ---------- */

const minutes = (seconds) => {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return m === 1 ? "a minute" : `${m} minutes`;
};

/**
 * Any refusal of a poster call, as the page needs it:
 *   {kind: "not_yours"}            401 / 403 (POSTER_FORBIDDEN): this browser may not open it
 *   {kind: "missing"}              404 TICKET_NOT_FOUND (or an address the API won't take)
 *   {kind: "off"}                  404 without a code: an API without posters
 *   {kind: "unavailable", reason}  409 POSTER_NOT_AVAILABLE: switched off or closed meanwhile
 *   {kind: "limit", message}       429: too many in a row
 *   {kind: "busy", message}        503 POSTER_RENDER_BUSY: the drawing failed; try again
 *   {kind: "too_big", message}     413: the photo is over the limit
 *   {kind: "bad_photo", message}   422 on an upload: not a picture the server could read
 *   {kind: "network", message}     no answer
 *   {kind: "error", message}       anything else
 */
export function describePosterError(error, { upload = false } = {}) {
  const f = apiFailure(error);
  if (f.authExpired) return { kind: "not_yours", message: "Your sign-in has expired. Sign in again, or open the poster link in your ticket email." };
  if (f.network) return { kind: "network", message: "We couldn’t reach MyOtherApp. Check your connection and try again." };
  if (f.status === 401 || f.status === 403) return { kind: "not_yours", message: null };
  if (f.status === 404 && f.code === "TICKET_NOT_FOUND") return { kind: "missing", message: null };
  if (f.status === 404 && !f.code) return { kind: "off", message: null };
  if (f.status === 400) return { kind: "missing", message: null };
  if (f.status === 409 && f.code === "POSTER_NOT_AVAILABLE") return { kind: "unavailable", reason: str(f.errors?.reason) || str(obj(error?.data)?.reason) || str(obj(error?.response?.data)?.reason) || "off", message: null };
  if (f.status === 429) {
    const wait = num(f.errors?.retry_after) || f.retryAfter;
    return { kind: "limit", message: wait ? `That’s a lot of changes in a short time. Try again in ${minutes(wait)}.` : "That’s a lot of changes in a short time. Try again in a few minutes." };
  }
  if (f.status === 503) return { kind: "busy", message: "Your poster couldn’t be drawn just now. Try again in a moment." };
  if (f.status === 413) return { kind: "too_big", message: "That photo is too big. Choose one under 12 MB." };
  if (upload && f.status === 422) return { kind: "bad_photo", message: f.message ? sentenceOf(f.message) : "We couldn’t read that photo. Try another one." };
  if (f.status === 409 && f.code === "NO_PHOTO") return { kind: "error", message: "Add a photo first." };
  return { kind: "error", message: "Something went wrong on our side. Try again in a moment." };
}

const sentenceOf = (s) => {
  const t = String(s || "").trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};
