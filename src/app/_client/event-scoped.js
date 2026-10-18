import "server-only";
import { notFound, permanentRedirect } from "next/navigation";
import { summary } from "@/utils/eventpage";
import { queryOf } from "@/seo/legacy";
import { absoluteUrl, eventPagePath, ogImage } from "@/seo/urls";
import { eventOgVersion, pageMetadata } from "@/seo/metadata";
import { stableEventPage } from "@/seo/stabilize";
import { getEventPage } from "@/server/discover";

/**
 * The event's own client pages (/events/{slug}/register, /live, /compete):
 * the server finds the event (a real 404 when it isn't public), moves an old
 * slug to the current one (308, query kept), and hands the client page the
 * event it found, so it needn't ask again.
 */
export async function eventFor({ params, searchParams, sub }) {
  const { slug } = await params;
  const page = await getEventPage(slug);
  if (!page) notFound();
  if (page.event.slug && page.event.slug !== slug) permanentRedirect(`${eventPagePath(page.event, sub)}${queryOf(await searchParams)}`);
  return stableEventPage(page);
}

const WORDS = { register: "Register", live: "Live", compete: "Competition" };

/** Their head: the event's own picture and description, pointing search engines at the event's page; never indexed themselves. */
export async function eventSubMetadata({ params, sub }) {
  const { slug } = await params;
  const page = await getEventPage(slug);
  if (!page) return { title: "Event not found", robots: { index: false, follow: true } };
  const meta = pageMetadata({
    title: `${WORDS[sub]} · ${page.event.name}`,
    description: summary(page.event.about) || `${page.event.name} on MyOtherApp.`,
    path: eventPagePath(page.event),
    image: { url: absoluteUrl(ogImage.event(page.event.slug || page.event.id, eventOgVersion(page))), width: 1200, height: 630, alt: page.event.name },
    noindex: true,
  });
  return meta;
}
