/**
 * The RSS 2.0 feeds of upcoming events (/events/rss.xml, with the list
 * page's filters, and /clubs/{slug}/rss.xml), with the RSS event module
 * (ev:startdate, ev:enddate, ev:location, ev:organizer, ev:type) and Dublin
 * Core's dc:creator. Pure: the route handlers fetch, these write the XML.
 *
 * Text goes in escaped; the HTML description goes in CDATA (its own
 * values escaped as HTML first). Every link is the canonical
 * https://myotherapp.in/events/{slug}; every picture a stable /media link.
 */
import { SITE_NAME, SITE_URL } from "@/config";
import { formatPrice } from "@/utils/format";
import { scheduleLines, summary } from "@/utils/eventpage";
import { istIso, rfc822 } from "./time";
import { absoluteUrl, eventPagePath, eventRefOf, media } from "./urls";

export const FEED_LIMIT = 50;
export const FEED_TTL = 60;
export const FEED_CACHE = "public, max-age=600, s-maxage=600, stale-while-revalidate=3600";
export const FEED_TYPE = "application/rss+xml; charset=utf-8";

const XML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
/** Text for XML (elements and attributes). Characters XML forbids are dropped. */
export const xmlText = (v) =>
  String(v ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[&<>"']/g, (c) => XML_ENTITIES[c]);

const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const html = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);

/** HTML inside CDATA: a "]]>" in it can't end the section early. */
export const cdata = (s) => `<![CDATA[${String(s ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** A picture's type from its address ("…/x.medium.png?sig" → image/png); JPEG when it doesn't say. */
export function imageType(url) {
  const m = /\.([a-z0-9]{3,4})(?:$|[?#])/i.exec(String(url || "").split("?")[0] + "?");
  return (m && IMAGE_TYPES[m[1].toLowerCase()]) || "image/jpeg";
}

/** The HTML summary of an event: when (IST), where, the price and the club, then its words, trimmed. */
export function itemHtml(card, { about = null, link }) {
  const lines = scheduleLines(card);
  const when = lines ? `${lines.day}, ${lines.time}` : null;
  const where = card.is_online ? "Online" : card.location_name || "Venue to be announced";
  const price = formatPrice(card.has_fee, card.fee);
  const club = card.club?.name || null;
  const parts = [
    `<p>${[when ? `<strong>${html(when)}</strong>` : null, html(where), html([price, club ? `by ${club}` : null].filter(Boolean).join(" · "))].filter(Boolean).join("<br>")}</p>`,
    about ? `<p>${html(summary(about, 400))}</p>` : null,
    `<p><a href="${html(link)}">See ${html(card.name)} on ${SITE_NAME}</a></p>`,
  ];
  return parts.filter(Boolean).join("");
}

/**
 * One <item> for an event card (as GET /discover/events sends it), with its
 * words: the card's `summary` (newer APIs), else its page's when they were
 * fetched (`detail`, parseEventPage's event).
 */
export function eventItem(card, { detail = null } = {}) {
  const ref = eventRefOf(card);
  const link = absoluteUrl(eventPagePath(card));
  const club = card.club?.name || null;
  const category = card.category?.name || detail?.category?.name || null;
  const poster = card.poster || detail?.poster;
  const enclosure = poster
    ? { url: absoluteUrl(media.eventPoster(ref, "medium")), type: imageType(typeof poster === "string" ? poster : poster?.medium || poster?.original) }
    : { url: absoluteUrl(media.eventCover(ref)), type: "image/png" };
  const published = card.published_at || card.created_at || detail?.published_at || detail?.created_at || card.starts_at;
  const ends = card.ends_at || detail?.ends_at || null;
  const where = card.is_online ? "Online" : card.location_name || "Venue to be announced";
  // Its type, its topics (newer APIs), then its interests (from its page), each once.
  const tags = [...new Set([category, ...(card.topics || []).map((t) => t.name), ...(detail?.interests || [])].filter(Boolean))];
  const lines = [
    "    <item>",
    `      <title>${xmlText(card.name)}</title>`,
    `      <link>${xmlText(link)}</link>`,
    `      <guid isPermaLink="true">${xmlText(link)}</guid>`,
    `      <description>${cdata(itemHtml(card, { about: detail?.about || card.summary || null, link }))}</description>`,
    rfc822(published) ? `      <pubDate>${rfc822(published)}</pubDate>` : null,
    ...tags.map((t) => `      <category>${xmlText(t)}</category>`),
    `      <enclosure url="${xmlText(enclosure.url)}" length="0" type="${enclosure.type}"/>`,
    club ? `      <dc:creator>${xmlText(club)}</dc:creator>` : null,
    istIso(card.starts_at) ? `      <ev:startdate>${istIso(card.starts_at)}</ev:startdate>` : null,
    istIso(ends) ? `      <ev:enddate>${istIso(ends)}</ev:enddate>` : null,
    `      <ev:location>${xmlText(where)}</ev:location>`,
    club ? `      <ev:organizer>${xmlText(club)}</ev:organizer>` : null,
    category ? `      <ev:type>${xmlText(category)}</ev:type>` : null,
    "    </item>",
  ];
  return lines.filter(Boolean).join("\n");
}

/** When an event was put up, as far as the API says; its id (newer events have higher ids) breaks ties. */
const publishedAt = (e) => {
  const t = Date.parse(e.published_at || e.created_at || "");
  return Number.isFinite(t) ? t : null;
};

/** Newest-published first: by publish (or creation) time when the API gives one, else by id, newest first. */
export function newestFirst(cards) {
  return [...cards].sort((a, b) => {
    const pa = publishedAt(a);
    const pb = publishedAt(b);
    if (pa !== null && pb !== null && pa !== pb) return pb - pa;
    const ia = Number(a.id);
    const ib = Number(b.id);
    if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ib - ia;
    return String(b.id).localeCompare(String(a.id));
  });
}

/**
 * The whole feed.
 *   title, description   the channel's words
 *   link                 the page the feed is of (absolute)
 *   self                 the feed's own address (absolute), for atom:link
 *   items                [{card, detail}]
 */
export function rssFeed({ title, description, link, self, items, now = new Date() }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:ev="http://purl.org/rss/1.0/modules/event/">',
    "  <channel>",
    `    <title>${xmlText(title)}</title>`,
    `    <link>${xmlText(link)}</link>`,
    `    <description>${xmlText(description)}</description>`,
    "    <language>en-in</language>",
    `    <lastBuildDate>${rfc822(now)}</lastBuildDate>`,
    `    <ttl>${FEED_TTL}</ttl>`,
    `    <generator>${SITE_NAME}</generator>`,
    `    <atom:link href="${xmlText(self)}" rel="self" type="application/rss+xml"/>`,
    "    <image>",
    `      <url>${SITE_URL}/brand/logo-icon.png</url>`,
    `      <title>${xmlText(title)}</title>`,
    `      <link>${xmlText(link)}</link>`,
    "      <width>144</width>",
    "      <height>144</height>",
    "    </image>",
    ...items.map(({ card, detail }) => eventItem(card, { detail })),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/* ---------- the filters ---------- */

const NUM = /^-?\d{1,3}(\.\d{1,8})?$/;

/**
 * The place a feed is about, from ?lat=&lng= or ?near=lat,lng; null for
 * anywhere (a feed is read from the server, never placed by its address).
 */
export function feedWhere(params) {
  let lat = params.get("lat");
  let lng = params.get("lng");
  const near = params.get("near");
  if ((!lat || !lng) && near && /^[^,]+,[^,]+$/.test(near)) [lat, lng] = near.split(",").map((s) => s.trim());
  if (!NUM.test(lat || "") || !NUM.test(lng || "")) return null;
  const a = Number(lat);
  const b = Number(lng);
  return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
}

/** ?city=: the API has no city filter, but its words search the venue; anything else is matched on the venue here. */
export const feedCity = (params) => {
  const c = (params.get("city") || "").trim().slice(0, 60);
  return c && /^[\p{L}\p{N} .'-]+$/u.test(c) ? c : "";
};

/** A feed's title, from its filters: "Online events on MyOtherApp", "Free events in Kochi on MyOtherApp". */
export function feedTitle({ filters = {}, city = "", categoryName = null, near = false } = {}) {
  const kind = [filters.price === "free" ? "Free" : filters.price === "paid" ? "Paid" : null, filters.type === "online" ? "online" : filters.type === "in_person" ? "in-person" : null, categoryName]
    .filter(Boolean)
    .join(" ");
  const what = kind ? `${kind[0].toUpperCase()}${kind.slice(1)} events` : "Upcoming events";
  const where = city ? ` in ${city}` : near ? " near you" : "";
  const words = filters.q ? ` matching “${filters.q}”` : "";
  return `${what}${where}${words} on ${SITE_NAME}`;
}
