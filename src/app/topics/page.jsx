import { notFound } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { TopicsView } from "@/components/discover/topicspage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { topicsMetadata } from "@/seo/metadata";
import { topicsStructuredData } from "@/seo/structured";
import { readOr } from "@/server/build";
import { getTopics } from "@/server/topics";

/*
 * /topics: every topic (Development, Deep Tech, Arts, ...) as a card, with
 * its colour, mark, words, interests and how many upcoming events and clubs
 * it has. SERVER-RENDERED, statically regenerated (ISR) at most every five
 * minutes, as often as the topics are read (src/server/topics.js); with
 * CollectionPage and ItemList structured data.
 *
 * An API without topics (none has a slug) has no /topics: the 404 page,
 * until it does.
 */
export const revalidate = 300;

const load = () => readOr(getTopics(), null);

export async function generateMetadata() {
  const found = await load();
  if (!found) return { title: "Page not found", robots: { index: false, follow: true } };
  return topicsMetadata(found.topics);
}

export default async function Topics() {
  const found = await load();
  if (!found) notFound();
  return (
    <SitePage>
      <JsonLd data={topicsStructuredData(found.topics)} />
      <TopicsView topics={found.topics} />
    </SitePage>
  );
}
