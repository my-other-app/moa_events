import { SITE_URL } from "@/config";
import { ANYWHERE, filtersToSearch, findTopic, readEventFilters } from "@/api/parse";
import { FEED_CACHE, FEED_LIMIT, FEED_TYPE, feedCity, feedTitle, feedWhere, rssFeed } from "@/seo/rss";
import { ApiError } from "@/server/api";
import { getEvents, getNewestEvents } from "@/server/discover";
import { feedItems } from "@/server/feeds";

/*
 * GET /events/rss.xml — upcoming public events, newest-published first, up
 * to 50, as RSS 2.0 (with the RSS event module). Takes the list page's
 * filters, so a feed can be subscribed to for one kind of event:
 *
 *   ?category=3  ?type=online|in_person  ?price=free|paid  ?q=words
 *   ?topic=design  ?interest=12                       (by topic; /topics/{slug}/rss.xml too)
 *   ?when=this_week …  ?from=YYYY-MM-DD&to=…
 *   ?lat=..&lng=..[&radius_km=25] or ?near=lat,lng   (near a place)
 *   ?city=Kochi                                       (matched on the venue)
 *
 * The newest-published first: an API that knows ?sort=newest is asked for
 * them in that order (one read); one that doesn't is asked for the next
 * 120 by date and the feed orders them itself. Each item's words are the
 * card's `summary` where the API sends one, else its page's (read a few at
 * a time, src/server/feeds.js).
 *
 * Kept at the edge for ten minutes.
 */
const PER_REQUEST = 60;
const MAX_CARDS = 120;

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const filters = { ...readEventFilters(params), sort: "" };
  const where = feedWhere(params);
  const city = feedCity(params);
  const query = { ...filters, q: filters.q || city };
  const place = where || ANYWHERE;
  try {
    const newest = await getNewestEvents(query, { where: place, limit: PER_REQUEST, revalidate: 300 });
    const first = newest || (await getEvents(query, { where: place, offset: 0, limit: PER_REQUEST, revalidate: 300 }));
    let cards = first.items;
    if (!newest && first.total > cards.length && cards.length >= PER_REQUEST) {
      const second = await getEvents(query, { where: place, offset: PER_REQUEST, limit: PER_REQUEST, revalidate: 300 }).catch(() => null);
      if (second) cards = cards.concat(second.items);
    }
    cards = cards.filter((e) => e.status !== "ended").slice(0, MAX_CARDS);
    // Both words and a city: the words go to the API, the city is matched on the venue here.
    if (city && filters.q) cards = cards.filter((e) => (e.location_name || "").toLowerCase().includes(city.toLowerCase()));
    const categoryName = filters.category ? first.categories.find((c) => String(c.id) === String(filters.category))?.name || null : null;
    const topicName = filters.topic ? findTopic(first.topics, filters.topic)?.name || null : null;
    const items = await feedItems(cards, { limit: FEED_LIMIT });
    const search = filtersToSearch(filters).toString();
    const title = feedTitle({ filters, city, categoryName, topicName, near: Boolean(where) });
    const xml = rssFeed({
      title,
      description: `${title}: hackathons, workshops, meetups and more, from the clubs that run them.`,
      link: `${SITE_URL}/events${search ? `?${search}` : ""}`,
      self: `${SITE_URL}/events/rss.xml${request.nextUrl.search}`,
      items,
    });
    return new Response(xml, { headers: { "Content-Type": FEED_TYPE, "Cache-Control": FEED_CACHE } });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return new Response("The feed can't be made right now", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "120", "Cache-Control": "no-store" } });
  }
}
