import { indexEntries, sitemapIndexXml } from "@/seo/sitemap";
import { ApiError } from "@/server/api";
import { getSitemapSource } from "@/server/discover";
import { getTopicsOrNull } from "@/server/topics";

/*
 * GET /sitemap.xml: the sitemap index (see src/seo/sitemap.js). Kept at the
 * edge for ten minutes; when the API is down, just the fixed pages, kept
 * for a minute. The topics' sitemap is listed only when the API has topics.
 */
export async function GET() {
  let source = null;
  const [read, topics] = await Promise.all([getSitemapSource().catch((e) => e), getTopicsOrNull()]);
  if (read instanceof Error) {
    if (!(read instanceof ApiError)) throw read;
  } else source = read;
  return new Response(sitemapIndexXml(indexEntries(source, { topics: Boolean(topics) })), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": source ? "public, max-age=600, s-maxage=600, stale-while-revalidate=86400" : "public, max-age=60, s-maxage=60",
    },
  });
}
