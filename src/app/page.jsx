import ClientPage from "./_client/pages";
import { EVENTS_FEED, HOME_TITLE, pageMetadata } from "@/seo/metadata";
import { siteJsonLd } from "@/seo/jsonld";
import { JsonLd } from "@/seo/JsonLd";

/*
 * Home. CLIENT PAGE: the head (title, canonical, Open Graph, the feed, and
 * the Organization and WebSite structured data with its search box) comes
 * from the server; the page itself still renders in the browser
 * (@/components/discover/homepage). See docs/NEXT_MIGRATION.md.
 */
export const metadata = pageMetadata({ absoluteTitle: HOME_TITLE, path: "/", rss: EVENTS_FEED });

export default function Home() {
  return (
    <>
      <JsonLd data={siteJsonLd()} />
      <ClientPage name="home" />
    </>
  );
}
