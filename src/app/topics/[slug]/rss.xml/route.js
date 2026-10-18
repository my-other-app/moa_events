import { ANYWHERE } from "@/api/parse";
import { FEED_CACHE, FEED_LIMIT, FEED_TYPE, rssFeed } from "@/seo/rss";
import { absoluteUrl, feeds, topicPagePath } from "@/seo/urls";
import { SITE_NAME } from "@/config";
import { ApiError } from "@/server/api";
import { getEvents, getNewestEvents } from "@/server/discover";
import { feedItems } from "@/server/feeds";
import { getTopic, topicInterest } from "@/server/topics";

/*
 * GET /topics/{slug}/rss.xml — a topic's upcoming events, newest-published
 * first, up to 50, in the same format as /events/rss.xml (RSS 2.0 with the
 * RSS event module). ?interest={id} narrows it to one of the topic's
 * interests. 404 for an unknown topic (and while the API has no topics).
 * Kept at the edge for ten minutes.
 */
const PER_REQUEST = 60;

const text = (body, status, cache) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cache } });

export async function GET(request, { params }) {
  const { slug } = await params;
  try {
    const found = await getTopic(slug);
    if (!found) return text("No such topic", 404, "public, max-age=60, s-maxage=60");
    const { topic } = found;
    const interest = topicInterest(topic, request.nextUrl.searchParams.get("interest"));
    const filters = { topic: topic.slug, interest: interest ? String(interest.id) : "" };
    const newest = await getNewestEvents(filters, { where: ANYWHERE, limit: PER_REQUEST, revalidate: 300 });
    const list = newest || (await getEvents(filters, { where: ANYWHERE, offset: 0, limit: PER_REQUEST, revalidate: 300 }));
    const cards = list.items.filter((e) => e.status !== "ended");
    const items = await feedItems(cards, { limit: FEED_LIMIT });
    const what = interest ? interest.name : topic.name;
    const title = `Upcoming ${what} events on ${SITE_NAME}`;
    const xml = rssFeed({
      title,
      description: topic.description && !interest ? topic.description : `${title}: hackathons, workshops, meetups and more, from the clubs that run them.`,
      link: absoluteUrl(topicPagePath(topic, interest ? interest.id : null)),
      self: absoluteUrl(feeds.topic(topic.slug, interest ? interest.id : null)),
      items,
    });
    return new Response(xml, { headers: { "Content-Type": FEED_TYPE, "Cache-Control": FEED_CACHE } });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return new Response("The feed can't be made right now", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "120", "Cache-Control": "no-store" } });
  }
}
