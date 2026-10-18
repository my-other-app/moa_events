import ClientPage from "../_client/pages";
import { FOR_CLUBS } from "@/content/forclubs";
import { pageMetadata } from "@/seo/metadata";

/* For clubs. CLIENT PAGE (@/components/discover/forclubspage); the plans come from the API in the browser. */
export const metadata = pageMetadata({ absoluteTitle: FOR_CLUBS.title, description: FOR_CLUBS.description, path: FOR_CLUBS.path });

export default function ForClubs() {
  return <ClientPage name="for-clubs" />;
}
