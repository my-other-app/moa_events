import { notFound, permanentRedirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { CityEventsView } from "@/components/discover/citypage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { cityByAnySlug, cityEventsPath } from "@/seo/cities";
import { citiesWithEvents, cityEventsMetadata, cityEventsStructuredData } from "@/seo/citypages";
import { stableCard, stableClubCard } from "@/seo/stabilize";
import { getCityClubs, getCityEvents, getCitySummaries } from "@/server/cities";
import { preconnectMedia } from "@/server/hints";
import { getTopicsOrNull } from "@/server/topics";

/*
 * /events/in/{city}: "Events in Kochi: hackathons, workshops and meetups".
 * SERVER-RENDERED, statically regenerated (ISR, at most every five
 * minutes), the same for everyone: the city's upcoming in-person events
 * (read as a point and a radius, src/server/cities.js), its first clubs,
 * the topics and the other cities, with CollectionPage, ItemList and
 * BreadcrumbList structured data.
 *
 * Indexed only while it lists a real upcoming event (not one of the demo
 * clubs', src/seo/demo.js); otherwise noindex, follow. A city goes by its
 * slug (src/seo/cities.js); another name for it (/events/in/cochin,
 * /events/in/trivandrum) answers 308 to it; anything else is a 404.
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
  const events = await getCityEvents(city);
  return cityEventsMetadata(city, { indexable: events.real > 0 });
}

export default async function CityEvents({ params }) {
  const { city: slug } = await params;
  const city = cityByAnySlug(slug);
  if (!city) notFound();
  if (city.slug !== slug) permanentRedirect(cityEventsPath(city));
  const [events, clubs, summaries, topics] = await Promise.all([
    getCityEvents(city),
    getCityClubs(city).catch(() => null),
    getCitySummaries().catch(() => []),
    getTopicsOrNull(),
  ]);
  const others = citiesWithEvents(summaries).filter((s) => s.city.slug !== city.slug);
  preconnectMedia(...events.items.map((e) => e.poster));
  return (
    <SitePage>
      <JsonLd data={cityEventsStructuredData(city, events.items)} />
      <CityEventsView
        city={city}
        events={events.items.map(stableCard)}
        more={events.more}
        clubs={clubs ? clubs.items.map(stableClubCard) : []}
        topics={topics ? topics.topics : []}
        others={others}
      />
    </SitePage>
  );
}
