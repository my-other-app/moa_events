/**
 * The find pages (/events, /clubs): what their address says, what they are
 * called, and which of their countless addresses search engines should
 * keep. Pure: the pages, their metadata and the tests share these.
 *
 * Indexing. A find page has an address for every mix of filters; only a
 * few are worth a search result of their own:
 *   - the page itself, with no filter (sorting doesn't count: it orders the
 *     same events, so its canonical is the page without it);
 *   - one browsing filter alone, a page about one kind of thing:
 *     /events?category=3, ?type=online, ?price=free, ?when=this_week,
 *     /clubs?interest=4, /clubs?topic=design. Its canonical is that address,
 *     tidied. /events?topic=design alone is the topic's own page
 *     (/topics/design lists the same events first), so that is its canonical.
 * Everything else (a search, picked days, a place, a distance, the
 * calendar, two filters or more) is "noindex, follow" with no canonical:
 * crawlers follow its links to the events, but don't keep it. Tracking
 * parameters (?ref=, utm_*) change nothing and are left out of canonicals.
 */
import { findTopic, nearPoint, readClubFilters, readEventFilters } from "@/api/parse";
import { isMonth } from "@/utils/days";

/** URLSearchParams from what Next hands a page ({key: string | string[]}), first value of each. */
export function paramsOf(searchParams) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams || {})) {
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === "string") out.set(k, value);
  }
  return out;
}

/* ---------- topics, on both find pages ---------- */

const NO_TOPICS = Object.freeze({ options: [], current: null, interest: null, topicName: null, interestName: null, topicSlug: null });

/**
 * The topic filter of a find page, from what is known about topics:
 *   facet   the events list's own topics ({slug, name, upcoming}), [] for clubs or an older API
 *   tree    getTopics()'s {topics} (with their interests), or null when not read or there are none
 * → {options, current, interest, topicName, interestName, topicSlug}:
 *   options   [{slug, name, count}] for the select (none: no select, as on an API without topics)
 *   current   the chosen topic, with its interests (from the tree), or null
 *   interest  the chosen interest, or null; its topic is `current` (the API lets the
 *             interest win when ?topic= says another)
 *   topicSlug the chosen topic's canonical slug, when known (for the canonical address)
 * `count` picks the tree's number for the options: "upcoming_events" or "clubs".
 */
export function topicChoice(filters, { facet = [], tree = null, count = "upcoming_events" } = {}) {
  const topics = tree?.topics || [];
  if (!facet.length && !topics.length) return NO_TOPICS;
  const options = facet.length
    ? facet.map((t) => ({ slug: t.slug, name: t.name, count: t.upcoming ?? null }))
    : topics.map((t) => ({ slug: t.slug, name: t.name, count: t[count] ?? null }));
  const owner = filters.interest ? topics.find((t) => t.interests.some((i) => String(i.id) === String(filters.interest))) || null : null;
  const current = owner || (filters.topic ? findTopic(topics, filters.topic) : null);
  const interest = owner ? owner.interests.find((i) => String(i.id) === String(filters.interest)) : null;
  const named = current || (filters.topic ? findTopic(facet, filters.topic) : null);
  if (named && !options.some((o) => o.slug === named.slug)) options.push({ slug: named.slug, name: named.name, count: null });
  return { options, current, interest, topicName: named?.name || null, interestName: interest?.name || null, topicSlug: named?.slug || null };
}

/* ---------- /events ---------- */

const EVENT_FILTER_KEYS = ["when", "from", "type", "price", "category", "topic", "interest", "radius_km"];
const CALENDAR_FILTER_KEYS = ["type", "price", "category", "topic", "interest", "radius_km"];

/** How many of the events' filters are on, for "Filters (2)" (the words, the order and the place aren't filters). */
export const activeEventFilters = (filters, calendar = false) => (calendar ? CALENDAR_FILTER_KEYS : EVENT_FILTER_KEYS).filter((k) => filters[k]).length;
/** The same for clubs. */
export const activeClubFilters = (filters) => ["topic", "interest", "radius_km"].filter((k) => filters[k]).length;

/**
 * The find-events page's state: its filters, the place (?near=), the
 * calendar and its month. Without a place, distance means nothing: the
 * list is every event, so a radius and an order by distance are dropped
 * (`sortAsked` keeps the order the address asked for, for when a place
 * comes: "Events near you" links to ?sort=distance).
 */
export function eventsPageState(params) {
  const raw = readEventFilters(params);
  const near = nearPoint(raw.near);
  const filters = near ? raw : { ...raw, near: "", radius_km: null, sort: raw.sort === "distance" ? "" : raw.sort };
  const calendar = params.get("view") === "calendar";
  const month = calendar && isMonth(params.get("month")) ? params.get("month") : "";
  return { filters, near, calendar, month, sortAsked: raw.sort };
}

const INDEXABLE_EVENT_FILTERS = ["category", "type", "price", "when"];

/** Which filters are set, by name ("dates" for picked days, "view" for the calendar). */
function eventFiltersSet({ filters, near, calendar }) {
  const set = [];
  if (filters.q) set.push("q");
  if (filters.from) set.push("dates");
  for (const k of INDEXABLE_EVENT_FILTERS) if (filters[k]) set.push(k);
  if (filters.topic) set.push("topic");
  if (filters.interest) set.push("interest");
  if (near) set.push("near");
  if (filters.radius_km) set.push("radius_km");
  if (calendar) set.push("view");
  return set;
}

const NOT_KEPT = Object.freeze({ index: false, path: null });

/**
 * {index, path}: whether search engines keep the page, and its canonical
 * path (null for none). A one-filter page is kept only with something in
 * it (`total`), and a category only by a name the API knows
 * (`categoryName`): an empty or unknown one is a thin page. A known topic
 * alone (`topicSlug`, the slug the topics list has for it) points to the
 * topic's page; an interest alone is not kept (the topic page's chips are).
 */
export function eventsIndexing(state, { total = null, categoryName = null, topicSlug = null } = {}) {
  const set = eventFiltersSet(state);
  if (!set.length) return { index: true, path: "/events" };
  const [only] = set;
  if (set.length === 1 && only === "topic") return topicSlug && total !== 0 ? { index: true, path: `/topics/${encodeURIComponent(topicSlug)}` } : NOT_KEPT;
  if (set.length !== 1 || !INDEXABLE_EVENT_FILTERS.includes(only) || total === 0) return NOT_KEPT;
  if (only === "category" && !categoryName) return NOT_KEPT;
  return { index: true, path: `/events?${only}=${encodeURIComponent(state.filters[only])}` };
}

const WHEN_HEADINGS = {
  today: "Events today",
  tomorrow: "Events tomorrow",
  this_week: "Events this week",
  this_weekend: "Events this weekend",
  next_week: "Events next week",
  this_month: "Events this month",
};

/**
 * The page's <h1>: what the list is, from the filter that says most.
 * `categoryName` names ?category=, `city` the place (the API's name for it).
 */
export function eventsHeading({ filters, near, calendar }, { categoryName = null, city = null, topicName = null, interestName = null } = {}) {
  if (filters.q) return `Events matching “${filters.q}”`;
  if (filters.type === "online") return "Online events";
  if (near) return `Events near ${city || "you"}`;
  if (filters.interest && interestName) return `${interestName} events`;
  if (filters.topic && topicName) return `${topicName} events`;
  if (filters.category && categoryName) return `${categoryName} events`;
  if (filters.type === "in_person") return "In-person events";
  if (filters.price === "free") return "Free events";
  if (filters.price === "paid") return "Paid events";
  if (filters.when && WHEN_HEADINGS[filters.when]) return WHEN_HEADINGS[filters.when];
  if (filters.from || calendar) return "Find events";
  return "Upcoming events";
}

export const EVENTS_TITLE = "Find events";
export const EVENTS_DESCRIPTION = "Hackathons, workshops, meetups and more near you, from the clubs on MyOtherApp.";

/** {title, description} for the head: the page itself keeps its name; a filtered page is called what its heading says. */
export function eventsHead(state, names = {}) {
  const heading = eventsHeading(state, names);
  if (!eventFiltersSet(state).length || heading === "Upcoming events") return { heading, title: EVENTS_TITLE, description: EVENTS_DESCRIPTION };
  return { heading, title: heading, description: `${heading}: find what's on — by day, type, price and category — on MyOtherApp.` };
}

/** The feed of the same list, as /events/rss.xml reads its query: the filters and the place (sorting and the calendar mean nothing to a feed). */
export function eventsFeedQuery({ filters, near }) {
  const out = new URLSearchParams();
  for (const k of ["q", "when", "from", "to", "type", "price", "category", "topic", "interest"]) if (filters[k]) out.set(k, String(filters[k]));
  if (near) {
    out.set("near", `${near.lat},${near.lng}`);
    if (filters.radius_km) out.set("radius_km", String(filters.radius_km));
  }
  return out.toString();
}

/* ---------- /clubs ---------- */

/** The find-clubs page's state; without a place, "nearby" and a radius are dropped. */
export function clubsPageState(params) {
  const raw = readClubFilters(params);
  const near = nearPoint(raw.near);
  const filters = near ? raw : { ...raw, near: "", radius_km: null, sort: raw.sort === "nearby" ? "" : raw.sort };
  return { filters, near, sortAsked: raw.sort };
}

function clubFiltersSet({ filters, near }) {
  const set = [];
  if (filters.q) set.push("q");
  if (filters.topic) set.push("topic");
  if (filters.interest) set.push("interest");
  if (near) set.push("near");
  if (filters.radius_km) set.push("radius_km");
  return set;
}

/**
 * As eventsIndexing: the page itself, or one known interest or topic alone
 * with clubs in it, is kept (a topic at the slug the topics list has for
 * it, `topicSlug`); anything else is not.
 */
export function clubsIndexing(state, { total = null, interestName = null, topicSlug = null } = {}) {
  const set = clubFiltersSet(state);
  if (!set.length) return { index: true, path: "/clubs" };
  if (set.length === 1 && set[0] === "interest" && interestName && total !== 0) return { index: true, path: `/clubs?interest=${encodeURIComponent(state.filters.interest)}` };
  if (set.length === 1 && set[0] === "topic" && topicSlug && total !== 0) return { index: true, path: `/clubs?topic=${encodeURIComponent(topicSlug)}` };
  return NOT_KEPT;
}

export function clubsHeading({ filters, near }, { interestName = null, city = null, topicName = null } = {}) {
  if (filters.q) return `Clubs matching “${filters.q}”`;
  if (near) return `Clubs near ${city || "you"}`;
  if (filters.interest && interestName) return `${interestName} clubs`;
  if (filters.topic && topicName) return `${topicName} clubs`;
  return "Clubs on MyOtherApp";
}

export const CLUBS_TITLE = "Clubs";
export const CLUBS_DESCRIPTION = "Find clubs near you on MyOtherApp and see what they're running next.";

export function clubsHead(state, names = {}) {
  const heading = clubsHeading(state, names);
  if (!clubFiltersSet(state).length || heading === clubsHeading({ filters: {}, near: null })) return { heading, title: CLUBS_TITLE, description: CLUBS_DESCRIPTION };
  return { heading, title: heading, description: `${heading}: find clubs by interest and follow the ones you like on MyOtherApp.` };
}
