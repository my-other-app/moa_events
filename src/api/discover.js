import apiClient from "./client";
import { firstOfMonth, lastOfMonth } from "@/utils/days";
import {
  calendarQuery,
  clubsQuery,
  eventsQuery,
  parseCalendar,
  parseClubEventsPage,
  parseClubPage,
  parseClubsPage,
  parseComment,
  parseEventPage,
  parseEventsPage,
  parseHome,
  parseSitemap,
  parseThread,
  parseThreadsPage,
  parseWhere,
  PAGE_SIZE,
} from "./parse";

/**
 * The public discovery API, from the browser: events and clubs near you, a
 * club's page, the clubs' posts. Everything here is readable without an
 * account, so no request carries the token a registration may have left
 * behind. One post is read as the signed-in person, when there is one, so
 * it can say whether they liked it and how they voted.
 *
 * The shapes (filters, queries, parsers) are in ./parse.js and re-exported
 * here; the server reads the same API through src/server/discover.js.
 */
export * from "./parse";

const list = (v, fn) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : []);
const coords = (where) =>
  where && Number.isFinite(where.lat) && Number.isFinite(where.lng) ? { lat: where.lat, lng: where.lng } : {};

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

  /**
   * Every event on in a month, for the calendar: pages of `pageSize` until
   * all are in or `maxPages` were asked for. Rejects only when the first
   * page does; a later page that fails is left out.
   */
  monthEvents: async (filters, where, month, { pageSize = 48, maxPages = 4 } = {}) => {
    const f = { ...filters, when: "", from: firstOfMonth(month), to: lastOfMonth(month), sort: "" };
    const first = await discoverApi.events(f, where, { offset: 0, limit: pageSize });
    const pages = Math.min(maxPages, Math.ceil(first.total / pageSize));
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pages - 1) }, (_, i) => discoverApi.events(f, where, { offset: (i + 1) * pageSize, limit: pageSize }).catch(() => null))
    );
    const seen = new Set();
    const items = [first, ...rest]
      .flatMap((p) => p?.items || [])
      .filter((e) => (seen.has(e.id) ? false : seen.add(e.id)));
    return { ...first, items };
  },

  /** How many events each day of `month` has, with the list's filters. */
  calendar: (filters, where, month) => get("/api/v1/discover/calendar", calendarQuery(filters, where, month)).then(parseCalendar, tag),

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

  /** A club's past or upcoming events beyond the few its page carries; rejects with `notFound` where the API has no such list. */
  clubEvents: (slug, { when = "past", offset = 0, limit = PAGE_SIZE } = {}) =>
    get(`/api/v1/discover/clubs/${encodeURIComponent(slug)}/events`, { when: when === "upcoming" ? "upcoming" : "past", offset, limit: Math.min(48, limit) }).then(
      parseClubEventsPage,
      tag
    ),

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
