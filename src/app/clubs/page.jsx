import ClientPage from "../_client/pages";
import { pageMetadata } from "@/seo/metadata";

/* Find clubs. CLIENT PAGE (@/components/discover/clubspage). */
export const metadata = pageMetadata({ title: "Clubs", description: "Find clubs near you on MyOtherApp and see what they're running next.", path: "/clubs" });

export default function Clubs() {
  return <ClientPage name="clubs" />;
}
