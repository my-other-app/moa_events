import { SitePage } from "@/components/discover/chrome";
import { EventsView } from "@/components/discover/eventspage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { eventsFeedQuery, eventsHead, eventsIndexing, paramsOf, topicChoice } from "@/seo/listings";
import { listingMetadata } from "@/seo/metadata";
import { feedTitle } from "@/seo/rss";
import { eventsListStructuredData } from "@/seo/structured";
import { feeds } from "@/seo/urls";
import { listEvents } from "@/server/listings";
import { getTopicsOrNull } from "@/server/topics";
import { requestVisitor } from "@/server/visitor";

/*
 * /events: find events. SERVER-RENDERED per request (its query is its
 * content): the heading, the category chips, the count and the first
 * twelve events are in the HTML, with an ItemList of them. The filters,
 * the place, "Load more" and the calendar (?view=calendar) are islands.
 *
 * Only /events itself and a single browsing filter (?category=, ?type=,
 * ?price=, ?when=) are indexed, each with its own canonical; ?topic= alone
 * has the topic's page as its canonical; every other mix is "noindex,
 * follow" (src/seo/listings.js). Its HTML depends on the address alone, so
 * the edge keeps it a minute (next.config.mjs).
 *
 * Topics: the list's own facet names them (the Topic filter); the topics
 * and their interests are read only when one is picked (?topic=,
 * ?interest=), for its interests' chips. An API without topics sends no
 * facet: no filter, as before.
 */
async function load(searchParams) {
  const params = paramsOf(await searchParams);
  const search = params.toString();
  const { ip } = await requestVisitor();
  const [listed, tree] = await Promise.all([listEvents(search, ip), params.get("topic") || params.get("interest") ? getTopicsOrNull() : null]);
  const topics = topicChoice(listed.state.filters, { facet: listed.page.topics, tree });
  return { search, ...listed, topics };
}

const namesOf = ({ state, page, topics }) => ({
  categoryName: state.filters.category ? page.categories.find((c) => String(c.id) === state.filters.category)?.name || null : null,
  city: state.near ? page.where.city : null,
  topicName: topics.topicName,
  interestName: topics.interestName,
});

export async function generateMetadata({ searchParams }) {
  const data = await load(searchParams);
  const names = namesOf(data);
  const { title, description } = eventsHead(data.state, names);
  const feed = eventsFeedQuery(data.state);
  return listingMetadata({
    title,
    description,
    indexing: eventsIndexing(data.state, { total: data.page.total, categoryName: names.categoryName, topicSlug: data.topics.topicSlug }),
    rss: {
      url: feeds.events(feed),
      title: feedTitle({ filters: data.state.filters, categoryName: names.categoryName, topicName: names.interestName || names.topicName, near: Boolean(data.state.near) }),
    },
  });
}

export default async function Events({ searchParams }) {
  const data = await load(searchParams);
  const { state, page, search, topics } = data;
  const names = namesOf(data);
  const { heading } = eventsHead(state, names);
  const path = eventsIndexing(state, { total: page.total, categoryName: names.categoryName, topicSlug: topics.topicSlug }).path || `/events${search ? `?${search}` : ""}`;
  return (
    <SitePage>
      {state.calendar ? null : <JsonLd data={eventsListStructuredData(page.items, { name: heading, path })} />}
      <EventsView state={state} page={page} heading={heading} topics={topics} />
    </SitePage>
  );
}
