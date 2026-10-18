import "server-only";
import { cache } from "react";
import {
  ANYWHERE,
  PAGE_SIZE,
  clubsQuery,
  eventsQuery,
  parseClubEventsPage,
  parseClubPage,
  parseClubsPage,
  parseComment,
  parseEventPage,
  parseEventsPage,
  parseHome,
  parseSitemap,
  parseSitemapIndex,
  parseSitemapPage,
  parseThread,
  parseThreadsPage,
} from "@/api/parse";
import { parsePlans } from "@/utils/pricing";
import { everyoneHome } from "@/utils/home";
import { ApiError, apiGet, forwardsVisitor } from "./api";

/**
 * The discover API, read on the server for pages, feeds, sitemaps and
 * media. Each function returns parsed data (the same parsers the browser
 * uses, from @/api/parse), null when the API says the thing doesn't exist
 * (404), and throws ApiError when the API fails, so a page can tell
 * "not found" (a real 404) from "try again" (the error page).
 *
 * Wrapped in React's cache(): a page's generateMetadata and the page itself
 * ask once per render. Across requests, Next's data cache keeps each answer
 * for `revalidate` seconds (60 for pages), tagged for on-demand
 * revalidation (/api/revalidate).
 */

const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** True for something that can be an event's slug or id, or a club's slug. Anything else is never looked up. */
export const isRef = (v) => REF.test(String(v ?? ""));

export const TAGS = {
  event: (ref) => `event:${ref}`,
  club: (slug) => `club:${slug}`,
  thread: (id) => `thread:${id}`,
  /** Lists of events and clubs (the home page, the find pages, feeds, a club's list): cheap to refresh when any event changes. */
  lists: "lists",
  sitemap: "sitemap",
  plans: "plans",
};

/** Pages revalidate every minute. */
export const PAGE_REVALIDATE = 60;

async function eventPage(ref, fresh) {
  if (!isRef(ref)) return null;
  const { data } = await apiGet(`/api/v1/discover/events/${encodeURIComponent(ref)}`, {
    fresh,
    revalidate: PAGE_REVALIDATE,
    tags: [TAGS.event(ref)],
  });
  return data ? parseEventPage(data) : null;
}

/** An event's page by slug or id: {event, club, speakers, agenda, team, …}; null when it isn't public. */
export const getEventPage = cache((ref) => eventPage(ref, false));

/** The same, past every cache (for a link that must be fresh: a presigned poster about to expire). */
export const getEventPageFresh = (ref) => eventPage(ref, true);

async function clubPage(slug, fresh) {
  if (!isRef(slug)) return null;
  const { data } = await apiGet(`/api/v1/discover/clubs/${encodeURIComponent(slug)}`, {
    fresh,
    revalidate: PAGE_REVALIDATE,
    tags: [TAGS.club(slug)],
  });
  return data ? parseClubPage(data) : null;
}

/** A club's page by slug: {club, upcoming, past, threads, team, partners}; null when there is no such public club. */
export const getClubPage = cache((slug) => clubPage(slug, false));
export const getClubPageFresh = (slug) => clubPage(slug, true);

/** A club's events a page at a time (when: "upcoming" | "past"); null for an unknown club. */
export async function getClubEvents(slug, { when = "upcoming", offset = 0, limit = 48, revalidate = PAGE_REVALIDATE } = {}) {
  if (!isRef(slug)) return null;
  const { data } = await apiGet(`/api/v1/discover/clubs/${encodeURIComponent(slug)}/events`, {
    query: { when, offset, limit: Math.min(48, limit) },
    revalidate,
    tags: [TAGS.club(slug), TAGS.lists],
  });
  return data ? parseClubEventsPage(data) : null;
}

/**
 * Where a list read asks about: a point, ANYWHERE, or null for "wherever
 * the visitor is". The API places a read without a point by the address it
 * comes from; from here that is this server's, unless the visitor's own
 * goes with it (X-Visitor-IP, see ./api.js). So null stays null only for a
 * forwarded visitor (and near-you works from the server); otherwise it
 * becomes ANYWHERE (radius 0, every event).
 */
export const placeFor = (where, visitor) => (where ? where : forwardsVisitor(visitor) ? null : ANYWHERE);

/**
 * Events to find, with the list page's filters (see @/api/parse's
 * eventsQuery). `where`: a point, ANYWHERE, or null (see placeFor).
 * `visitor` when the read is made for one person (a dynamic page).
 * `sort` overrides the filters' order (the feeds' "newest").
 */
export async function getEvents(filters = {}, { where = null, visitor = null, offset = 0, limit = 24, sort = null, revalidate = PAGE_REVALIDATE } = {}) {
  const query = eventsQuery(filters, placeFor(where, visitor), { offset, limit });
  if (sort) query.sort = sort;
  const { data } = await apiGet("/api/v1/discover/events", { query, revalidate, visitor, tags: [TAGS.lists] });
  return parseEventsPage(data);
}

/**
 * The newest-published events first (GET /discover/events?sort=newest), for
 * the feeds; null from an API that doesn't know that order yet (it answers
 * 422), and the feed falls back to sorting by itself.
 */
export async function getNewestEvents(filters = {}, { where = null, offset = 0, limit = 60, revalidate = PAGE_REVALIDATE } = {}) {
  try {
    return await getEvents({ ...filters, sort: "" }, { where: where || ANYWHERE, offset, limit, sort: "newest", revalidate });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 422 || e.status === 400)) return null;
    throw e;
  }
}

/** Clubs to find, with the list page's filters; `where` and `visitor` as for getEvents. */
export async function getClubs(filters = {}, { where = null, visitor = null, offset = 0, limit = PAGE_SIZE, revalidate = PAGE_REVALIDATE } = {}) {
  const query = clubsQuery(filters, placeFor(where, visitor), { offset, limit });
  const { data } = await apiGet("/api/v1/discover/clubs", { query, revalidate, visitor, tags: [TAGS.lists] });
  return parseClubsPage(data);
}

/* ---------- the home page ---------- */

/**
 * The home page as anyone sees it (statically regenerated, so read for
 * nobody): what's on this week, online and popular, the categories, the
 * clubs, the latest posts and the numbers, with nothing about where the
 * reader is. An API that placed this read anyway (by this server's
 * address) has its "near" and distances dropped, and its clubs (nearest
 * to the server) swapped for the most followed. Near you is filled in the
 * browser (/api/near).
 */
export async function getHome() {
  const { data } = await apiGet("/api/v1/discover/home", { revalidate: PAGE_REVALIDATE, tags: [TAGS.lists] });
  const home = parseHome(data);
  if (home.where.source === "none") return everyoneHome(home, null);
  const popular = await getClubs({ sort: "popular" }, { where: ANYWHERE, limit: 8 }).catch(() => null);
  return everyoneHome(home, popular ? popular.items : null);
}

/**
 * Near one visitor, for /api/near: the home read at a point (`point`), or
 * with no point for the API to place the visitor by their address (only
 * sensible when it goes along: X-Visitor-IP). Cached a minute per point
 * (and per address, when it goes).
 */
export async function getNearHome(point, { visitor = null } = {}) {
  const query = point ? { lat: point.lat, lng: point.lng } : null;
  const { data } = await apiGet("/api/v1/discover/home", { query, visitor, revalidate: PAGE_REVALIDATE, tags: [TAGS.lists] });
  return parseHome(data);
}

/* ---------- posts ---------- */

/** The clubs' latest posts, a page at a time. */
export async function getThreads({ offset = 0, limit = PAGE_SIZE, revalidate = PAGE_REVALIDATE } = {}) {
  const { data } = await apiGet("/api/v1/discover/threads", { query: { offset, limit }, revalidate, tags: [TAGS.lists] });
  return parseThreadsPage(data);
}

/** One post (read as nobody: no like or vote of anyone's), for its page and its picture; null when it is gone. */
export async function getThread(id, { fresh = false } = {}) {
  if (!isRef(id)) return null;
  const { data } = await apiGet(`/api/v1/threads/${encodeURIComponent(id)}`, { fresh, revalidate: PAGE_REVALIDATE, tags: [TAGS.thread(id)] });
  return data ? parseThread(data) : null;
}

/** A post's page reads it once for the head and the page. */
export const getThreadPage = cache((id) => getThread(id));

/** A post's comments, oldest first; null when the post is gone. */
export const getComments = cache(async (id) => {
  if (!isRef(id)) return null;
  const { data } = await apiGet(`/api/v1/threads/${encodeURIComponent(id)}/comments`, { revalidate: PAGE_REVALIDATE, tags: [TAGS.thread(id)] });
  if (data === null) return null;
  return Array.isArray(data) ? data.map(parseComment).filter(Boolean) : [];
});

/* ---------- the clubs' plans ---------- */

/** The plans (GET /api/v1/plans), the same for everyone; null when none came back. */
export const getPlans = cache(async () => {
  const { data } = await apiGet("/api/v1/plans", { revalidate: 300, tags: [TAGS.plans] });
  return data ? parsePlans(data) : null;
});

/* ---------- the sitemap ---------- */

const SITEMAP_REVALIDATE = 600;

/**
 * The sitemap's source, whichever the API offers:
 *   {paged: true,  pageSize, pages: [{kind, page, entries, updated_at}]}   GET /discover/sitemap/index
 *   {paged: false, events: [...], clubs: [...]}                            GET /discover/sitemap (at most 5000 of each)
 * An API with the paged sitemap answers /sitemap/index; one without it says 404 there.
 */
export async function getSitemapSource() {
  const index = await apiGet("/api/v1/discover/sitemap/index", { revalidate: SITEMAP_REVALIDATE, tags: [TAGS.sitemap] });
  const parsed = index.data ? parseSitemapIndex(index.data) : null;
  if (parsed) return { paged: true, ...parsed };
  const { data } = await apiGet("/api/v1/discover/sitemap", { revalidate: SITEMAP_REVALIDATE, tags: [TAGS.sitemap], timeoutMs: 15000 });
  return { paged: false, ...parseSitemap(data) };
}

/** One page of the paged sitemap: {kind, page, pages, items}; null past the last page. */
export async function getSitemapPage(kind, page) {
  const { data } = await apiGet(`/api/v1/discover/sitemap/${kind}/${page}`, { revalidate: SITEMAP_REVALIDATE, tags: [TAGS.sitemap], timeoutMs: 15000 });
  return data ? parseSitemapPage(data) : null;
}
