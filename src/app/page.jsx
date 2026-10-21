import { SitePage } from "@/components/discover/chrome";
import { HomeView } from "@/components/discover/homepage";
import { parseHome } from "@/api/parse";
import { EVENTS_FEED, HOME_TITLE, pageMetadata } from "@/seo/metadata";
import { siteJsonLd } from "@/seo/jsonld";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { stableHome } from "@/seo/stabilize";
import { readOr } from "@/server/build";
import { getHome } from "@/server/discover";
import { preconnectMedia } from "@/server/hints";
import { everyoneHome } from "@/utils/home";

/*
 * Home. SERVER-RENDERED, statically regenerated (ISR, at most once a
 * minute) and the same for everyone: the hero (categories, numbers, a fan
 * of what's coming up), this week, the clubs, online, popular and the
 * clubs' posts are in the HTML, with the Organization and WebSite (search
 * box) structured data and the feed.
 *
 * "Near you" is not: it is filled in the browser by the NearYou island,
 * which asks /api/near (src/app/api/near/route.js). That reads Vercel's
 * guess of where the visitor is (x-vercel-ip-latitude/-longitude/-city) on
 * the server, or the point they shared, and is cached at the edge per
 * place. The page itself stays one static file at the edge: no function
 * runs for it, whoever asks, wherever they are.
 */
export const revalidate = 60;

export const metadata = pageMetadata({ absoluteTitle: HOME_TITLE, path: "/", rss: EVENTS_FEED });

export default async function Home() {
  const data = await readOr(getHome(), everyoneHome(parseHome({})));
  preconnectMedia(...[...data.this_week, ...data.popular, ...data.online].map((e) => e.poster), ...data.clubs.map((c) => c.logo));
  return (
    <SitePage>
      <JsonLd data={siteJsonLd()} />
      <HomeView data={stableHome(data)} />
    </SitePage>
  );
}
