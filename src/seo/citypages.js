/**
 * The city landing pages, as search engines read them: their titles, words,
 * which ones are worth indexing, and their structured data. Pure (tested in
 * citypages.test.js); the routes are src/app/events/in and src/app/clubs/in.
 *
 *   /events/in             every city with upcoming events (the hub)
 *   /events/in/{city}      "Events in Kochi": its upcoming in-person events
 *   /clubs/in/{city}       "Clubs in Kochi"
 *
 * A city page is indexed (and in the sitemap) only while it has something
 * real in it: at least one upcoming event (or club) that isn't one of the
 * made-up demo clubs' (src/seo/demo.js). An empty one is still a page, for
 * people, but says noindex, follow.
 */
import { RADIUS_OPTIONS } from "@/api/parse";
import { SITE_URL } from "@/config";
import { CITIES_PATH, cityClubsPath, cityEventsPath, isKerala } from "./cities";
import { demoSettings, isDemoCard, isDemoClub, withoutDemo } from "./demo";
import { breadcrumbJsonLd, clean, collectionPageJsonLd, itemListJsonLd } from "./jsonld";
import { SITE_NAME, pageMetadata } from "./metadata";
import { absoluteUrl, clubPagePath, eventPagePath, feeds } from "./urls";

/** "Kochi (Ernakulam, Cochin)": the name, and the first two it also goes by. */
export const cityAlso = (city) => (city.also.length ? `${city.name} (${city.also.slice(0, 2).join(", ")})` : city.name);

/** "Kochi, Kerala". */
export const cityWhere = (city) => `${city.name}, ${city.state}`;

/** The radius the find pages offer that holds the city (the nearest at least its own). */
const finderRadius = (city) => RADIUS_OPTIONS.find((r) => r >= city.radiusKm) || RADIUS_OPTIONS.at(-1);

/** The find page for the same place, for "See all": /events?near=…&radius_km=…. */
export function cityFinderPath(city, kind = "events") {
  return `/${kind}?near=${city.lat},${city.lng}&radius_km=${finderRadius(city)}`;
}

/** The events feed for the same place: in person, around the city. */
export const cityFeedPath = (city) => feeds.events(`near=${city.lat},${city.lng}&radius_km=${finderRadius(city)}&type=in_person`);

/* ---------- events in a city ---------- */

/** {title, heading, description} for /events/in/{city}. */
export function cityEventsHead(city) {
  const heading = `Events in ${city.name}: hackathons, workshops and meetups`;
  return {
    title: heading,
    heading,
    description: `Upcoming hackathons, workshops, meetups and club events in ${cityAlso(city)}, ${city.state}. See what's on and register on ${SITE_NAME}.`,
  };
}

/** The introduction: the city in a line of our own (when we have one), then what the page lists. */
export function cityEventsIntro(city, { count = 0, more = false, clubs = 0 } = {}) {
  const what = count
    ? `${more ? `${count}+` : count} upcoming in-person ${count === 1 && !more ? "event" : "events"}${clubs ? ` from ${clubs} ${clubs === 1 ? "club" : "clubs"}` : ""} in and around ${city.name}, soonest first.`
    : `Nothing is listed in ${city.name} right now. Clubs add events all the time: follow one to hear first, or see what's on online.`;
  const lead = city.about ? `${city.about} ` : "";
  return `${lead}Hackathons, workshops, meetups, talks and fests run by student and community clubs within ${city.radiusKm} km of ${city.name}. ${what}`;
}

/** /events/in/{city}'s head, with the feed for the place; `indexable` when it lists at least one real upcoming event. */
export function cityEventsMetadata(city, { indexable }) {
  const { title, description } = cityEventsHead(city);
  return pageMetadata({ title, description, path: cityEventsPath(city), noindex: !indexable, rss: { url: cityFeedPath(city), title: `Upcoming events in ${city.name} on ${SITE_NAME}` } });
}

/** A city as schema.org Place: its name, state and country, and its centre. */
export const cityPlace = (city) =>
  clean({
    "@type": "City",
    name: city.name,
    alternateName: city.also.length ? city.also : null,
    address: { "@type": "PostalAddress", addressLocality: city.name, addressRegion: city.state, addressCountry: "IN" },
    geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng },
    containedInPlace: { "@type": "State", name: city.state },
  });

/** A city page's CollectionPage, about the city. */
const cityCollection = (city, { name, description, url, list }) => ({ ...collectionPageJsonLd({ name, description, url, list }), about: cityPlace(city) });

/**
 * /events/in/{city}: [CollectionPage (about the city), ItemList of its real
 * upcoming events (the demo clubs' left out; none: no list), BreadcrumbList
 * Home › Events › City].
 */
export function cityEventsStructuredData(city, events, { settings = demoSettings() } = {}) {
  const url = absoluteUrl(cityEventsPath(city));
  const list = `${url}#events`;
  const real = withoutDemo(events, isDemoCard, settings);
  const { heading, description } = cityEventsHead(city);
  return [
    cityCollection(city, { name: heading, description, url, list: real.length ? list : null }),
    ...(real.length ? [itemListJsonLd({ id: list, name: `Upcoming events in ${city.name}`, url, items: real.map((e) => ({ url: absoluteUrl(eventPagePath(e)), name: e.name })) })] : []),
    breadcrumbJsonLd([
      ["Home", `${SITE_URL}/`],
      ["Events", `${SITE_URL}/events`],
      [`Events in ${city.name}`, url],
    ]),
  ];
}

/* ---------- clubs in a city ---------- */

export function cityClubsHead(city) {
  const heading = `Clubs in ${city.name}`;
  return {
    title: `Clubs in ${city.name}: student and community clubs`,
    heading,
    description: `Student and community clubs in ${cityAlso(city)}, ${city.state}, on ${SITE_NAME}: tech, design, music, sport and more. Follow them for their next hackathon, workshop or meetup.`,
  };
}

export function cityClubsIntro(city, { count = 0, more = false } = {}) {
  return count
    ? `${more ? `${count}+` : count} ${count === 1 && !more ? "club" : "clubs"} in and around ${city.name}, most followed first. Open one to see what it runs next, or follow it to hear first.`
    : `No club in ${city.name} is on ${SITE_NAME} yet. Run one? Bring it over: it's free to start.`;
}

export function cityClubsMetadata(city, { indexable }) {
  const { title, description } = cityClubsHead(city);
  return pageMetadata({ title, description, path: cityClubsPath(city), noindex: !indexable });
}

export function cityClubsStructuredData(city, clubs, { settings = demoSettings() } = {}) {
  const url = absoluteUrl(cityClubsPath(city));
  const list = `${url}#clubs`;
  const real = withoutDemo(clubs, isDemoClub, settings).filter((c) => c.slug);
  const { heading, description } = cityClubsHead(city);
  return [
    cityCollection(city, { name: heading, description, url, list: real.length ? list : null }),
    ...(real.length ? [itemListJsonLd({ id: list, name: heading, url, items: real.map((c) => ({ url: absoluteUrl(clubPagePath(c)), name: c.name })) })] : []),
    breadcrumbJsonLd([
      ["Home", `${SITE_URL}/`],
      ["Clubs", `${SITE_URL}/clubs`],
      [heading, url],
    ]),
  ];
}

/* ---------- the hub ---------- */

export const CITIES_TITLE = "Events by city";
export const CITIES_DESCRIPTION = `Hackathons, workshops and meetups by city: Kochi, Thiruvananthapuram, Kozhikode, Thrissur, Kannur, Kottayam and more, from the clubs on ${SITE_NAME}.`;

/**
 * The cities worth a link: those with upcoming events (for people: demo
 * events count), Kerala's first. `summaries` are getCitySummaries()'s.
 */
export const citiesWithEvents = (summaries) => (summaries || []).filter((s) => s.events > 0);

/** The cities worth indexing: at least one real upcoming event. */
export const indexableCities = (summaries) => (summaries || []).filter((s) => s.realEvents > 0);

export const citiesMetadata = ({ indexable }) => pageMetadata({ title: CITIES_TITLE, description: CITIES_DESCRIPTION, path: CITIES_PATH, noindex: !indexable });

/** The hub's two groups: [["Kerala", [...]], ["Across India", [...]]], empty groups left out. */
export function cityGroups(summaries) {
  const shown = citiesWithEvents(summaries);
  return [
    ["Kerala", shown.filter((s) => isKerala(s.city))],
    ["Across India", shown.filter((s) => !isKerala(s.city))],
  ].filter(([, rows]) => rows.length);
}

/** /events/in: [CollectionPage, ItemList of the city pages worth indexing (none: no list), BreadcrumbList]. */
export function citiesStructuredData(summaries) {
  const url = absoluteUrl(CITIES_PATH);
  const list = `${url}#cities`;
  const kept = indexableCities(summaries);
  return [
    collectionPageJsonLd({ name: CITIES_TITLE, description: CITIES_DESCRIPTION, url, list: kept.length ? list : null }),
    ...(kept.length ? [itemListJsonLd({ id: list, name: CITIES_TITLE, url, items: kept.map((s) => ({ url: absoluteUrl(cityEventsPath(s.city)), name: `Events in ${s.city.name}` })) })] : []),
    breadcrumbJsonLd([
      ["Home", `${SITE_URL}/`],
      ["Events", `${SITE_URL}/events`],
      [CITIES_TITLE, url],
    ]),
  ];
}

/** The sitemap's city entries: the hub (when any city is kept), each city's events page and clubs page worth indexing. */
export function cityEntries(summaries, { siteUrl = SITE_URL } = {}) {
  const rows = [];
  for (const s of summaries || []) {
    if (s.realEvents > 0) rows.push({ loc: `${siteUrl}${cityEventsPath(s.city)}`, changefreq: "daily", priority: "0.7" });
    if (s.realClubs > 0) rows.push({ loc: `${siteUrl}${cityClubsPath(s.city)}`, changefreq: "weekly", priority: "0.6" });
  }
  return indexableCities(summaries).length ? [{ loc: `${siteUrl}${CITIES_PATH}`, changefreq: "daily", priority: "0.7" }, ...rows] : rows;
}
