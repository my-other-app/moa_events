import { SitePage } from "@/components/discover/chrome";
import { ClubMissing } from "@/components/discover/clubpage";

/* A club address no public club answers to: a 404, in the site's own frame. */
export const metadata = { title: "Club not found", robots: { index: false, follow: true } };

export default function ClubNotFound() {
  return (
    <SitePage>
      <ClubMissing />
    </SitePage>
  );
}
