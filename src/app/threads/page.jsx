import { PAGE_SIZE, parseThreadsPage } from "@/api/parse";
import { SitePage } from "@/components/discover/chrome";
import { ThreadsView } from "@/components/discover/threadspage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { pageMetadata } from "@/seo/metadata";
import { stablePage, stableThread } from "@/seo/stabilize";
import { threadsStructuredData } from "@/seo/structured";
import { readOr } from "@/server/build";
import { getThreads } from "@/server/discover";

/*
 * /threads: the clubs' latest posts. SERVER-RENDERED, statically
 * regenerated (ISR, at most once a minute): the first twelve posts are in
 * the HTML; "Load more" and the line about liking (signed in or not) are
 * islands. Each post links to its own page. A CollectionPage and an
 * ItemList of the posts (the demo clubs' left out) describe it.
 */
export const revalidate = 60;

const TITLE = "Threads from the clubs";
const DESCRIPTION = "The latest posts and polls from clubs on MyOtherApp.";

export const metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: "/threads" });

export default async function Threads() {
  const page = await readOr(getThreads({ limit: PAGE_SIZE }), parseThreadsPage({}));
  return (
    <SitePage>
      <JsonLd data={threadsStructuredData(page.items, { name: TITLE, description: DESCRIPTION })} />
      <ThreadsView page={stablePage(page, stableThread)} />
    </SitePage>
  );
}
