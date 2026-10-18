import ClientPage from "../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* The clubs' posts. CLIENT PAGE (@/components/discover/threadspage). */
export const metadata = pageMetadata({ title: "Threads", description: "What the clubs on MyOtherApp are posting.", path: "/threads" });

export default function Threads() {
  return <ClientPage name="threads" />;
}
