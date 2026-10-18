/**
 * The structured data for the server-rendered pages, put together from the
 * API's data and the site's stable addresses: what search engines read off
 * an event's page and a club's page. Pure (tested in structured.test.js).
 */
import { SITE_URL } from "@/config";
import { eventUrl, summary } from "@/utils/eventpage";
import { breadcrumbJsonLd, clubJsonLd, collectionPageJsonLd, discussionPostingJsonLd, eventJsonLd, itemListJsonLd } from "./jsonld";
import { TOPICS_TITLE, clubOgVersion, eventFactsLine, eventOgVersion, threadHeadline, topicDescription, topicOgVersion, topicsMetadata } from "./metadata";
import { absoluteUrl, clubPagePath, eventPagePath, eventRefOf, media, ogImage, topicPagePath } from "./urls";

/** The event's pictures: the poster (or its drawn cover), then its share picture. */
export function eventImages(page) {
  const ref = eventRefOf(page.event);
  return [absoluteUrl(page.event.poster ? media.eventPoster(ref) : media.eventCover(ref)), absoluteUrl(ogImage.event(ref, eventOgVersion(page)))];
}

/**
 * [Event, BreadcrumbList] for an event's page. `page` is the raw parsed page
 * (before stabilising). An event with topics is about them (each its
 * page), and its trail goes through its first: Home › Topic › Event;
 * without, Home › Events › Event.
 */
export function eventStructuredData(page) {
  const { event, club, speakers } = page;
  const ref = eventRefOf(event);
  const url = eventUrl(event);
  const topics = (event.topics || []).map((t) => ({ name: t.name, url: absoluteUrl(topicPagePath(t)) }));
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
    topics,
  });
  const crumbs = breadcrumbJsonLd([["Home", `${SITE_URL}/`], topics.length ? [topics[0].name, topics[0].url] : ["Events", `${SITE_URL}/events`], [event.name, url]]);
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

/** An ItemList of the events a find page shows, in its order. `path` is the page's own address ("/events?type=online"). */
export function eventsListStructuredData(items, { name, path }) {
  return itemListJsonLd({ name, url: absoluteUrl(path), items: items.map((e) => ({ url: absoluteUrl(eventPagePath(e)), name: e.name })) });
}

/** An ItemList of the clubs a find page shows (those with an address of their own). */
export function clubsListStructuredData(items, { name, path }) {
  return itemListJsonLd({ name, url: absoluteUrl(path), items: items.filter((c) => c.slug).map((c) => ({ url: absoluteUrl(clubPagePath(c)), name: c.name })) });
}

/* ---------- topics ---------- */

/** /topics: [CollectionPage, ItemList of the topics' pages]. */
export function topicsStructuredData(topics) {
  const url = absoluteUrl("/topics");
  const list = `${url}#topics`;
  return [
    collectionPageJsonLd({ name: TOPICS_TITLE, description: topicsMetadata(topics).description, url, list }),
    itemListJsonLd({ id: list, name: TOPICS_TITLE, url, items: topics.map((t) => ({ url: absoluteUrl(topicPagePath(t)), name: t.name })) }),
  ];
}

/**
 * A topic's page: [CollectionPage (about the topic), ItemList of the events
 * it shows, BreadcrumbList Home › Topics › Topic]. Its address is always the
 * topic's own (canonical), whatever interest is picked.
 */
export function topicStructuredData(topic, events = [], { interest = null } = {}) {
  const url = absoluteUrl(topicPagePath(topic));
  const list = `${url}#events`;
  const name = interest ? `${interest.name} events` : `${topic.name} events`;
  return [
    collectionPageJsonLd({
      name: `${topic.name} events and clubs`,
      description: topicDescription(topic),
      url,
      image: absoluteUrl(ogImage.topic(topic.slug, topicOgVersion(topic))),
      about: { name: topic.name, url },
      list: events.length ? list : null,
    }),
    ...(events.length ? [itemListJsonLd({ id: list, name, url, items: events.map((e) => ({ url: absoluteUrl(eventPagePath(e)), name: e.name })) })] : []),
    breadcrumbJsonLd([
      ["Home", `${SITE_URL}/`],
      [TOPICS_TITLE, absoluteUrl("/topics")],
      [topic.name, url],
    ]),
  ];
}

/** What a post says, for a machine: its words, or its poll's question and options when it has no words. */
export function threadText(thread) {
  if (thread.body && thread.body.trim()) return thread.body.trim();
  if (thread.poll) return `Poll: ${thread.poll.options.map((o) => o.label).join(" / ")}`;
  return null;
}

/**
 * [DiscussionForumPosting, BreadcrumbList] for a post's page. `thread` is
 * parseThread's result (before stabilising), `comments` parseComment's.
 */
export function threadStructuredData(thread, comments = []) {
  const url = absoluteUrl(`/threads/${encodeURIComponent(thread.id)}`);
  const club = thread.club;
  const ld = discussionPostingJsonLd({
    url,
    headline: threadHeadline(thread),
    text: threadText(thread),
    image: thread.image ? absoluteUrl(media.threadImage(thread.id, "original")) : null,
    author: { name: club.name, url: club.slug ? absoluteUrl(clubPagePath(club)) : null },
    datePublished: thread.created_at,
    likes: thread.likes,
    commentCount: Math.max(thread.comments, comments.length),
    comments: comments
      .filter((c) => c.body && c.body.trim())
      .map((c) => ({ text: c.body.trim(), author: c.author, datePublished: c.created_at })),
    isPartOf: `${SITE_URL}/threads`,
  });
  const crumbs = breadcrumbJsonLd([
    ["Home", `${SITE_URL}/`],
    ["Threads", `${SITE_URL}/threads`],
    [threadHeadline(thread), url],
  ]);
  return [ld, crumbs];
}
