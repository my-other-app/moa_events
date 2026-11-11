import MySpeakerProfile from "@/components/speakers/myprofile";
import { pageMetadata } from "@/seo/metadata";

/*
 * /speakers/me: the signed-in person's own speaker profile, to edit
 * (components/speakers/myprofile.jsx). The same neutral first paint for
 * everyone (who is signed in lives in the browser); never indexed.
 */
export const metadata = {
  ...pageMetadata({ title: "Your speaker profile", description: "Edit your speaker profile on MyOtherApp.", path: null }),
  robots: { index: false, follow: false },
};

export default function MySpeakerProfilePage() {
  return <MySpeakerProfile />;
}
