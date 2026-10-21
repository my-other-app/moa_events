import { SitePage } from "@/components/discover/chrome";
import { CitiesView } from "@/components/discover/citypage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { citiesMetadata, citiesStructuredData, cityGroups, indexableCities } from "@/seo/citypages";
import { readOr } from "@/server/build";
import { getCitySummaries } from "@/server/cities";

/*
 * /events/in: every city with upcoming events, Kerala's first, each a link
 * to its page. SERVER-RENDERED, statically regenerated (ISR, five
 * minutes); CollectionPage, ItemList (the city pages worth indexing) and
 * BreadcrumbList. Indexed while at least one city page is.
 */
export const revalidate = 300;

const load = () => readOr(getCitySummaries(), []);

export async function generateMetadata() {
  return citiesMetadata({ indexable: indexableCities(await load()).length > 0 });
}

export default async function Cities() {
  const summaries = await load();
  return (
    <SitePage>
      <JsonLd data={citiesStructuredData(summaries)} />
      <CitiesView groups={cityGroups(summaries)} />
    </SitePage>
  );
}
