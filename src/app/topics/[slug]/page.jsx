import { notFound, permanentRedirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { TopicView } from "@/components/discover/topicspage";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { paramsOf } from "@/seo/listings";
import { topicMetadata } from "@/seo/metadata";
import { topicStructuredData } from "@/seo/structured";
import { topicPagePath } from "@/seo/urls";
import { getTopic, getTopicPage, getTopicsOrNull, topicInterest } from "@/server/topics";

/*
 * /topics/{slug}: a topic's page. SERVER-RENDERED per request (?interest=
 * is part of its content), kept at the edge a minute like the find pages
 * (next.config.mjs); every read is made for nobody and cached. In the
 * HTML: the topic, its interests as chips (real links to ?interest={id}),
 * its first twelve upcoming events ("Load more" adds the rest, as on
 * /events), its first clubs and the other topics; CollectionPage, ItemList
 * and BreadcrumbList (Home › Topics › Topic) structured data; its feed
 * advertised. Every ?interest= view has the topic's own page as its
 * canonical.
 *
 * Unknown topic, or an API without topics → ./not-found.jsx (404). The
 * topic's id or another spelling of its slug → 308 to its slug.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function read({ params, searchParams }) {
  const { slug } = await params;
  const interest = paramsOf(await searchParams).get("interest") || "";
  return { slug, interest: ID.test(interest) ? interest : "" };
}

export async function generateMetadata(props) {
  const { slug, interest } = await read(props);
  const found = await getTopic(slug);
  if (!found) return { title: "Topic not found", robots: { index: false, follow: true } };
  return topicMetadata(found.topic, { interest: topicInterest(found.topic, interest) });
}

export default async function TopicRoute(props) {
  const { slug, interest } = await read(props);
  const [data, all] = await Promise.all([getTopicPage(slug, interest), getTopicsOrNull()]);
  if (!data) notFound();
  if (data.topic.slug !== slug) permanentRedirect(topicPagePath(data.topic, data.interest ? data.interest.id : null));
  const others = all ? all.topics.filter((t) => t.slug !== data.topic.slug) : [];
  return (
    <SitePage>
      <JsonLd data={topicStructuredData(data.topic, data.events.items, { interest: data.interest })} />
      <TopicView data={data} others={others} />
    </SitePage>
  );
}
