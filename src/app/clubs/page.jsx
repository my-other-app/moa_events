import { SitePage } from "@/components/discover/chrome";
import { ClubsView } from "@/components/discover/clubspage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { clubsHead, clubsIndexing, paramsOf, topicChoice } from "@/seo/listings";
import { listingMetadata } from "@/seo/metadata";
import { clubsListStructuredData } from "@/seo/structured";
import { listClubs } from "@/server/listings";
import { getTopicsOrNull } from "@/server/topics";
import { requestVisitor } from "@/server/visitor";

/*
 * /clubs: find clubs. SERVER-RENDERED per request, like /events: the
 * heading, the interest chips, the count and the first twelve clubs are in
 * the HTML, with an ItemList of them; filters, the place and "Load more"
 * are islands. /clubs, /clubs?interest= and /clubs?topic= alone are
 * indexed; any other mix is "noindex, follow".
 *
 * Topics (the Topic filter, and a picked topic's interests as the chips)
 * come from the topics list, read alongside (cached five minutes); an API
 * without topics has none, and the page is as before.
 */
async function load(searchParams) {
  const search = paramsOf(await searchParams).toString();
  const { ip } = await requestVisitor();
  const [listed, tree] = await Promise.all([listClubs(search, ip), getTopicsOrNull()]);
  const topics = topicChoice(listed.state.filters, { tree, count: "clubs" });
  return { search, ...listed, topics };
}

const namesOf = ({ state, page, topics }) => ({
  interestName: state.filters.interest ? page.interests.find((i) => String(i.id) === state.filters.interest)?.name || topics.interestName : null,
  city: state.near ? page.where.city : null,
  topicName: topics.topicName,
});

export async function generateMetadata({ searchParams }) {
  const data = await load(searchParams);
  const names = namesOf(data);
  const { title, description } = clubsHead(data.state, names);
  return listingMetadata({ title, description, indexing: clubsIndexing(data.state, { total: data.page.total, interestName: names.interestName, topicSlug: data.topics.topicSlug }) });
}

export default async function Clubs({ searchParams }) {
  const data = await load(searchParams);
  const { state, page, search, topics } = data;
  const names = namesOf(data);
  const { heading } = clubsHead(state, names);
  const path = clubsIndexing(state, { total: page.total, interestName: names.interestName, topicSlug: topics.topicSlug }).path || `/clubs${search ? `?${search}` : ""}`;
  return (
    <SitePage>
      <JsonLd data={clubsListStructuredData(page.items, { name: heading, path })} />
      <ClubsView state={state} page={page} heading={heading} topics={topics} />
    </SitePage>
  );
}
