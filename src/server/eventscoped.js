import "server-only";
import { notFound, permanentRedirect } from "next/navigation";
import { summary } from "@/utils/eventpage";
import { queryOf } from "@/seo/legacy";
import { absoluteUrl, eventPagePath, ogImage } from "@/seo/urls";
import { eventOgVersion, pageMetadata } from "@/seo/metadata";
import { stableEventPage } from "@/seo/stabilize";
import { getEventPage } from "@/server/discover";

/**
 * The server half of the event's own pages (/events/{slug}/register, /live,
 * /compete): it finds the event (a real 404 when it isn't public), moves an
 * old slug or an id to the current slug (308, query kept), and hands the
 * page's client component the event it found, so the browser needn't ask.
 * They render per request (the query matters: ?step=, ?ref=), and their
 * head points search engines at the event's own page; they are never indexed.
 */
export async function eventFor({ params, searchParams, sub }) {
  const { slug } = await params;
  const page = await getEventPage(slug);
  if (!page) notFound();
  if (page.event.slug && page.event.slug !== slug) permanentRedirect(`${eventPagePath(page.event, sub)}${queryOf(await searchParams)}`);
  return stableEventPage(page);
}

/**
 * The event as the registration page draws it (the summary beside the form,
 * "You're in", Add to calendar): what those read and no more, so the page
 * doesn't carry the event's whole description, guidelines and contacts
 * twice (in its HTML and in React's data).
 */
export function registerEvent(e) {
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    about: summary(e.about, 600) || null,
    poster: e.poster,
    poster_thumb: e.poster_thumb,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    duration_hours: e.duration_hours,
    is_online: e.is_online,
    location_name: e.location_name,
    has_fee: e.has_fee,
    fee: e.fee,
    capacity: e.capacity,
    going: e.going,
    seats_left: e.seats_left,
    reg_opens_at: e.reg_opens_at,
    reg_closes_at: e.reg_closes_at,
    status: e.status,
    registration_open: e.registration_open,
    category: e.category,
    url: e.url,
    // Why a cancelled event was called off, for the page that says so.
    ...(e.cancellation ? { cancellation: e.cancellation } : {}),
    // The club confirms each place: the form sends a request (until its own read of the event says otherwise).
    ...(e.requires_approval ? { requires_approval: true } : {}),
  };
}

/** The club as those parts name it. */
export const registerClub = (club) =>
  club ? { name: club.name, slug: club.slug || null, ...(club.whatsapp_updates === true ? { whatsapp_updates: true } : {}) } : null;

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
