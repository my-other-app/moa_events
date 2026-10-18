import ClientPage from "../../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* The clubs a signed-in person follows. CLIENT PAGE (@/components/me/mepages). Never indexed. */
export const metadata = pageMetadata({ title: "Following", description: "The clubs you follow on MyOtherApp.", path: "/me/following", noindex: true, canonical: false });

export default function Following() {
  return <ClientPage name="me-following" />;
}
