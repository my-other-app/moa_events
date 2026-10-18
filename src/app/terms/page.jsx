import ClientPage from "../_client/pages";
import { LEGAL } from "@/content/legal";
import { pageMetadata } from "@/seo/metadata";

/* Terms. CLIENT PAGE (@/components/discover/legalpage). */
export const metadata = pageMetadata({ title: LEGAL.terms.title, description: LEGAL.terms.description, path: LEGAL.terms.path });

export default function Terms() {
  return <ClientPage name="terms" />;
}
