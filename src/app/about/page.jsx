import ClientPage from "../_client/pages";
import { ABOUT } from "@/content/about";
import { pageMetadata } from "@/seo/metadata";

/* About. CLIENT PAGE (@/components/discover/aboutpage); its words are in @/content/about. */
export const metadata = pageMetadata({ absoluteTitle: ABOUT.title, description: ABOUT.description, path: ABOUT.path });

export default function About() {
  return <ClientPage name="about" />;
}
