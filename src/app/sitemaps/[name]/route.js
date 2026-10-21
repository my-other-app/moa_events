import { cityEntries } from "@/seo/citypages";
import { demoSettings, isDemoSitemapRow } from "@/seo/demo";
import { PAGE_SIZE, entriesFor, parseSitemapName, staticEntries, topicEntries, urlsetXml } from "@/seo/sitemap";
import { ApiError } from "@/server/api";
import { getCitySummaries } from "@/server/cities";
import { getDemoEventSlugs } from "@/server/demo";
import { getSitemapPage, getSitemapSource } from "@/server/discover";
import { getTopics } from "@/server/topics";

/*
 * GET /sitemaps/pages.xml | topics.xml | cities.xml | events-{n}.xml | clubs-{n}.xml:
 * one sitemap of the index, at most 5,000 addresses. Pages come from the
 * API's paged sitemap when it has one; from its single list (page 1 only)
 * when not. topics.xml is /topics and each topic's page; 404 while the API
 * has no topics. cities.xml is the city pages with something real in them
 * (src/seo/citypages.js): empty while every city's events are demo ones.
 *
 * The made-up demo clubs and their events are left out (src/seo/demo.js):
 * a club by its slug, an event by its club when the row says it, else by
 * the listed clubs' events (read alongside, cached as long).
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
  if (which.kind === "cities") return answer(urlsetXml(cityEntries(await getCitySummaries({ clubs: true }))), "public, max-age=600, s-maxage=600, stale-while-revalidate=86400");
  try {
    if (which.kind === "topics") {
      const found = await getTopics();
      return found ? answer(urlsetXml(topicEntries(found.topics))) : missing();
    }
    const settings = demoSettings();
    const [source, eventSlugs] = await Promise.all([getSitemapSource(), which.kind === "events" ? getDemoEventSlugs(settings) : new Set()]);
    const skip = (row) => isDemoSitemapRow(which.kind, row, { settings, eventSlugs });
    if (source.paged) {
      const page = await getSitemapPage(which.kind, which.page);
      if (!page) return missing();
      return answer(urlsetXml(entriesFor(which.kind, page.items, { skip }).slice(0, PAGE_SIZE)));
    }
    if (which.page !== 1) return missing();
    return answer(urlsetXml(entriesFor(which.kind, source[which.kind], { skip }).slice(0, PAGE_SIZE)));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return new Response("The sitemap can't be read right now", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "120", "Cache-Control": "no-store" } });
  }
}
