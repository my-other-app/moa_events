import { dayRange, isDay, isMonth } from "@/utils/days";
import { parseCancellation } from "@/utils/cancelled";

/**
 * The public discovery API's shapes: the filters as the pages' addresses
 * carry them, the queries they become, and how every response is read.
 * Pure, with no network and no browser, so the server (src/server) and the
 * browser (./discover.js) read the API the same way.
 *
 * Responses are read defensively: a field the API leaves out becomes an
 * empty value instead of a crash, and a row without an id is dropped.
 */

export const PAGE_SIZE = 12;

/**
 * The deepest offset the API serves on its lists (/discover/events,
 * /calendar, /clubs); past it, 422. Newer APIs page by cursor instead
 * (`next_cursor` on each page, `after=` for the next): see nextPage.
 */
export const MAX_OFFSET = 1000;

/**
 * Paging: {offset, limit} or {after, limit}. With a cursor the offset is
 * left out (the API ignores it then anyway).
 */
const pagingOf = ({ offset = 0, limit = PAGE_SIZE, after = null } = {}) => (after ? { after: String(after), limit } : { offset, limit });

/**
 * Where the next page of a list starts, from the page just read (parsed:
 * `cursored`, `cursor`) and how many rows have been read so far:
 *   {after}    the API said where (next_cursor)
 *   {offset}   an API without cursors, while the offset is one it serves
 *   null       no more: its cursor was null, or the next offset would pass `max`
 * (MAX_OFFSET; the posts' list, which has no such limit, passes Infinity).
 */
export function nextPage(page, read, max = MAX_OFFSET) {
  if (page?.cursored) return page.cursor ? { after: page.cursor } : null;
  return read <= max ? { offset: read } : null;
}

export const WHEN_OPTIONS = [
  ["", "Any day"],
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["this_week", "This week"],
  ["this_weekend", "This weekend"],
  ["next_week", "Next week"],
  ["this_month", "This month"],
];
export const TYPE_OPTIONS = [
  ["", "Any type"],
  ["in_person", "In person"],
  ["online", "Online"],
];
export const PRICE_OPTIONS = [
  ["", "Any price"],
  ["free", "Free"],
  ["paid", "Paid"],
];
export const EVENT_SORT_OPTIONS = [
  ["date", "Date"],
  ["distance", "Distance"],
  ["popular", "Popular"],
  ["relevance", "Relevance"],
];

/**
 * The orders worth offering right now: "Relevance" only for a search (it
 * means nothing without words), and "Distance" only once we know where the
 * visitor is — before that it is there, switched off, with how to fix it.
 * Each is [value, label, disabled?].
 */
export function eventSortOptions({ q = "", knowsWhere = false } = {}) {
  return [
    ...(q ? [["relevance", "Relevance"]] : []),
    ["date", "Date"],
    knowsWhere ? ["distance", "Distance"] : ["distance", "Distance · set your location first", true],
    ["popular", "Popular"],
  ];
}
export const CLUB_SORT_OPTIONS = [
  ["popular", "Popular"],
  ["nearby", "Nearby"],
  ["newest", "Newest"],
];
export const RADIUS_OPTIONS = [10, 25, 50, 100];

const allowed = (options) => new Set(options.map(([v]) => v).filter(Boolean));
const WHEN = allowed(WHEN_OPTIONS);
const TYPES = allowed(TYPE_OPTIONS);
const PRICES = allowed(PRICE_OPTIONS);
const EVENT_SORTS = allowed(EVENT_SORT_OPTIONS);
const CLUB_SORTS = allowed(CLUB_SORT_OPTIONS);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const TOPIC = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** ?topic=: a topic's slug (or id), lower case; "" for anything else. */
export const topicParam = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return TOPIC.test(s) ? s : "";
};

/** ?topic= and ?interest= for the API (both may go: the API lets the interest win when they disagree). */
const topicQuery = (filters) => ({
  topic: topicParam(filters.topic),
  interest: filters.interest && ID.test(String(filters.interest)) ? String(filters.interest) : "",
});

const pick = (value, set) => (value && set.has(value) ? value : "");
const text = (v) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
const radius = (v) => {
  const n = Number(v);
  return RADIUS_OPTIONS.includes(n) ? n : null;
};

/* ---------- where a list is about ---------- */

/**
 * A list is about one of three places:
 *   {lat, lng}   a point (the address's ?near=, or a location the visitor shared)
 *   ANYWHERE     everywhere: no point, no distance, every event or club
 *   null         wherever the API places whoever asks, by their address
 * The pages use the first two; the third is what a browser's own call
 * without a point always meant.
 */
export const ANYWHERE = Object.freeze({ anywhere: true });
export const isAnywhere = (where) => Boolean(where && where.anywhere === true);

const COORD = /^-?\d{1,3}(\.\d{1,10})?$/;
const round3 = (v) => Math.round(v * 1000) / 1000;

/** A point from ?near=lat,lng: rounded to about a hundred metres; null for anything else. */
export function nearPoint(v) {
  const m = /^\s*([^,\s]+)\s*,\s*([^,\s]+)\s*$/.exec(String(v ?? ""));
  if (!m || !COORD.test(m[1]) || !COORD.test(m[2])) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat: round3(lat), lng: round3(lng) };
}

/** A point as ?near= carries it: "18.52,73.856". */
export const nearParam = (point) => (point && Number.isFinite(point.lat) && Number.isFinite(point.lng) ? `${round3(point.lat)},${round3(point.lng)}` : "");

/** ?near= tidied: the same point, written the one way; "" for none. */
export const readNear = (v) => nearParam(nearPoint(v));

/* ---------- the filters, as the page URL carries them ---------- */

/**
 * The find-events filters from the page's query string; anything unknown is
 * dropped. Picked days (from/to) replace the "when" presets, and an order by
 * relevance without search words is no order at all.
 */
export function readEventFilters(params) {
  const get = (k) => params.get(k) || "";
  const category = get("category");
  const interest = get("interest");
  const q = text(get("q"));
  const days = dayRange(get("from"), get("to"));
  const sort = pick(get("sort"), EVENT_SORTS);
  return {
    q,
    when: days ? "" : pick(get("when"), WHEN),
    from: days ? days.from : "",
    to: days ? days.to : "",
    type: pick(get("type"), TYPES),
    price: pick(get("price"), PRICES),
    category: ID.test(category) ? category : "",
    topic: topicParam(get("topic")),
    interest: ID.test(interest) ? interest : "",
    sort: sort === "relevance" && !q ? "" : sort,
    radius_km: radius(get("radius_km")),
    near: readNear(get("near")),
  };
}

/** The find-clubs filters from the page's query string. */
export function readClubFilters(params) {
  const get = (k) => params.get(k) || "";
  const interest = get("interest");
  return {
    q: text(get("q")),
    topic: topicParam(get("topic")),
    interest: ID.test(interest) ? interest : "",
    sort: pick(get("sort"), CLUB_SORTS),
    radius_km: radius(get("radius_km")),
    near: readNear(get("near")),
  };
}

/** Filters back to a query string for the page URL: only what is set, in a stable order. */
export function filtersToSearch(filters) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(filters || {})) {
    if (v === "" || v === null || v === undefined) continue;
    out.set(k, String(v));
  }
  return out;
}

const coords = (where) =>
  where && Number.isFinite(where.lat) && Number.isFinite(where.lng) ? { lat: where.lat, lng: where.lng } : {};

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v !== null && v !== undefined));

/** Everywhere (ANYWHERE, no point): radius 0, which the API reads as "anywhere"; otherwise the filter's radius. */
const radiusFor = (filters, where) => (isAnywhere(where) ? 0 : radius(filters.radius_km));
/** An order by distance means nothing everywhere. */
const sortFor = (sort, where, near) => (isAnywhere(where) && sort === near ? "" : sort);

/** The query for GET /discover/events: the filters, the point if any (or ANYWHERE), the page. Days, when picked, stand in for "when". */
export function eventsQuery(filters = {}, where = null, paging = {}) {
  const days = dayRange(filters.from, filters.to);
  return compact({
    q: text(filters.q),
    when: days ? "" : pick(filters.when, WHEN),
    from: days?.from,
    to: days?.to,
    category: filters.category && ID.test(String(filters.category)) ? String(filters.category) : "",
    ...topicQuery(filters),
    type: pick(filters.type, TYPES),
    price: pick(filters.price, PRICES),
    ...coords(where),
    radius_km: radiusFor(filters, where),
    sort: sortFor(pick(filters.sort, EVENT_SORTS), where, "distance"),
    ...pagingOf(paging),
  });
}

/** The query for GET /discover/calendar: a month and the same filters as the list, minus when and order. */
export function calendarQuery(filters = {}, where = null, month) {
  return compact({
    month: isMonth(month) ? month : "",
    q: text(filters.q),
    category: filters.category && ID.test(String(filters.category)) ? String(filters.category) : "",
    ...topicQuery(filters),
    type: pick(filters.type, TYPES),
    price: pick(filters.price, PRICES),
    ...coords(where),
    radius_km: radiusFor(filters, where),
  });
}

/** The query for GET /discover/clubs. */
export function clubsQuery(filters = {}, where = null, paging = {}) {
  return compact({
    q: text(filters.q),
    ...topicQuery(filters),
    ...coords(where),
    radius_km: radiusFor(filters, where),
    sort: sortFor(pick(filters.sort, CLUB_SORTS), where, "nearby"),
    ...pagingOf(paging),
  });
}

/** The query for GET /discover/threads: a page, by offset or cursor. */
export const threadsQuery = (paging = {}) => pagingOf(paging);

/* ---------- reading the responses ---------- */

const str = (v) => (typeof v === "string" && v.trim() ? v : null);
const n = (v, fallback = 0) => {
  const x = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
};
const nOrNull = (v) => n(v, null);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const list = (v, fn) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : []);
const idOf = (v) => (typeof v === "number" || (typeof v === "string" && v !== "") ? v : null);

/** A short lower-case word from the API ("cancelled", "in_person"), or null. */
const word = (v) => (typeof v === "string" && /^[a-z_]{1,32}$/i.test(v.trim()) ? v.trim().toLowerCase() : null);
const flag = (v) => (v === true ? true : null);

/**
 * Fields newer APIs send, kept only when they are there, so an answer
 * without them parses exactly as before: {key: read} where read(value)
 * gives the value to keep or null.
 */
function optional(o, fields) {
  const out = {};
  for (const [key, read] of Object.entries(fields)) {
    const v = read(o[key], o);
    if (v !== null && v !== undefined) out[key] = v;
  }
  return out;
}

/** Marked as made-up showcase content by the API (`is_demo`), once it says so (see src/seo/demo.js). */
const DEMO = { is_demo: flag };
/**
 * A club's own page, or the club on an event's: `whatsapp_updates` when the
 * club offers "Get updates from <club> on WhatsApp" (src/utils/clubupdates.js).
 * Kept only when true, so a club from an API without it reads as before.
 */
const CLUB_EXTRAS = { ...DEMO, whatsapp_updates: flag };
/**
 * How an event is attended and whether it is on as planned, once the API says (src/seo/jsonld.js);
 * and, on a card and on the event's page alike: `requires_approval` (the club confirms each place)
 * and `high_demand` (the club has its "High demand" label on). Each kept only when true, so an
 * API without them reads as before.
 */
const EVENT_STATE = { event_status: word, attendance_mode: word, is_demo: flag, requires_approval: flag, high_demand: flag };

const SOURCES = new Set(["browser", "ip", "none"]);
const STATUSES = new Set(["upcoming", "closing_soon", "full", "live", "ended"]);
/**
 * An event's own page also says "cancelled": the club called it off (it is
 * in no list, but its page still opens and says so, with `cancellation`).
 */
const DETAIL_STATUSES = new Set([...STATUSES, "cancelled"]);

export function parseWhere(w) {
  const o = obj(w) || {};
  const lat = nOrNull(o.lat);
  const lng = nOrNull(o.lng);
  return {
    city: str(o.city),
    region: str(o.region),
    lat,
    lng,
    source: SOURCES.has(o.source) ? o.source : lat !== null && lng !== null ? "ip" : "none",
  };
}

/** The club as an event card carries it. */
export function parseClubRef(c) {
  const o = obj(c);
  if (!o) return null;
  const name = str(o.name);
  if (!name && idOf(o.id) === null) return null;
  return { id: idOf(o.id), name: name || "A club", slug: str(o.slug), logo: o.logo || null, ...optional(o, DEMO) };
}

/* ---------- topics ---------- */

/*
 * Topics are the main categories (Development, Deep Tech, Arts, ...); each
 * holds interests (Web Development, Robotics, ...), which is what people,
 * clubs and events pick. An event's or a club's topics are worked out by
 * the API from its interests. A topic without a slug has no page, so it is
 * dropped: an older API (one category, "arts", and no slugs) has none.
 */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A colour that is safe to put in a style: #rgb or #rrggbb; null for anything else. */
export const topicColor = (v) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim() : null);

const slugOf = (v) => (typeof v === "string" && SLUG.test(v.trim()) ? v.trim() : null);

/**
 * An emoji to show beside the name: only a short run of pictographs (no
 * letters, digits or markup), so a link, a picture's address or the
 * placeholder "string" some rows were saved with never shows.
 */
const iconOf = (icon, type) => {
  const s = str(icon)?.trim();
  if (!s || (type && type !== "emoji")) return null;
  return s.length <= 16 && /\p{Extended_Pictographic}/u.test(s) && !/[\p{L}\p{N}<>/:.\s]/u.test(s) ? s : null;
};

/** A topic as an event or a club carries it: {id, slug, name, color}. */
export function parseTopicRef(t) {
  const o = obj(t);
  const slug = slugOf(o?.slug);
  if (!o || !slug || !str(o.name)) return null;
  return { id: idOf(o.id), slug, name: o.name.trim(), color: topicColor(o.color) };
}

/** One of a topic's interests. Counts are null when the API didn't count (/interests/list). */
function parseTopicInterest(i) {
  const o = obj(i);
  if (!o || idOf(o.id) === null || !str(o.name)) return null;
  return { id: o.id, slug: slugOf(o.slug), name: o.name.trim(), icon: iconOf(o.icon, o.icon_type), upcoming_events: o.upcoming_events === undefined ? null : Math.max(0, n(o.upcoming_events)) };
}

/**
 * A topic, from GET /interests/topics (with live counts) or /interests/list
 * (without: `upcoming_events` and `clubs` are null). Null without a slug.
 */
export function parseTopic(t) {
  const o = obj(t);
  const slug = slugOf(o?.slug);
  if (!o || !slug || !str(o.name)) return null;
  const count = (v) => (v === undefined || v === null ? null : Math.max(0, n(v)));
  return {
    id: idOf(o.id),
    slug,
    name: o.name.trim(),
    icon: iconOf(o.icon, o.icon_type),
    color: topicColor(o.color),
    description: textOf(o.description),
    upcoming_events: count(o.upcoming_events),
    clubs: count(o.clubs),
    interests: list(o.interests, parseTopicInterest),
  };
}

/** Every topic that has a page (a slug), in the API's order; [] for an answer that isn't a list. */
export function parseTopics(d) {
  const rows = Array.isArray(d) ? d : Array.isArray(obj(d)?.items) ? d.items : [];
  const seen = new Set();
  return list(rows, parseTopic).filter((t) => (seen.has(t.slug) ? false : seen.add(t.slug)));
}

/** A topic in the events list's facets: {id, slug, name, color, upcoming}. */
function parseTopicFacet(f) {
  const ref = parseTopicRef(f);
  return ref ? { ...ref, upcoming: Math.max(0, n(obj(f).upcoming)) } : null;
}

/** The topic a slug or an id names, among `topics`; null when none does. */
export function findTopic(topics, ref) {
  const key = String(ref ?? "").toLowerCase();
  if (!key || !Array.isArray(topics)) return null;
  return topics.find((t) => t.slug.toLowerCase() === key) || topics.find((t) => t.id !== null && String(t.id) === key) || null;
}

export function parseEvent(e) {
  const o = obj(e);
  if (!o || idOf(o.id) === null) return null;
  const category = obj(o.category);
  return {
    id: o.id,
    slug: str(o.slug),
    name: str(o.name) || "Untitled event",
    poster: o.poster || null,
    starts_at: str(o.starts_at),
    ends_at: str(o.ends_at),
    location_name: str(o.location_name),
    is_online: Boolean(o.is_online),
    lat: nOrNull(o.lat),
    lng: nOrNull(o.lng),
    distance_km: nOrNull(o.distance_km),
    has_fee: Boolean(o.has_fee),
    fee: nOrNull(o.fee),
    category: category && idOf(category.id) !== null ? { id: category.id, name: str(category.name) || "" } : null,
    club: parseClubRef(o.club),
    going: Math.max(0, n(o.going)),
    capacity: nOrNull(o.capacity),
    status: STATUSES.has(o.status) ? o.status : "upcoming",
    url: str(o.url),
    // When it was put up and last changed, for the feeds' order and dates, and
    // the first words of its description (sent by newer APIs only).
    published_at: str(o.published_at),
    created_at: str(o.created_at),
    updated_at: str(o.updated_at),
    summary: typeof o.summary === "string" && o.summary.trim() ? o.summary.replace(/\r\n?/g, "\n").trim() : null,
    topics: list(o.topics, parseTopicRef),
    ...optional(o, EVENT_STATE),
  };
}

const socials = (s) => {
  const o = obj(s) || {};
  return {
    instagram: str(o.instagram),
    linkedin: str(o.linkedin),
    youtube: str(o.youtube),
    website: str(o.website),
    x: str(o.x),
  };
};

export function parseClub(c) {
  const o = obj(c);
  if (!o || (idOf(o.id) === null && !str(o.slug))) return null;
  return {
    id: idOf(o.id),
    name: str(o.name) || "A club",
    slug: str(o.slug),
    logo: o.logo || null,
    cover: o.cover || null,
    tagline: str(o.tagline),
    location_name: str(o.location_name),
    followers: Math.max(0, n(o.followers)),
    upcoming_events: Math.max(0, n(o.upcoming_events)),
    interests: Array.isArray(o.interests) ? o.interests.map((i) => (typeof i === "string" ? i : str(obj(i)?.name))).filter(Boolean) : [],
    topics: list(o.topics, parseTopicRef),
    distance_km: nOrNull(o.distance_km),
    website_url: str(o.website_url),
    // Only on the club's own page:
    about: str(o.about),
    contact_email: str(o.contact_email),
    socials: socials(o.socials),
    events_held: n(o.events_held, null),
    ...optional(o, CLUB_EXTRAS),
  };
}

/** A poll's options and counts (from a post, or the answer to a vote); null when it has no options. */
export function parsePoll(p) {
  const poll = obj(p);
  if (!poll) return null;
  const options = list(poll.options, (x) => {
    const po = obj(x);
    if (!po || idOf(po.id) === null) return null;
    return { id: po.id, label: str(po.label) || "", votes: Math.max(0, n(po.votes)), share: Math.min(100, Math.max(0, n(po.share))) };
  });
  return options.length ? { options, votes: Math.max(0, n(poll.votes)), voted_option_id: idOf(poll.voted_option_id) } : null;
}

export function parseThread(t) {
  const o = obj(t);
  if (!o || idOf(o.id) === null) return null;
  const poll = parsePoll(o.poll);
  return {
    id: o.id,
    club: parseClubRef(o.club) || { id: null, name: "A club", slug: null, logo: null },
    body: typeof o.body === "string" ? o.body : "",
    image: o.image || null,
    kind: o.kind === "poll" && poll ? "poll" : "post",
    poll,
    pinned: Boolean(o.pinned),
    likes: Math.max(0, n(o.likes)),
    comments: Math.max(0, n(o.comments)),
    views: Math.max(0, n(o.views)),
    liked: Boolean(o.liked),
    created_at: str(o.created_at),
  };
}

export function parseComment(c) {
  const o = obj(c);
  if (!o || idOf(o.id) === null) return null;
  const a = obj(o.author) || {};
  return {
    id: o.id,
    body: typeof o.body === "string" ? o.body : "",
    author: { id: idOf(a.id), name: str(a.name) || "Someone", is_club: Boolean(a.is_club) },
    created_at: str(o.created_at),
  };
}

const parseCategory = (c) => {
  const o = obj(c);
  if (!o || idOf(o.id) === null) return null;
  return { id: o.id, name: str(o.name) || "", icon: str(o.icon), upcoming: Math.max(0, n(o.upcoming)) };
};

const parseInterest = (i) => {
  const o = obj(i);
  if (!o || idOf(o.id) === null) return null;
  return { id: o.id, name: str(o.name) || "", clubs: Math.max(0, n(o.clubs)) };
};

/**
 * A page of a list. `capped`: the API stopped counting (past 1,000 it says
 * total 1000 with total_capped), so `total` is a floor, and later pages
 * still come. `cursored`: the API pages by cursor (it sent next_cursor);
 * `cursor` is where the next page starts, null for the last page.
 */
const page = (d, items) => {
  const o = obj(d) || {};
  const cursored = Object.prototype.hasOwnProperty.call(o, "next_cursor");
  return {
    items,
    total: Math.max(items.length, n(o.total, items.length)),
    capped: o.total_capped === true,
    offset: n(o.offset),
    limit: n(o.limit, PAGE_SIZE),
    cursored,
    cursor: cursored && typeof o.next_cursor === "string" && o.next_cursor ? o.next_cursor : null,
  };
};

export function parseHome(d) {
  const o = obj(d) || {};
  const s = obj(o.stats) || {};
  return {
    where: parseWhere(o.where),
    near: list(o.near, parseEvent),
    this_week: list(o.this_week, parseEvent),
    online: list(o.online, parseEvent),
    popular: list(o.popular, parseEvent),
    categories: list(o.categories, parseCategory),
    clubs: list(o.clubs, parseClub),
    // Placed: the nearest clubs further than 50 km (the API's `clubs` are those within it).
    clubs_more: list(o.clubs_more, parseClub),
    threads: list(o.threads, parseThread),
    stats: { upcoming_events: n(s.upcoming_events), clubs: n(s.clubs), cities: n(s.cities) },
  };
}

/** True when the home response has nothing at all to show. */
export const isEmptyHome = (d) =>
  !d || (!d.near.length && !d.this_week.length && !d.online.length && !d.popular.length && !d.categories.length && !d.clubs.length && !d.threads.length);

export function parseEventsPage(d) {
  const o = obj(d) || {};
  return { ...page(o, list(o.items, parseEvent)), where: parseWhere(o.where), categories: list(o.categories, parseCategory), topics: list(o.topics, parseTopicFacet) };
}

export function parseClubsPage(d) {
  const o = obj(d) || {};
  return { ...page(o, list(o.items, parseClub)), where: parseWhere(o.where), interests: list(o.interests, parseInterest) };
}

/** Someone on a club's or an event's team, with their links. */
function parsePerson(m) {
  const mo = obj(m);
  if (!mo || !str(mo.name)) return null;
  const links = obj(mo.links) || {};
  return {
    name: mo.name,
    role: str(mo.role),
    photo: mo.photo || null,
    links: { instagram: str(links.instagram), linkedin: str(links.linkedin), x: str(links.x), website: str(links.website) },
  };
}

export function parseClubPage(d) {
  const o = obj(d) || {};
  const club = parseClub(o.club);
  if (!club) return null;
  return {
    club,
    upcoming: list(o.upcoming, parseEvent),
    past: list(o.past, parseEvent),
    threads: list(o.threads, parseThread),
    team: list(o.team, parsePerson),
    partners: list(o.partners, (p) => {
      const po = obj(p);
      if (!po || !str(po.name)) return null;
      return { name: po.name, role: str(po.role), logo: po.logo || null };
    }),
  };
}

/** One club's events, a page at a time (GET /discover/clubs/{slug}/events). */
export function parseClubEventsPage(d) {
  const o = obj(d) || {};
  return page(o, list(o.items, parseEvent));
}

/** How many events each day of a month has: {month, days: {"YYYY-MM-DD": n}}, days with none left out. */
export function parseCalendar(d) {
  const o = obj(d) || {};
  const days = {};
  for (const [day, count] of Object.entries(obj(o.days) || {})) {
    const c = Math.floor(n(count));
    if (isDay(day) && c > 0) days[day] = c;
  }
  return { month: isMonth(o.month) ? o.month : null, days };
}

export function parseThreadsPage(d) {
  const o = obj(d) || {};
  return page(o, list(o.items, parseThread));
}

/* ---------- one event's page ---------- */

/** A positive amount or nothing: a fee, prize or capacity of 0 means "not set", never "0". */
const positive = (v) => {
  const x = nOrNull(v);
  return x !== null && x > 0 ? x : null;
};
const isoOrNull = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};
const textOf = (v) => (typeof v === "string" && v.trim() ? v.replace(/\r\n?/g, "\n").trim() : null);

/** The event itself, as GET /discover/events/{ref} sends it. */
export function parseEventDetail(e) {
  const o = obj(e);
  if (!o || idOf(o.id) === null) return null;
  const category = obj(o.category);
  const contact = obj(o.contact) || {};
  const lat = nOrNull(o.lat);
  const lng = nOrNull(o.lng);
  // 0,0 is the sea off Ghana: a venue nobody picked.
  const placed = lat !== null && lng !== null && !(lat === 0 && lng === 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const seats = nOrNull(o.seats_left);
  const capacity = positive(o.capacity);
  return {
    id: o.id,
    slug: str(o.slug),
    name: str(o.name) || "Untitled event",
    about: textOf(o.about),
    poster: o.poster || null,
    poster_thumb: o.poster_thumb || null,
    // About twice a card's width (newer APIs only): what /media/events/{ref}/poster?size=large answers with.
    poster_large: o.poster_large || null,
    starts_at: isoOrNull(o.starts_at),
    ends_at: isoOrNull(o.ends_at),
    duration_hours: positive(o.duration_hours),
    timezone: str(o.timezone) || "Asia/Kolkata",
    is_online: Boolean(o.is_online),
    location_name: str(o.location_name),
    location_link: str(o.location_link),
    lat: placed ? lat : null,
    lng: placed ? lng : null,
    has_fee: Boolean(o.has_fee),
    fee: positive(o.fee),
    has_prize: Boolean(o.has_prize),
    prize_amount: positive(o.prize_amount),
    capacity,
    going: Math.max(0, n(o.going)),
    seats_left: capacity !== null && seats !== null ? Math.max(0, Math.floor(seats)) : null,
    reg_opens_at: isoOrNull(o.reg_opens_at),
    reg_closes_at: isoOrNull(o.reg_closes_at),
    status: DETAIL_STATUSES.has(o.status) ? o.status : "upcoming",
    registration_open: o.status === "cancelled" ? false : Boolean(o.registration_open),
    category: category && idOf(category.id) !== null && str(category.name) ? { id: category.id, name: str(category.name) } : null,
    interests: Array.isArray(o.interests) ? o.interests.map((i) => (typeof i === "string" ? str(i) : str(obj(i)?.name))).filter(Boolean) : [],
    topics: list(o.topics, parseTopicRef),
    guidelines: textOf(o.guidelines),
    contact: { name: str(contact.name), email: str(contact.email), phone: str(contact.phone) },
    url: str(o.url),
    published_at: isoOrNull(o.published_at),
    created_at: isoOrNull(o.created_at),
    updated_at: isoOrNull(o.updated_at),
    ...optional(o, {
      ...EVENT_STATE,
      previous_starts_at: isoOrNull,
      // The venue's address in parts, once the API has them (`locality` or `city`).
      locality: (v, all) => str(v) || str(all.city),
      region: str,
      postal_code: (v) => (typeof v === "string" || typeof v === "number" ? str(String(v)) : null),
      // Only on a cancelled event: why, and when (src/utils/cancelled.js).
      cancellation: (v, all) => (all.status === "cancelled" ? parseCancellation(v) || { reason: null, cancelled_at: null } : null),
    }),
  };
}

const parseSpeaker = (s) => {
  const o = obj(s);
  if (!o || !str(o.name)) return null;
  return {
    id: idOf(o.id),
    name: o.name.trim(),
    designation: str(o.designation),
    photo: o.photo || null,
    bio: textOf(o.bio),
    link: str(o.link),
  };
};

/** The run of show, in the shape the agenda has always had; items without a time are dropped. */
export function parseAgenda(a) {
  const o = obj(a) || {};
  const items = list(o.items, (item, i) => {
    const io = obj(item);
    if (!io || !isoOrNull(io.starts_at) || !str(io.title)) return null;
    return {
      id: idOf(io.id) ?? `item-${i}`,
      starts_at: io.starts_at,
      ends_at: isoOrNull(io.ends_at),
      title: io.title,
      description: textOf(io.description),
      speaker: str(io.speaker),
      location: str(io.location),
      parallel: Boolean(io.parallel),
    };
  });
  return { timezone: str(o.timezone) || "Asia/Kolkata", items };
}

const TEAM_SOURCES = new Set(["event", "club"]);

/** Everything the event page shows; null when the event itself is missing. */
export function parseEventPage(d) {
  const o = obj(d) || {};
  const event = parseEventDetail(o.event);
  if (!event) return null;
  const others = (rows) => list(rows, parseEvent).filter((e) => String(e.id) !== String(event.id));
  const team = list(o.team, parsePerson);
  return {
    event,
    club: parseClub(o.club),
    speakers: list(o.speakers, parseSpeaker),
    agenda: parseAgenda(o.agenda),
    team,
    team_source: team.length && TEAM_SOURCES.has(o.team_source) ? o.team_source : "none",
    more_from_club: others(o.more_from_club),
    similar: others(o.similar),
  };
}

/**
 * A sitemap row: {slug, updated_at}, and, when the API says them, whose it
 * is (`club`: the club's slug, from `club_slug` or `club`) and `is_demo`.
 */
const sitemapRow = (r) => {
  const o = obj(r);
  if (!str(o?.slug)) return null;
  return {
    slug: o.slug,
    updated_at: isoOrNull(o.updated_at),
    ...optional(o, { club: (v, all) => str(all.club_slug) || str(obj(v)?.slug) || str(v), is_demo: flag }),
  };
};

/** What the sitemap lists: every public event and club, by slug. */
export function parseSitemap(d) {
  const o = obj(d) || {};
  return { events: list(o.events, sitemapRow), clubs: list(o.clubs, sitemapRow) };
}

const KINDS = new Set(["events", "clubs"]);

/**
 * The paged sitemap's index (GET /discover/sitemap/index): every page of
 * event and club addresses, at most `pageSize` a page. Null when the answer
 * isn't one (an API without paging).
 */
export function parseSitemapIndex(d) {
  const o = obj(d);
  if (!o || !Array.isArray(o.pages)) return null;
  const pages = list(o.pages, (p) => {
    const po = obj(p);
    const page = Math.floor(n(po?.page, 0));
    if (!po || !KINDS.has(po.kind) || page < 1) return null;
    return { kind: po.kind, page, entries: Math.max(0, n(po.entries)), updated_at: isoOrNull(po.updated_at) };
  });
  return { pageSize: Math.max(1, n(o.page_size, 5000)), pages };
}

/** One page of the paged sitemap (GET /discover/sitemap/{kind}/{page}). */
export function parseSitemapPage(d) {
  const o = obj(d) || {};
  const rows = list(o.items, sitemapRow);
  return { kind: KINDS.has(o.kind) ? o.kind : null, page: Math.max(1, Math.floor(n(o.page, 1))), pages: Math.max(1, Math.floor(n(o.pages, 1))), items: rows };
}
