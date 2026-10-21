import { notFound, permanentRedirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { CityClubsView } from "@/components/discover/citypage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { cityByAnySlug, cityClubsPath } from "@/seo/cities";
import { cityClubsMetadata, cityClubsStructuredData } from "@/seo/citypages";
import { stableClubCard } from "@/seo/stabilize";
import { getCityClubs, getCitySummaries } from "@/server/cities";

/*
 * /clubs/in/{city}: "Clubs in Kochi". SERVER-RENDERED, statically
 * regenerated (ISR, five minutes): the clubs in and around the city, most
 * followed first, with CollectionPage, ItemList and BreadcrumbList
 * structured data. Indexed only while it has a real club (not a demo one);
 * other names for the city 308 to its slug; anything else is a 404.
 */
export const revalidate = 300;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const { city: slug } = await params;
  const city = cityByAnySlug(slug);
  if (!city) return { title: "Page not found", robots: { index: false, follow: true } };
  const clubs = await getCityClubs(city);
  return cityClubsMetadata(city, { indexable: clubs.real > 0 });
}

export default async function CityClubs({ params }) {
  const { city: slug } = await params;
  const city = cityByAnySlug(slug);
  if (!city) notFound();
  if (city.slug !== slug) permanentRedirect(cityClubsPath(city));
  const [clubs, summaries] = await Promise.all([getCityClubs(city), getCitySummaries().catch(() => [])]);
  const others = summaries.filter((s) => s.events > 0 && s.city.slug !== city.slug);
  return (
    <SitePage>
      <JsonLd data={cityClubsStructuredData(city, clubs.items)} />
      <CityClubsView city={city} clubs={clubs.items.map(stableClubCard)} more={clubs.more} others={others} />
    </SitePage>
  );
}
