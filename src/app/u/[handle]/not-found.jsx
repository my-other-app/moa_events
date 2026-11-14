import { SitePage } from "@/components/discover/chrome";
import { ProfileMissing } from "@/components/profiles/profileview";

/* A profile address nobody answers to (unknown, deleted, hidden or blocked): a 404, in the site's own frame. */
export const metadata = { title: "Profile not found", robots: { index: false, follow: true } };

export default function ProfileNotFound() {
  return (
    <SitePage>
      <ProfileMissing />
    </SitePage>
  );
}
