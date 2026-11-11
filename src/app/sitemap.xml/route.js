import { indexableCities } from "@/seo/citypages";
import { indexEntries, sitemapIndexXml } from "@/seo/sitemap";
import { ApiError } from "@/server/api";
import { getCitySummaries } from "@/server/cities";
import { getSitemapSource } from "@/server/discover";
import { getSpeakerSitemap } from "@/server/speakers";
import { getTopicsOrNull } from "@/server/topics";

/*
 * GET /sitemap.xml: the sitemap index (see src/seo/sitemap.js). Kept at the
 * edge for ten minutes; when the API is down, just the fixed pages, kept
 * for a minute. The topics' sitemap is listed only when the API has topics,
 * the cities' only when a city page is worth indexing (src/seo/citypages.js),
 * the speakers' only when the API lists some (GET /speakers/sitemap; an API
 * without speakers answers 404, and it is left out).
 */
export async function GET() {
  let source = null;
  const [read, topics, cities, speakers] = await Promise.all([
    getSitemapSource().catch((e) => e),
    getTopicsOrNull(),
    getCitySummaries().catch(() => []),
    getSpeakerSitemap().catch(() => null),
  ]);
  if (read instanceof Error) {
    if (!(read instanceof ApiError)) throw read;
  } else source = read;
  return new Response(sitemapIndexXml(indexEntries(source, { topics: Boolean(topics), cities: indexableCities(cities).length > 0, speakers: Boolean(speakers?.length) })), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": source ? "public, max-age=600, s-maxage=600, stale-while-revalidate=86400" : "public, max-age=60, s-maxage=60",
    },
  });
}
