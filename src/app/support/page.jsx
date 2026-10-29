import { SitePage } from "@/components/discover/chrome";
import { SupportView } from "@/components/discover/supportpage";
import { SUPPORT } from "@/content/support";
import { pageMetadata } from "@/seo/metadata";

/*
 * Support. SERVER-RENDERED and static (made at build time): its words are
 * @/content/support's. /support is the App Store's Support URL, and
 * /support#delete-account is the account-deletion page Google Play links to.
 */
export const metadata = pageMetadata({ title: SUPPORT.title, description: SUPPORT.description, path: SUPPORT.path });

export default function Support() {
  return (
    <SitePage>
      <SupportView />
    </SitePage>
  );
}
