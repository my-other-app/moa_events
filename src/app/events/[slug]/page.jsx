import { notFound, permanentRedirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { EventView } from "@/components/discover/eventpage";
import { eventMetadata } from "@/seo/metadata";
import { JsonLd } from "@/seo/JsonLd";
import { stableEventPage } from "@/seo/stabilize";
import { eventStructuredData } from "@/seo/structured";
import { eventPagePath } from "@/seo/urls";
import { getEventPage } from "@/server/discover";

/*
 * /events/{slug}: an event's page. SERVER-RENDERED, statically regenerated
 * (ISR): made on its first visit, served from the cache, made again at most
 * once a minute. The whole event is in the HTML (title, club, when and
 * where, price and seats, the description, speakers, agenda, team, more
 * events), with its Event and BreadcrumbList structured data; only the
 * islands (share, calendar, the live strip, section tabs, "Read more") run
 * in the browser.
 *
 * One address per event: an old slug answers with a 308 here; an id
 * (/events/123) goes to the old-address page by a rewrite (next.config),
 * which keeps the query. Not public → the 404 page. API down → error.jsx.
 */
export const revalidate = 60;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await getEventPage(slug);
  if (!page) return { title: "Event not found", robots: { index: false, follow: true } };
  return eventMetadata(page);
}

export default async function EventRoute({ params }) {
  const { slug } = await params;
  const page = await getEventPage(slug);
  if (!page) notFound();
  if (page.event.slug && page.event.slug !== slug) permanentRedirect(eventPagePath(page.event));
  return (
    <SitePage>
      <JsonLd data={eventStructuredData(page)} />
      <EventView page={stableEventPage(page)} />
    </SitePage>
  );
}
