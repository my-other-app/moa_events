import { SitePage } from "@/components/discover/chrome";
import { TopicMissing } from "@/components/discover/topicspage";

/* A topic address no topic answers to (or every one, while the API has no topics): a 404, in the site's own frame. */
export const metadata = { title: "Topic not found", robots: { index: false, follow: true } };

export default function TopicNotFound() {
  return (
    <SitePage>
      <TopicMissing />
    </SitePage>
  );
}
