import { PAGE_SIZE, entriesFor, parseSitemapName, staticEntries, urlsetXml } from "@/seo/sitemap";
import { ApiError } from "@/server/api";
import { getSitemapPage, getSitemapSource } from "@/server/discover";

/*
 * GET /sitemaps/pages.xml | events-{n}.xml | clubs-{n}.xml: one sitemap of
 * the index, at most 5,000 addresses. Pages come from the API's paged
 * sitemap when it has one; from its single list (page 1 only) when not.
 */
const XML = { "Content-Type": "application/xml; charset=utf-8" };
const KEEP = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

const answer = (body, cache = KEEP) => new Response(body, { headers: { ...XML, "Cache-Control": cache } });
const missing = () => new Response("No such sitemap", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" } });

export async function GET(request, { params }) {
  const { name } = await params;
  const which = parseSitemapName(name);
  if (!which) return missing();
  if (which.kind === "pages") return answer(urlsetXml(staticEntries()));
  try {
    const source = await getSitemapSource();
    if (source.paged) {
      const page = await getSitemapPage(which.kind, which.page);
      if (!page) return missing();
      return answer(urlsetXml(entriesFor(which.kind, page.items).slice(0, PAGE_SIZE)));
    }
    if (which.page !== 1) return missing();
    return answer(urlsetXml(entriesFor(which.kind, source[which.kind]).slice(0, PAGE_SIZE)));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return new Response("The sitemap can't be read right now", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "120", "Cache-Control": "no-store" } });
  }
}
