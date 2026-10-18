import { SitePage } from "@/components/discover/chrome";
import { EventsView } from "@/components/discover/eventspage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { eventsFeedQuery, eventsHead, eventsIndexing, paramsOf } from "@/seo/listings";
import { listingMetadata } from "@/seo/metadata";
import { feedTitle } from "@/seo/rss";
import { eventsListStructuredData } from "@/seo/structured";
import { feeds } from "@/seo/urls";
import { listEvents } from "@/server/listings";
import { requestVisitor } from "@/server/visitor";

/*
 * /events: find events. SERVER-RENDERED per request (its query is its
 * content): the heading, the category chips, the count and the first
 * twelve events are in the HTML, with an ItemList of them. The filters,
 * the place, "Load more" and the calendar (?view=calendar) are islands.
 *
 * Only /events itself and a single browsing filter (?category=, ?type=,
 * ?price=, ?when=) are indexed, each with its own canonical; every other
 * mix is "noindex, follow" (src/seo/listings.js). Its HTML depends on the
 * address alone, so the edge keeps it a minute (next.config.mjs).
 */
async function load(searchParams) {
  const search = paramsOf(await searchParams).toString();
  const { ip } = await requestVisitor();
  return { search, ...(await listEvents(search, ip)) };
}

const namesOf = ({ state, page }) => ({
  categoryName: state.filters.category ? page.categories.find((c) => String(c.id) === state.filters.category)?.name || null : null,
  city: state.near ? page.where.city : null,
});

export async function generateMetadata({ searchParams }) {
  const data = await load(searchParams);
  const names = namesOf(data);
  const { title, description } = eventsHead(data.state, names);
  const feed = eventsFeedQuery(data.state);
  return listingMetadata({
    title,
    description,
    indexing: eventsIndexing(data.state, { total: data.page.total, categoryName: names.categoryName }),
    rss: { url: feeds.events(feed), title: feedTitle({ filters: data.state.filters, categoryName: names.categoryName, near: Boolean(data.state.near) }) },
  });
}

export default async function Events({ searchParams }) {
  const data = await load(searchParams);
  const { state, page, search } = data;
  const names = namesOf(data);
  const { heading } = eventsHead(state, names);
  const path = eventsIndexing(state, { total: page.total, categoryName: names.categoryName }).path || `/events${search ? `?${search}` : ""}`;
  return (
    <SitePage>
      {state.calendar ? null : <JsonLd data={eventsListStructuredData(page.items, { name: heading, path })} />}
      <EventsView state={state} page={page} heading={heading} />
    </SitePage>
  );
}
