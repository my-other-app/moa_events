import { absoluteUrl, clubPagePath, feeds } from "@/seo/urls";
import { FEED_CACHE, FEED_LIMIT, FEED_TYPE, rssFeed } from "@/seo/rss";
import { ApiError } from "@/server/api";
import { getClubEvents, getClubPage } from "@/server/discover";
import { feedItems } from "@/server/feeds";

/*
 * GET /clubs/{slug}/rss.xml — one club's upcoming events, newest-published
 * first, in the same format as /events/rss.xml. 404 for an unknown club.
 */
export async function GET(request, { params }) {
  const { slug } = await params;
  try {
    const data = await getClubPage(slug);
    if (!data) return new Response("No such club", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=60" } });
    const { club } = data;
    const list = await getClubEvents(club.slug || slug, { when: "upcoming", limit: 48, revalidate: 300 }).catch(() => null);
    const seen = new Set();
    const cards = [...(list?.items || []), ...data.upcoming]
      .filter((e) => (seen.has(String(e.id)) ? false : seen.add(String(e.id))))
      .filter((e) => e.status !== "ended")
      // A club's own list leaves the club out of each card; the feed names it.
      .map((e) => (e.club ? e : { ...e, club: { id: club.id, name: club.name, slug: club.slug, logo: null } }));
    const items = await feedItems(cards, { limit: FEED_LIMIT });
    const title = `Upcoming events from ${club.name} on MyOtherApp`;
    const xml = rssFeed({
      title,
      description: club.tagline || `What ${club.name} is running next, on MyOtherApp.`,
      link: absoluteUrl(clubPagePath(club)),
      self: absoluteUrl(feeds.club(club.slug || slug)),
      items,
    });
    return new Response(xml, { headers: { "Content-Type": FEED_TYPE, "Cache-Control": FEED_CACHE } });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return new Response("The feed can't be made right now", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "120", "Cache-Control": "no-store" } });
  }
}
