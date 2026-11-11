import { SitePage } from "@/components/discover/chrome";
import { DataDeletionView } from "@/components/social/datadeletionpage";
import { DATA_DELETION } from "@/content/datadeletion";
import { pageMetadata } from "@/seo/metadata";

/*
 * /data-deletion: Meta's required data deletion page for the social
 * accounts clubs connect (feature-register/social-posting-contract.md).
 * SERVER-RENDERED and static (its words are @/content/datadeletion's);
 * `?code=` (the confirmation code Facebook sends people here with) is read
 * in the browser, and its status shown at the top. The address without a
 * code is the canonical one.
 */
export const metadata = pageMetadata({ title: DATA_DELETION.title, description: DATA_DELETION.description, path: DATA_DELETION.path });

export default function DataDeletion() {
  return (
    <SitePage>
      <DataDeletionView />
    </SitePage>
  );
}
