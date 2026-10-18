import { SitePage } from "@/components/discover/chrome";
import { LegalPage } from "@/components/discover/legalpage";
import { LEGAL } from "@/content/legal";
import { pageMetadata } from "@/seo/metadata";

/* Terms. SERVER-RENDERED and static (made at build time): its words are @/content/legal's. */
export const metadata = pageMetadata({ title: LEGAL.terms.title, description: LEGAL.terms.description, path: LEGAL.terms.path });

export default function Terms() {
  return (
    <SitePage>
      <LegalPage doc={LEGAL.terms} />
    </SitePage>
  );
}
