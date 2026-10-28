/**
 * The site's addresses: pages, the stable media links and the OG images.
 * Pure, shared by the server pages, the route handlers and the tests.
 *
 * Posters, logos and photos come from the API as presigned S3 links that
 * expire within the hour. A page that is cached (ISR) or crawled must never
 * hold one, so every image a server-rendered page shows goes through
 * /media/... (src/app/media/[...path]/route.js), which looks the current
 * link up and redirects to it.
 */
import { SITE_URL } from "@/config";

const enc = encodeURIComponent;

/** "https://myotherapp.in/x" from "/x"; an absolute address is left as it is. */
export function absoluteUrl(path) {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** What an event goes by in addresses: its slug, or its id while it has none. */
export const eventRefOf = (event) => (event?.slug ? String(event.slug) : event?.id !== null && event?.id !== undefined ? String(event.id) : "");

export const eventPagePath = (event, sub = "") => `/events/${enc(eventRefOf(event))}${sub ? `/${sub}` : ""}`;
export const clubPagePath = (club) => `/clubs/${enc(club.slug)}`;
/** A topic's page (`interest`: one of its interests, the same page filtered). */
export const topicPagePath = (topic, interest = null) => `/topics/${enc(topic.slug)}${interest ? `?interest=${enc(interest)}` : ""}`;

const sized = (path, size) => (size && size !== "original" ? `${path}?size=${size}` : path);

/** The stable media links, by what they show. */
export const media = {
  eventPoster: (ref, size = "original") => sized(`/media/events/${enc(ref)}/poster`, size),
  /** The drawn cover, as a picture (for an event without a poster). */
  eventCover: (ref) => `/media/events/${enc(ref)}/cover`,
  /** A speaker by id, or by place in the list ("i0") when the speaker has no id. */
  eventSpeaker: (ref, key) => `/media/events/${enc(ref)}/speakers/${enc(key)}/photo`,
  eventTeam: (ref, index) => `/media/events/${enc(ref)}/team/${index}/photo`,
  /** One of the event's sponsors or partners (`kind` "sponsor" or "partner"), by id, or by place ("i0") without one. */
  eventBacker: (ref, kind, key) => `/media/events/${enc(ref)}/${kind === "sponsor" ? "sponsors" : "partners"}/${enc(key)}/logo`,
  clubLogo: (slug, size = "thumbnail") => sized(`/media/clubs/${enc(slug)}/logo`, size),
  clubCover: (slug, size = "original") => sized(`/media/clubs/${enc(slug)}/cover`, size),
  clubTeam: (slug, index) => `/media/clubs/${enc(slug)}/team/${index}/photo`,
  clubPartner: (slug, index) => `/media/clubs/${enc(slug)}/partners/${index}/logo`,
  threadImage: (id, size = "medium") => sized(`/media/threads/${enc(id)}/image`, size),
};

/** The share pictures (1200×630), made by src/app/og/.../route.jsx. `v` changes when what they show does. */
const query = (pairs) => {
  const q = pairs.filter(([, v]) => v).map(([k, v]) => `${k}=${enc(v)}`).join("&");
  return q ? `?${q}` : "";
};

export const ogImage = {
  /** `ratio`: "16x9", "4x3" or "1x1" for the event's picture at that shape (its structured data's), else the share card. */
  event: (ref, v, ratio = null) => `/og/events/${enc(ref)}${query([["v", v], ["ratio", ratio]])}`,
  club: (slug, v) => `/og/clubs/${enc(slug)}${v ? `?v=${enc(v)}` : ""}`,
  topic: (slug, v) => `/og/topics/${enc(slug)}${v ? `?v=${enc(v)}` : ""}`,
};

/** The RSS feeds. */
export const feeds = {
  events: (query = "") => `/events/rss.xml${query ? (query.startsWith("?") ? query : `?${query}`) : ""}`,
  club: (slug) => `/clubs/${enc(slug)}/rss.xml`,
  topic: (slug, interest = null) => `/topics/${enc(slug)}/rss.xml${interest ? `?interest=${enc(interest)}` : ""}`,
};

/** A short, stable fingerprint of some values (FNV-1a, base 36): for ?v= on pictures that change. */
export function fingerprint(...values) {
  let h = 2166136261;
  const s = values.map((v) => (v === null || v === undefined ? "" : String(v))).join("\u0001");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** A presigned link without its signature: what stays the same while the file does. */
export function imageKey(url) {
  if (typeof url !== "string" || !url) return "";
  return url.split("?")[0];
}
