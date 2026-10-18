import ClientPage from "../../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* One post. CLIENT PAGE (@/components/discover/threadspage, ThreadPage): it reads as the signed-in person, to show their like and vote. */
export async function generateMetadata({ params }) {
  const { id } = await params;
  return pageMetadata({ title: "Threads", description: "A post from a club on MyOtherApp.", path: `/threads/${encodeURIComponent(id)}` });
}

export default function Thread() {
  return <ClientPage name="thread" />;
}
