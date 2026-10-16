import apiClient from "./client";

/**
 * The public discovery API: events and clubs near you, a club's page, the
 * clubs' posts. Everything here is readable without an account, so no
 * request carries the token a registration may have left behind. One post
 * is read as the signed-in person, when there is one, so it can say whether
 * they liked it and how they voted.
 *
 * Responses are read defensively: a field the API leaves out becomes an
 * empty value instead of a crash, and a row without an id is dropped.
 */

export const PAGE_SIZE = 12;

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
];
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

const pick = (value, set) => (value && set.has(value) ? value : "");
const text = (v) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
const radius = (v) => {
  const n = Number(v);
  return RADIUS_OPTIONS.includes(n) ? n : null;
};

/* ---------- the filters, as the page URL carries them ---------- */

/** The find-events filters from the page's query string; anything unknown is dropped. */
export function readEventFilters(params) {
  const get = (k) => params.get(k) || "";
  const category = get("category");
  return {
    q: text(get("q")),
    when: pick(get("when"), WHEN),
    type: pick(get("type"), TYPES),
    price: pick(get("price"), PRICES),
    category: ID.test(category) ? category : "",
    sort: pick(get("sort"), EVENT_SORTS),
    radius_km: radius(get("radius_km")),
  };
}

/** The find-clubs filters from the page's query string. */
export function readClubFilters(params) {
  const get = (k) => params.get(k) || "";
  const interest = get("interest");
  return {
    q: text(get("q")),
    interest: ID.test(interest) ? interest : "",
    sort: pick(get("sort"), CLUB_SORTS),
    radius_km: radius(get("radius_km")),
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

/** The query for GET /discover/events: the filters, the stored point if any, the page. */
export function eventsQuery(filters = {}, where = null, { offset = 0, limit = PAGE_SIZE } = {}) {
  return compact({
    q: text(filters.q),
    when: pick(filters.when, WHEN),
    category: filters.category && ID.test(String(filters.category)) ? String(filters.category) : "",
    type: pick(filters.type, TYPES),
    price: pick(filters.price, PRICES),
    ...coords(where),
    radius_km: radius(filters.radius_km),
    sort: pick(filters.sort, EVENT_SORTS),
    offset,
    limit,
  });
}

/** The query for GET /discover/clubs. */
export function clubsQuery(filters = {}, where = null, { offset = 0, limit = PAGE_SIZE } = {}) {
  return compact({
    q: text(filters.q),
    interest: filters.interest && ID.test(String(filters.interest)) ? String(filters.interest) : "",
    ...coords(where),
    radius_km: radius(filters.radius_km),
    sort: pick(filters.sort, CLUB_SORTS),
    offset,
    limit,
  });
}

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

const SOURCES = new Set(["browser", "ip", "none"]);
const STATUSES = new Set(["upcoming", "closing_soon", "full", "live", "ended"]);

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
  return { id: idOf(o.id), name: name || "A club", slug: str(o.slug), logo: o.logo || null };
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
    distance_km: nOrNull(o.distance_km),
    website_url: str(o.website_url),
    // Only on the club's own page:
    about: str(o.about),
    contact_email: str(o.contact_email),
    socials: socials(o.socials),
    events_held: n(o.events_held, null),
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

const page = (d, items) => {
  const o = obj(d) || {};
  return { items, total: Math.max(items.length, n(o.total, items.length)), offset: n(o.offset), limit: n(o.limit, PAGE_SIZE) };
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
    threads: list(o.threads, parseThread),
    stats: { upcoming_events: n(s.upcoming_events), clubs: n(s.clubs), cities: n(s.cities) },
  };
}

/** True when the home response has nothing at all to show. */
export const isEmptyHome = (d) =>
  !d || (!d.near.length && !d.this_week.length && !d.online.length && !d.popular.length && !d.categories.length && !d.clubs.length && !d.threads.length);

export function parseEventsPage(d) {
  const o = obj(d) || {};
  return { ...page(o, list(o.items, parseEvent)), where: parseWhere(o.where), categories: list(o.categories, parseCategory) };
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
    status: STATUSES.has(o.status) ? o.status : "upcoming",
    registration_open: Boolean(o.registration_open),
    category: category && idOf(category.id) !== null && str(category.name) ? { id: category.id, name: str(category.name) } : null,
    interests: Array.isArray(o.interests) ? o.interests.map((i) => (typeof i === "string" ? str(i) : str(obj(i)?.name))).filter(Boolean) : [],
    guidelines: textOf(o.guidelines),
    contact: { name: str(contact.name), email: str(contact.email), phone: str(contact.phone) },
    url: str(o.url),
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

/** What the sitemap lists: every public event and club, by slug. */
export function parseSitemap(d) {
  const o = obj(d) || {};
  const rows = (v) => list(v, (r) => (str(obj(r)?.slug) ? { slug: r.slug, updated_at: isoOrNull(r.updated_at) } : null));
  return { events: rows(o.events), clubs: rows(o.clubs) };
}

/* ---------- the calls ---------- */

const get = (url, params) => apiClient.get(url, { params, skipAuth: true }).then((r) => r.data);

/** A public read that says whether the signed-in person liked or voted: their token goes along, never a guest's. */
const getAsReader = (url) => apiClient.get(url, { userOnly: true }).then((r) => r.data);

/** An error the pages can tell apart: `notFound` when the API said 404. */
const tag = (error) => {
  const e = error instanceof Error ? error : new Error("Request failed");
  e.notFound = error?.response?.status === 404;
  throw e;
};

/*
 * One event is asked for by slug or by id, often twice in a row: an old
 * /{id} link looks it up to redirect, then the page it lands on shows it;
 * "Register" needs its id a moment later. The answer is kept for a minute
 * under every name it goes by, and a request already on its way is shared.
 */
const EVENT_TTL = 60 * 1000;
const events = new Map();

/** Forgets every event looked up so far (for tests, and a retry after an error). */
export function forgetEvents() {
  events.clear();
}

function lookUpEvent(ref, { fresh = false } = {}) {
  const key = String(ref);
  const hit = events.get(key);
  if (!fresh && hit && Date.now() - hit.at < EVENT_TTL) return hit.promise;
  const promise = get(`/api/v1/discover/events/${encodeURIComponent(key)}`).then((d) => {
    const parsed = parseEventPage(d);
    if (!parsed) {
      const e = new Error("No such event");
      e.notFound = true;
      throw e;
    }
    return parsed;
  }, tag);
  const entry = { at: Date.now(), promise };
  events.set(key, entry);
  promise.then(
    (p) => {
      for (const k of [p.event.slug, p.event.id]) if (k !== null && k !== undefined) events.set(String(k), entry);
    },
    () => {
      if (events.get(key) === entry) events.delete(key);
    }
  );
  return promise;
}

export const discoverApi = {
  locate: () => get("/api/v1/discover/locate").then(parseWhere, tag),

  home: (where = null) => get("/api/v1/discover/home", coords(where)).then(parseHome, tag),

  events: (filters, where, paging) => get("/api/v1/discover/events", eventsQuery(filters, where, paging)).then(parseEventsPage, tag),

  clubs: (filters, where, paging) => get("/api/v1/discover/clubs", clubsQuery(filters, where, paging)).then(parseClubsPage, tag),

  club: (slug) =>
    get(`/api/v1/discover/clubs/${encodeURIComponent(slug)}`).then((d) => {
      const parsed = parseClubPage(d);
      if (!parsed) {
        const e = new Error("No such club");
        e.notFound = true;
        throw e;
      }
      return parsed;
    }, tag),

  threads: ({ offset = 0, limit = PAGE_SIZE } = {}) => get("/api/v1/discover/threads", { offset, limit }).then(parseThreadsPage, tag),

  thread: (id) =>
    getAsReader(`/api/v1/threads/${encodeURIComponent(id)}`).then((d) => {
      const t = parseThread(d);
      if (!t) {
        const e = new Error("No such post");
        e.notFound = true;
        throw e;
      }
      return t;
    }, tag),

  comments: (id) => get(`/api/v1/threads/${encodeURIComponent(id)}/comments`).then((d) => list(d, parseComment), tag),

  /** One public event's page by slug or numeric id; rejects with `notFound` when it isn't public. */
  event: (ref, options) => lookUpEvent(ref, options),

  /** Every public event and club, for the sitemap. */
  sitemap: () => get("/api/v1/discover/sitemap").then(parseSitemap, tag),
};
