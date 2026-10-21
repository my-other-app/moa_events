/**
 * What a stable media address (/media/...) stands for, and how long the
 * link it leads to stays good. Pure: the route handler
 * (src/app/media/[...path]/route.js) fetches, these decide.
 *
 *   /media/events/{ref}/poster[?size=]              the poster (else the drawn cover)
 *   /media/events/{ref}/cover                        the drawn cover, as a PNG
 *   /media/events/{ref}/speakers/{id | iN}/photo     a speaker's photo
 *   /media/events/{ref}/team/{n}/photo               someone on the event's team
 *   /media/clubs/{slug}/logo[?size=] | cover[?size=]
 *   /media/clubs/{slug}/team/{n}/photo
 *   /media/clubs/{slug}/partners/{n}/logo
 *   /media/threads/{id}/image[?size=]
 */
import { imageUrl } from "@/utils/format";

const SIZES = new Set(["thumbnail", "medium", "original"]);
const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const INDEX = /^\d{1,3}$/;

export const sizeOf = (v, fallback = "original") => (SIZES.has(v) ? v : fallback);

/**
 * Reads a media path (the segments after /media) into what to look up:
 *   {source: "event" | "club" | "thread", ref, pick}   or null for nonsense.
 * `pick(data, size)` takes that thing's parsed page and returns the image's
 * current link, null when it has none.
 */
export function mediaTarget(segments) {
  const [kind, ref, a, b, c] = segments || [];
  if (!REF.test(String(ref || ""))) return null;
  const n = segments.length;
  if (kind === "events") {
    if (n === 3 && a === "poster") return { source: "event", ref, what: "poster", pick: posterOf };
    if (n === 3 && a === "cover") return { source: "event", ref, what: "cover", pick: () => null };
    if (n === 5 && a === "speakers" && c === "photo" && /^(i\d{1,3}|[A-Za-z0-9_-]{1,64})$/.test(b || "")) {
      return { source: "event", ref, what: "speaker", pick: (p, size) => speakerPhoto(p, b, size) };
    }
    if (n === 5 && a === "team" && c === "photo" && INDEX.test(b || "")) {
      return { source: "event", ref, what: "team", pick: (p, size) => imageUrl(p?.team?.[Number(b)]?.photo, sizeOf(size, "medium")) };
    }
    return null;
  }
  if (kind === "clubs") {
    if (n === 3 && (a === "logo" || a === "cover")) return { source: "club", ref, what: a, pick: (d, size) => imageUrl(d?.club?.[a], sizeOf(size, a === "logo" ? "thumbnail" : "original")) };
    if (n === 5 && a === "team" && c === "photo" && INDEX.test(b || "")) {
      return { source: "club", ref, what: "team", pick: (d, size) => imageUrl(d?.team?.[Number(b)]?.photo, sizeOf(size, "medium")) };
    }
    if (n === 5 && a === "partners" && c === "logo" && INDEX.test(b || "")) {
      return { source: "club", ref, what: "partner", pick: (d, size) => imageUrl(d?.partners?.[Number(b)]?.logo, sizeOf(size, "medium")) };
    }
    return null;
  }
  if (kind === "threads" && n === 3 && a === "image") return { source: "thread", ref, what: "image", pick: (t, size) => imageUrl(t?.image, sizeOf(size, "medium")) };
  return null;
}

/**
 * Where the API's pictures are served from ("https://bucket.s3.amazonaws.com",
 * later the media CDN): the origin of the first picture among `values`
 * (links, or {thumbnail, medium, original} objects), or null. A page tells
 * the browser to connect there early (src/server/hints.js): its pictures
 * reach it through /media redirects, so the browser can't know on its own.
 */
export function mediaOrigin(...values) {
  for (const v of values) {
    const url = imageUrl(v, "original");
    if (typeof url !== "string" || !/^https:\/\//i.test(url)) continue;
    try {
      return new URL(url).origin;
    } catch {
      // not a link: try the next
    }
  }
  return null;
}

/** The poster at a size: the original from `poster`, the smaller ones from `poster_thumb` when there is one. */
export function posterOf(page, size = "original") {
  const e = page?.event;
  if (!e) return null;
  const s = sizeOf(size);
  if (s === "original") return imageUrl(e.poster, "original") || imageUrl(e.poster_thumb, "original");
  return imageUrl(e.poster_thumb, s) || imageUrl(e.poster, s);
}

function speakerPhoto(page, key, size) {
  const list = page?.speakers || [];
  const s = /^i\d+$/.test(key) ? list[Number(key.slice(1))] : list.find((x) => x && x.id !== null && String(x.id) === key);
  return imageUrl(s?.photo, sizeOf(size, "medium"));
}

/**
 * Seconds until a presigned link stops working: AWS's v2 (Expires=epoch)
 * or v4 (X-Amz-Date + X-Amz-Expires). Null when the link doesn't say (a
 * plain public URL, which doesn't expire).
 */
export function secondsLeft(url, now = Date.now()) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const v2 = u.searchParams.get("Expires");
  if (v2 && /^\d+$/.test(v2)) return Math.floor(Number(v2) - now / 1000);
  const date = u.searchParams.get("X-Amz-Date");
  const span = u.searchParams.get("X-Amz-Expires");
  if (date && span && /^\d{8}T\d{6}Z$/.test(date) && /^\d+$/.test(span)) {
    const at = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +date.slice(9, 11), +date.slice(11, 13), +date.slice(13, 15));
    return Math.floor((at + Number(span) * 1000 - now) / 1000);
  }
  return null;
}

/** A link with less than this left is looked up again, past the caches. */
export const MIN_LEFT = 10 * 60;
/** How long a redirect may be kept: five minutes, never past two minutes before the link dies. */
export const MAX_TTL = 5 * 60;

export function redirectTtl(url, now = Date.now()) {
  const left = secondsLeft(url, now);
  if (left === null) return MAX_TTL;
  return Math.max(0, Math.min(MAX_TTL, left - 120));
}

/** True when the link is missing or about to die. */
export const isStale = (url, now = Date.now()) => {
  if (!url) return false;
  const left = secondsLeft(url, now);
  return left !== null && left < MIN_LEFT;
};
