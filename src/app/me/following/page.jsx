import { FollowingPage } from "@/components/me/mepages";
import { pageMetadata } from "@/seo/metadata";

/* The clubs a signed-in person follows: as /me/tickets. Never indexed. */
export const metadata = pageMetadata({ title: "Following", description: "The clubs you follow on MyOtherApp.", path: "/me/following", noindex: true, canonical: false });

export default function Following() {
  return <FollowingPage />;
}
