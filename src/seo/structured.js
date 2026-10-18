/**
 * The structured data for the server-rendered pages, put together from the
 * API's data and the site's stable addresses: what search engines read off
 * an event's page and a club's page. Pure (tested in structured.test.js).
 */
import { SITE_URL } from "@/config";
import { eventUrl, summary } from "@/utils/eventpage";
import { breadcrumbJsonLd, clubJsonLd, eventJsonLd } from "./jsonld";
import { clubOgVersion, eventFactsLine, eventOgVersion } from "./metadata";
import { absoluteUrl, clubPagePath, eventPagePath, eventRefOf, media, ogImage } from "./urls";

/** The event's pictures: the poster (or its drawn cover), then its share picture. */
export function eventImages(page) {
  const ref = eventRefOf(page.event);
  return [absoluteUrl(page.event.poster ? media.eventPoster(ref) : media.eventCover(ref)), absoluteUrl(ogImage.event(ref, eventOgVersion(page)))];
}

/** [Event, BreadcrumbList] for an event's page. `page` is the raw parsed page (before stabilising). */
export function eventStructuredData(page) {
  const { event, club, speakers } = page;
  const ref = eventRefOf(event);
  const url = eventUrl(event);
  const ld = eventJsonLd({
    event,
    club,
    speakers,
    url,
    images: eventImages(page),
    clubUrl: club?.slug ? absoluteUrl(clubPagePath(club)) : null,
    clubLogo: club?.logo && club.slug ? absoluteUrl(media.clubLogo(club.slug, "medium")) : null,
    description: summary(event.about, 500) || eventFactsLine(event, club),
    speakerImage: (s, i) => (s.photo ? absoluteUrl(media.eventSpeaker(ref, s.id ?? `i${i}`)) : null),
  });
  const crumbs = breadcrumbJsonLd([
    ["Home", `${SITE_URL}/`],
    ["Events", `${SITE_URL}/events`],
    [event.name, url],
  ]);
  return [ld, crumbs];
}

/** [Organization (with its upcoming events), BreadcrumbList] for a club's page. `data` is the raw parsed page. */
export function clubStructuredData(data) {
  const { club } = data;
  const slug = club.slug;
  const url = absoluteUrl(clubPagePath(club));
  const ld = clubJsonLd({
    club,
    url,
    logo: club.logo ? absoluteUrl(media.clubLogo(slug, "medium")) : null,
    image: club.cover ? absoluteUrl(media.clubCover(slug)) : absoluteUrl(ogImage.club(slug, clubOgVersion(data))),
    description: summary(club.about || club.tagline || "", 500) || null,
    events: data.upcoming.map((card) => {
      const ref = eventRefOf(card);
      return { card, url: absoluteUrl(eventPagePath(card)), image: absoluteUrl(card.poster ? media.eventPoster(ref, "medium") : media.eventCover(ref)) };
    }),
  });
  const crumbs = breadcrumbJsonLd([
    ["Home", `${SITE_URL}/`],
    ["Clubs", `${SITE_URL}/clubs`],
    [club.name, url],
  ]);
  return [ld, crumbs];
}
