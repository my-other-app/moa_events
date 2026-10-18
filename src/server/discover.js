import "server-only";
import { cache } from "react";
import {
  eventsQuery,
  parseClubEventsPage,
  parseClubPage,
  parseEventPage,
  parseEventsPage,
  parseSitemap,
  parseSitemapIndex,
  parseSitemapPage,
  parseThread,
} from "@/api/parse";
import { apiGet } from "./api";

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
  /** Lists of events (feeds, a club's list): cheap to refresh when any event changes. */
  lists: "lists",
  sitemap: "sitemap",
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
 * Events to find, with the list page's filters (see @/api/parse's
 * eventsQuery). Without a point the API would place the "visitor" by the
 * address the request came from — this server's — so a list read here
 * without lat/lng asks for everywhere (radius 0).
 */
export async function getEvents(filters = {}, { where = null, offset = 0, limit = 24, revalidate = PAGE_REVALIDATE } = {}) {
  const query = eventsQuery(filters, where, { offset, limit });
  if (query.lat === undefined || query.lng === undefined) query.radius_km = 0;
  const { data } = await apiGet("/api/v1/discover/events", { query, revalidate, tags: [TAGS.lists] });
  return parseEventsPage(data);
}

/** One post, for its picture; null when it is gone. */
export async function getThread(id, { fresh = false } = {}) {
  if (!isRef(id)) return null;
  const { data } = await apiGet(`/api/v1/threads/${encodeURIComponent(id)}`, { fresh, revalidate: PAGE_REVALIDATE });
  return data ? parseThread(data) : null;
}

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
