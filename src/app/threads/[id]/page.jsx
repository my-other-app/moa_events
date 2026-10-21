import { notFound } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { ThreadView } from "@/components/discover/threadspage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { isDemoThread, unlessDemo } from "@/seo/demo";
import { threadMetadata } from "@/seo/metadata";
import { stableThread } from "@/seo/stabilize";
import { threadStructuredData } from "@/seo/structured";
import { getComments, getThreadPage } from "@/server/discover";

/*
 * /threads/{id}: one post. SERVER-RENDERED, statically regenerated (ISR,
 * at most once a minute): the post (its words, picture and poll), its
 * counts and its comments are in the HTML, read as nobody, with its
 * DiscussionForumPosting and BreadcrumbList structured data. Liking and
 * voting are islands that read the post again as the signed-in reader.
 * A post that is gone → ./not-found.jsx (a real 404). A made-up demo
 * club's post says noindex, follow (src/seo/demo.js).
 */
export const revalidate = 60;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const thread = await getThreadPage(id);
  if (!thread) return { title: "Post not found", robots: { index: false, follow: true } };
  return unlessDemo(threadMetadata(thread), isDemoThread(thread));
}

export default async function Thread({ params }) {
  const { id } = await params;
  const thread = await getThreadPage(id);
  if (!thread) notFound();
  // The comments are a second read: when only they fail, the post still shows.
  const comments = await getComments(id).catch(() => null);
  return (
    <SitePage>
      <JsonLd data={threadStructuredData(thread, comments || [])} />
      <ThreadView thread={stableThread(thread)} comments={comments} />
    </SitePage>
  );
}
