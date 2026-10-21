import "server-only";
import { cache } from "react";
import { parseClubsPage, parseEventsPage } from "@/api/parse";
import { CITIES, cityInText, cityOf } from "@/seo/cities";
import { demoSettings, isDemoCard, isDemoClub, withoutDemo } from "@/seo/demo";
import { apiGet } from "./api";
import { TAGS } from "./discover";

/**
 * The city pages' data (/events/in/{city}, /clubs/in/{city}, the
 * /events/in hub, "Browse by city", the cities sitemap). The API has no
 * city filter, so a city is read as a point and a radius (src/seo/cities.js):
 *
 *   events  GET /discover/events?lat&lng&radius_km&type=in_person&sort=date
 *           (upcoming, in person, inside the radius); kept: those the
 *           matching puts in this city, so a venue inside two radii is on
 *           one page only, and an in-person event without a point is kept
 *           only when its words name the city
 *   clubs   GET /discover/clubs?lat&lng&radius_km&sort=popular; kept: those
 *           whose place names the city, else whose distance is inside
 *           the radius
 *
 * Each read is made for nobody and cached five minutes (tag `lists`),
 * so the pages are the same for everyone (ISR). Distances are dropped: a
 * city page is about the city, not the reader.
 */
export const CITY_REVALIDATE = 300;
/** What a city page reads (and shows at most): the API's largest page. */
export const CITY_LIMIT = 60;

const placeless = (items) => items.map((i) => (i.distance_km === null ? i : { ...i, distance_km: null }));

const read = (path, query) => apiGet(path, { query, revalidate: CITY_REVALIDATE, tags: [TAGS.lists] });

/**
 * A city's upcoming in-person events, soonest first:
 * {items, more, real} — `more` when the API had more than it sent,
 * `real` how many are not the made-up demo clubs' (src/seo/demo.js).
 */
export const getCityEvents = cache(async (city) => {
  const { data } = await read("/api/v1/discover/events", { lat: city.lat, lng: city.lng, radius_km: city.radiusKm, type: "in_person", sort: "date", offset: 0, limit: CITY_LIMIT });
  const page = parseEventsPage(data);
  const items = placeless(page.items.filter((e) => cityOf(e)?.slug === city.slug));
  return { items, more: page.total > page.items.length, real: withoutDemo(items, isDemoCard, demoSettings()).length };
});

/** A club in this city: its place names it, else (naming none) it is inside the radius. */
const clubIn = (city) => (c) => {
  const named = cityInText(c.location_name);
  if (named) return named.slug === city.slug;
  return typeof c.distance_km === "number" && c.distance_km <= city.radiusKm;
};

/** A city's clubs, most followed first: {items, more, real}, as getCityEvents. */
export const getCityClubs = cache(async (city) => {
  const { data } = await read("/api/v1/discover/clubs", { lat: city.lat, lng: city.lng, radius_km: city.radiusKm, sort: "popular", offset: 0, limit: CITY_LIMIT });
  const page = parseClubsPage(data);
  const items = placeless(page.items.filter(clubIn(city)));
  return { items, more: page.total > page.items.length, real: withoutDemo(items, isDemoClub, demoSettings()).length };
});

/**
 * Every city with what it has: [{city, events, realEvents, clubs?, realClubs?}]
 * in the cities' order (Kerala first). A city whose read fails counts as
 * empty (a hub or a sitemap never fails for one city); `clubs` only when
 * asked (the sitemap).
 */
export const getCitySummaries = cache(async ({ clubs = false } = {}) => {
  const quiet = (p) => p.catch(() => ({ items: [], more: false, real: 0 }));
  return Promise.all(
    CITIES.map(async (city) => {
      const [ev, cl] = await Promise.all([quiet(getCityEvents(city)), clubs ? quiet(getCityClubs(city)) : null]);
      return {
        city,
        events: ev.items.length,
        moreEvents: ev.more,
        realEvents: ev.real,
        ...(cl ? { clubs: cl.items.length, realClubs: cl.real } : {}),
      };
    })
  );
});
