import { SitePage } from "@/components/discover/chrome";
import { LegalPage } from "@/components/discover/legalpage";
import { LEGAL } from "@/content/legal";
import { pageMetadata } from "@/seo/metadata";

/* Privacy. SERVER-RENDERED and static (made at build time): its words are @/content/legal's. /privacy#delete-account is the account-deletion page Google Play links to. */
export const metadata = pageMetadata({ title: LEGAL.privacy.title, description: LEGAL.privacy.description, path: LEGAL.privacy.path });

export default function Privacy() {
  return (
    <SitePage>
      <LegalPage doc={LEGAL.privacy} />
    </SitePage>
  );
}
