import { SitePage } from "@/components/discover/chrome";
import { ThreadMissing } from "@/components/discover/threadspage";

/* A post that is gone (or never was): a 404, in the site's own frame. */
export const metadata = { title: "Post not found", robots: { index: false, follow: true } };

export default function ThreadNotFound() {
  return (
    <SitePage>
      <ThreadMissing />
    </SitePage>
  );
}
