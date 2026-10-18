import ClientPage from "../_client/pages";
import { LEGAL } from "@/content/legal";
import { pageMetadata } from "@/seo/metadata";

/* Privacy. CLIENT PAGE (@/components/discover/legalpage); its words are in @/content/legal. */
export const metadata = pageMetadata({ title: LEGAL.privacy.title, description: LEGAL.privacy.description, path: LEGAL.privacy.path });

export default function Privacy() {
  return <ClientPage name="privacy" />;
}
