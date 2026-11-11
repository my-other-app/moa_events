import { SitePage } from "@/components/discover/chrome";
import { SpeakerMissing } from "@/components/speakers/speakerpage";

/* A speaker address no public profile answers to (hidden, unknown, or an API without speakers): a 404, in the site's own frame. */
export const metadata = { title: "Speaker not found", robots: { index: false, follow: true } };

export default function SpeakerNotFound() {
  return (
    <SitePage>
      <SpeakerMissing />
    </SitePage>
  );
}
