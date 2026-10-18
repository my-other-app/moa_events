import { PAGE_SIZE, parseThreadsPage } from "@/api/parse";
import { SitePage } from "@/components/discover/chrome";
import { ThreadsView } from "@/components/discover/threadspage";
import { pageMetadata } from "@/seo/metadata";
import { stablePage, stableThread } from "@/seo/stabilize";
import { readOr } from "@/server/build";
import { getThreads } from "@/server/discover";

/*
 * /threads: the clubs' latest posts. SERVER-RENDERED, statically
 * regenerated (ISR, at most once a minute): the first twelve posts are in
 * the HTML; "Load more" and the line about liking (signed in or not) are
 * islands. Each post links to its own page.
 */
export const revalidate = 60;

export const metadata = pageMetadata({
  title: "Threads from the clubs",
  description: "The latest posts and polls from clubs on MyOtherApp.",
  path: "/threads",
});

export default async function Threads() {
  const page = await readOr(getThreads({ limit: PAGE_SIZE }), parseThreadsPage({}));
  return (
    <SitePage>
      <ThreadsView page={stablePage(page, stableThread)} />
    </SitePage>
  );
}
