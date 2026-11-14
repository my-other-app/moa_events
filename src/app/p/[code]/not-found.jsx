import { SitePage } from "@/components/discover/chrome";
import { ProfileMissing } from "@/components/profiles/profileview";

/* A QR code that leads to no profile (unknown, or its owner's profile is hidden or gone): a 404, in the site's own frame. */
export const metadata = { title: "Profile not found", robots: { index: false, follow: false } };

export default function ProfileCodeNotFound() {
  return (
    <SitePage>
      <ProfileMissing />
    </SitePage>
  );
}
