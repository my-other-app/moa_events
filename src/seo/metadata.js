/**
 * What every page tells search engines and link previews, as Next's
 * Metadata objects: the title (with " · MyOtherApp"), the description, one
 * canonical address on https://myotherapp.in, Open Graph and the Twitter
 * card. Pure; each page's generateMetadata (or `metadata`) calls one of
 * these.
 */
import { SITE_URL } from "@/config";
import { summary, whenLine } from "@/utils/eventpage";
import { formatPrice, imageUrl } from "@/utils/format";
import { absoluteUrl, eventPagePath, feeds, fingerprint, imageKey, ogImage } from "./urls";

export const SITE_NAME = "MyOtherApp";
export const TITLE_TEMPLATE = `%s · ${SITE_NAME}`;
export const HOME_TITLE = `${SITE_NAME} · Events and clubs near you`;
export const DEFAULT_DESCRIPTION = "Find events and clubs near you on MyOtherApp — hackathons, workshops, meetups and more, from the clubs that run them.";
export const OG_IMAGE = { url: `${SITE_URL}/og-default.png`, width: 1200, height: 630, alt: SITE_NAME };

/** The full title as tabs and previews show it. */
export const fullTitle = (title) => `${title} · ${SITE_NAME}`;

/**
 * A page's metadata.
 *   title          the page's own name ("Find events"); the template adds " · MyOtherApp"
 *   absoluteTitle  a title used as it is (the home page's)
 *   path           the canonical path ("/events"); null for a page with none (a ticket)
 *   image          {url, width, height, alt}; the site's picture by default
 *   rss            {url, title}: the feed to advertise in <link rel="alternate">
 *   noindex        for a person's own pages and the steps of a flow
 */
export function pageMetadata({ title, absoluteTitle = null, description = DEFAULT_DESCRIPTION, path = "/", image = OG_IMAGE, type = "website", rss = null, noindex = false, canonical = true }) {
  const url = path ? absoluteUrl(path) : null;
  const shown = absoluteTitle || fullTitle(title);
  const types = rss ? { types: { "application/rss+xml": [{ url: absoluteUrl(rss.url), title: rss.title }] } } : {};
  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    alternates: { ...(canonical && url ? { canonical: url } : {}), ...types },
    openGraph: { type, ...(url ? { url } : {}), title: shown, description, siteName: SITE_NAME, locale: "en_IN", images: [image] },
    twitter: { card: "summary_large_image", title: shown, description, images: [image.url] },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** The feed of every upcoming event, as the home page and /events advertise it. */
export const EVENTS_FEED = { url: feeds.events(), title: "Upcoming events on MyOtherApp" };

/** The ?v= for an event's share picture: it changes when the picture would. */
export function eventOgVersion(page) {
  const e = page.event;
  return fingerprint(e.name, e.starts_at, e.ends_at, e.is_online, e.location_name, e.has_fee, e.fee, e.status === "ended", imageKey(imageUrl(e.poster, "original")), page.club?.name);
}

export function clubOgVersion(data) {
  const c = data.club;
  return fingerprint(c.name, c.tagline, c.location_name, imageKey(imageUrl(c.cover, "original")), imageKey(imageUrl(c.logo, "medium")), c.followers, data.upcoming.length);
}

/** One line for an event without a description: when, where, the price, and who. */
export function eventFactsLine(event, club) {
  const when = whenLine(event.starts_at);
  const where = event.is_online ? "Online" : event.location_name;
  const facts = [when ? `${when} IST` : null, where, formatPrice(event.has_fee, event.fee)].filter(Boolean).join(" · ");
  return `${facts}${club ? `. Hosted by ${club.name} on ${SITE_NAME}.` : `. On ${SITE_NAME}.`}`;
}

/** An event's page: its canonical /events/{slug}, its own share picture. `page` is the raw parsed page. */
export function eventMetadata(page) {
  const { event, club } = page;
  const description = summary(event.about) || summary(eventFactsLine(event, club));
  const when = whenLine(event.starts_at);
  return pageMetadata({
    title: event.name,
    description,
    path: eventPagePath(event),
    image: {
      url: absoluteUrl(ogImage.event(event.slug || event.id, eventOgVersion(page))),
      width: 1200,
      height: 630,
      alt: [event.name, when ? `${when} IST` : null, event.is_online ? "Online" : event.location_name].filter(Boolean).join(" · "),
    },
  });
}

/** A club's page: canonical /clubs/{slug}, its share picture, and its own feed. `data` is the raw parsed page. */
export function clubMetadata(data) {
  const { club } = data;
  const description = summary(club.tagline || club.about || `Events and posts from ${club.name} on ${SITE_NAME}.`);
  return pageMetadata({
    title: club.name,
    description,
    path: `/clubs/${encodeURIComponent(club.slug)}`,
    image: { url: absoluteUrl(ogImage.club(club.slug, clubOgVersion(data))), width: 1200, height: 630, alt: club.name },
    rss: { url: feeds.club(club.slug), title: `Upcoming events from ${club.name}` },
  });
}
