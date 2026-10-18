import { SitePage } from "@/components/discover/chrome";
import { ClubsView } from "@/components/discover/clubspage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { clubsHead, clubsIndexing, paramsOf } from "@/seo/listings";
import { listingMetadata } from "@/seo/metadata";
import { clubsListStructuredData } from "@/seo/structured";
import { listClubs } from "@/server/listings";
import { requestVisitor } from "@/server/visitor";

/*
 * /clubs: find clubs. SERVER-RENDERED per request, like /events: the
 * heading, the interest chips, the count and the first twelve clubs are in
 * the HTML, with an ItemList of them; filters, the place and "Load more"
 * are islands. /clubs and /clubs?interest= alone are indexed; any other mix
 * is "noindex, follow".
 */
async function load(searchParams) {
  const search = paramsOf(await searchParams).toString();
  const { ip } = await requestVisitor();
  return { search, ...(await listClubs(search, ip)) };
}

const namesOf = ({ state, page }) => ({
  interestName: state.filters.interest ? page.interests.find((i) => String(i.id) === state.filters.interest)?.name || null : null,
  city: state.near ? page.where.city : null,
});

export async function generateMetadata({ searchParams }) {
  const data = await load(searchParams);
  const names = namesOf(data);
  const { title, description } = clubsHead(data.state, names);
  return listingMetadata({ title, description, indexing: clubsIndexing(data.state, { total: data.page.total, interestName: names.interestName }) });
}

export default async function Clubs({ searchParams }) {
  const data = await load(searchParams);
  const { state, page, search } = data;
  const names = namesOf(data);
  const { heading } = clubsHead(state, names);
  const path = clubsIndexing(state, { total: page.total, interestName: names.interestName }).path || `/clubs${search ? `?${search}` : ""}`;
  return (
    <SitePage>
      <JsonLd data={clubsListStructuredData(page.items, { name: heading, path })} />
      <ClubsView state={state} page={page} heading={heading} />
    </SitePage>
  );
}
