import "server-only";
import { cache } from "react";
import { ANYWHERE, PAGE_SIZE, findTopic, parseTopic, parseTopics, topicParam } from "@/api/parse";
import { stableCard, stableClubCard, stablePage } from "@/seo/stabilize";
import { ApiError, apiGet } from "./api";
import { TAGS, getClubs, getEvents } from "./discover";
import { placeless } from "./listings";

/**
 * Topics (the main categories: Development, Deep Tech, Arts, ...) and their
 * interests, read on the server for /topics, a topic's page, its feed, the
 * sitemap, the find pages' topic filter and the footer's link.
 *
 *   GET /interests/topics          every topic, with live counts
 *   GET /interests/topics/{slug}   one topic (404 TOPIC_NOT_FOUND)
 *   GET /interests/list            the tree without counts (the shape the app reads)
 *
 * An API without /interests/topics (it says 404, or 405: today's has
 * other routes under /interests/{id}) is read from /interests/list
 * instead, without counts; topics without a slug have no
 * page and are left out. So an API from before topics (one category,
 * "arts", no slugs) has none: getTopics() is null, and the site shows no
 * topic anywhere.
 *
 * The tree changes rarely: read at most every five minutes (as the API's
 * own Cache-Control says), tagged `topics` for /api/revalidate.
 */
export const TOPICS_REVALIDATE = 300;

/** Clubs shown on a topic's page (the rest are on /clubs?topic=). */
export const TOPIC_CLUBS = 8;

const LIVE = "/api/v1/interests/topics";

/*
 * Next's data cache keeps only 200s, so an API without /interests/topics
 * would be asked again on every render (the root layout asks, for the
 * footer). Its absence is remembered here, per server instance, for as
 * long as the answer would have been cached.
 */
const ABSENT_FOR_MS = TOPICS_REVALIDATE * 1000;
let liveAbsentUntil = 0;

/** For tests: forget that the API had no /interests/topics. */
export const forgetTopicsAbsence = () => {
  liveAbsentUntil = 0;
};

const liveAbsent = () => liveAbsentUntil > Date.now();

/** A read of an endpoint the API may not have yet: {data: null} for 404, 405 or 422 (a path another route claims). */
async function readOptional(path, options) {
  try {
    return await apiGet(path, options);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 405 || e.status === 422)) return { status: e.status, data: null };
    throw e;
  }
}

async function readTopics({ timeoutMs = 8000 } = {}) {
  const options = { revalidate: TOPICS_REVALIDATE, tags: [TAGS.topics], timeoutMs };
  if (!liveAbsent()) {
    const live = await readOptional(LIVE, options);
    if (live.data !== null) {
      const topics = parseTopics(live.data);
      return topics.length ? { topics, counted: true } : null;
    }
    liveAbsentUntil = Date.now() + ABSENT_FOR_MS;
  }
  const { data } = await apiGet("/api/v1/interests/list", options);
  const topics = parseTopics(data);
  return topics.length ? { topics, counted: false } : null;
}

/**
 * {topics, counted}: every topic with a page, in the API's order, and
 * whether they carry counts (upcoming events, clubs); null when there are
 * none. Throws ApiError when the API fails.
 */
export const getTopics = cache(() => readTopics());

/** The same, or null when the API fails: for pages that show topics only as an extra (the find pages' filter). */
export const getTopicsOrNull = cache(() => readTopics().catch(() => null));

/**
 * Whether there is a /topics to link to, for the footer on every page. Never
 * throws and never waits long: a slow or failing API just leaves the link
 * out until the next look.
 */
export const hasTopics = cache(() => readTopics({ timeoutMs: 2500 }).then(Boolean, () => false));

/**
 * One topic by slug (or id): {topic, counted}; null when there is no such
 * topic. An API without GET /interests/topics/{slug} is answered from the
 * list, so a topic /topics shows always has its page.
 */
export const getTopic = cache(async (ref) => {
  const key = topicParam(ref);
  if (!key) return null;
  const { data } = liveAbsent() ? { data: null } : await readOptional(`${LIVE}/${encodeURIComponent(key)}`, { revalidate: TOPICS_REVALIDATE, tags: [TAGS.topics] });
  const one = data ? parseTopic(data) : null;
  if (one) return { topic: one, counted: true };
  const all = await getTopics();
  const found = all ? findTopic(all.topics, key) : null;
  return found ? { topic: found, counted: all.counted } : null;
});

/** The interest `id` names among a topic's own; null for none (or one from another topic). */
export const topicInterest = (topic, id) => (id ? topic.interests.find((i) => String(i.id) === String(id)) || null : null);

/**
 * A topic's page: the topic, the interest picked (?interest=, only one of
 * its own), the first page of its upcoming events and its first clubs,
 * everywhere and read for nobody (the same for every visitor), images on
 * stable addresses. Null for an unknown topic. A failing events read
 * throws (the error page); failing clubs just leave their section out.
 */
export const getTopicPage = cache(async (ref, interestId = "") => {
  const found = await getTopic(ref);
  if (!found) return null;
  const { topic } = found;
  const interest = topicInterest(topic, interestId);
  const filters = { topic: topic.slug, interest: interest ? String(interest.id) : "" };
  const [events, clubs] = await Promise.all([
    getEvents(filters, { where: ANYWHERE, limit: PAGE_SIZE }),
    getClubs(filters, { where: ANYWHERE, limit: TOPIC_CLUBS }).catch(() => null),
  ]);
  return {
    ...found,
    interest,
    filters,
    events: stablePage(placeless(events), stableCard),
    clubs: clubs ? stablePage(placeless(clubs), stableClubCard) : null,
  };
});
