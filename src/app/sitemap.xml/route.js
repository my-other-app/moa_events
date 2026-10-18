import { indexEntries, sitemapIndexXml } from "@/seo/sitemap";
import { ApiError } from "@/server/api";
import { getSitemapSource } from "@/server/discover";

/*
 * GET /sitemap.xml: the sitemap index (see src/seo/sitemap.js). Kept at the
 * edge for ten minutes; when the API is down, just the fixed pages, kept
 * for a minute.
 */
export async function GET() {
  let source = null;
  try {
    source = await getSitemapSource();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
  return new Response(sitemapIndexXml(indexEntries(source)), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": source ? "public, max-age=600, s-maxage=600, stale-while-revalidate=86400" : "public, max-age=60, s-maxage=60",
    },
  });
}
