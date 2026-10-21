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
import { absoluteUrl, eventPagePath, feeds, fingerprint, imageKey, media, ogImage, topicPagePath } from "./urls";

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

/** An event's page: its canonical /events/{slug}, its own share picture, and its club's feed. `page` is the raw parsed page. */
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
    rss: club?.slug ? { url: feeds.club(club.slug), title: `Upcoming events from ${club.name}` } : null,
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

/* ---------- topics ---------- */

export const TOPICS_TITLE = "Topics";

/** /topics: every topic, by name in its words. */
export function topicsMetadata(topics) {
  const names = topics.map((t) => t.name);
  const some = names.length > 4 ? `${names.slice(0, 4).join(", ")} and more` : names.join(", ");
  return pageMetadata({
    title: TOPICS_TITLE,
    description: summary(`Browse events and clubs by topic${some ? `: ${some}` : ""}. Hackathons, workshops, meetups and more from the clubs on ${SITE_NAME}.`),
    path: "/topics",
  });
}

/** The ?v= for a topic's share picture: it changes when the picture would. */
export function topicOgVersion(topic) {
  return fingerprint(topic.name, topic.description, topic.color, topic.upcoming_events, topic.clubs, topic.interests.slice(0, 8).map((i) => i.name).join("|"));
}

/** What a topic page is about, in a sentence: its own words, else its interests. */
export function topicDescription(topic, interest = null) {
  if (interest) return summary(`Upcoming ${interest.name} events, and the clubs that run them, in ${topic.name} on ${SITE_NAME}.`);
  if (topic.description) return summary(topic.description);
  const some = topic.interests.slice(0, 4).map((i) => i.name);
  return summary(`Upcoming ${topic.name} events${some.length ? ` (${some.join(", ")} and more)` : ""}, and the clubs that run them, on ${SITE_NAME}.`);
}

/**
 * A topic's page: canonical /topics/{slug} whatever interest is picked
 * (?interest= only filters the same page), its share picture, and its
 * feed (the interest's, when one is picked).
 */
export function topicMetadata(topic, { interest = null } = {}) {
  const title = interest ? `${interest.name} events and clubs` : `${topic.name} events and clubs`;
  return pageMetadata({
    title,
    description: topicDescription(topic, interest),
    path: topicPagePath(topic),
    image: { url: absoluteUrl(ogImage.topic(topic.slug, topicOgVersion(topic))), width: 1200, height: 630, alt: `${topic.name} on ${SITE_NAME}` },
    rss: { url: feeds.topic(topic.slug, interest ? interest.id : null), title: interest ? `${interest.name} events on ${SITE_NAME}` : `${topic.name} events on ${SITE_NAME}` },
  });
}

/** A post's name: its first line (up to 110 characters), else "Poll from …" or "Post from …". */
export function threadHeadline(thread) {
  const first = String(thread.body || "")
    .split(/\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (first) return summary(first, 110);
  return `${thread.poll ? "Poll" : "Post"} from ${thread.club.name}`;
}

/**
 * A post's page: titled as the old page was ("Circuit Society on MyOtherApp:
 * “first words…”"), its picture (else the club's share picture), canonical
 * /threads/{id}. `thread` is the raw parsed post.
 */
export function threadMetadata(thread) {
  const club = thread.club;
  const body = String(thread.body || "").replace(/\s+/g, " ").trim();
  const quote = body ? `: “${body.slice(0, 60).trim()}${body.length > 60 ? "…" : ""}”` : "";
  const description =
    summary(body) ||
    (thread.poll ? summary(`A poll from ${club.name} on ${SITE_NAME}: ${thread.poll.options.map((o) => o.label).join(", ")}.`) : `A post from ${club.name} on ${SITE_NAME}.`);
  const image = thread.image
    ? { url: absoluteUrl(media.threadImage(thread.id, "original")), alt: `Picture posted by ${club.name}` }
    : club.slug
      ? { url: absoluteUrl(ogImage.club(club.slug)), width: 1200, height: 630, alt: club.name }
      : OG_IMAGE;
  return pageMetadata({ absoluteTitle: `${club.name} on ${SITE_NAME}${quote}`, description, path: `/threads/${encodeURIComponent(thread.id)}`, image, type: "article" });
}

/**
 * A find page's head: its title and words, and what search engines do with
 * it (src/seo/listings.js): `indexing` is {index, path}; a page that isn't
 * kept has no canonical (and says noindex, follow).
 */
export function listingMetadata({ title, description, indexing, rss = null }) {
  return pageMetadata({ title, description, path: indexing.path, canonical: Boolean(indexing.path), noindex: !indexing.index, rss });
}
