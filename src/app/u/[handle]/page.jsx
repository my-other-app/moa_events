import { notFound, permanentRedirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { ProfileLive } from "@/components/profiles/profileislands";
import { profileMetadata } from "@/seo/metadata";
import { stableProfile } from "@/seo/stabilize";
import { profilePagePath } from "@/seo/urls";
import { getProfile } from "@/server/profiles";
import { requestVisitor } from "@/server/visitor";
import { isProfileHandle } from "@/utils/profiles";

/*
 * /u/{handle}: a person's profile (feature-register/profiles-networking-contract.md).
 * SERVER-RENDERED for each request, from a read of the API as NOBODY (no
 * token: the HTML is the same for every reader) made for the visitor's
 * address (X-Visitor-IP, src/server/profiles.js), so the API's per-address
 * limit is theirs, not the whole site's; the read is kept a minute. Their
 * picture, name, headline, links, projects, achievements and interests (as
 * far as the owner shows them to everyone) are in it; a private profile is
 * its header and a word that it is private.
 *
 * What a signed-in reader may see beyond that (the sections the owner shares
 * with people they know, contact details, whether either has saved the
 * other) is asked for in the browser with their token
 * (src/components/profiles/profileislands.jsx), as is Save to your network.
 * ?save=1 (a scanned QR, from /p/{code}) is read there too: the page itself
 * never reads the address's query.
 *
 * Open Graph and the Twitter card carry their name, headline and picture.
 * `noindex` unless the owner made the profile findable (`indexable`); never
 * in a sitemap. Unknown, deleted, hidden or blocked (404) → not-found.jsx.
 */
export const dynamic = "force-dynamic";

/** The visitor's address (the first X-Forwarded-For hop, Caddy's own), or null. */
const visitorIpOf = async () => (await requestVisitor()).ip;

const NOT_FOUND_META = { title: "Profile not found", robots: { index: false, follow: true } };

export async function generateMetadata({ params }) {
  const { handle } = await params;
  const profile = await getProfile(String(handle).toLowerCase(), await visitorIpOf());
  return profile ? profileMetadata(profile) : NOT_FOUND_META;
}

export default async function ProfileRoute({ params }) {
  const { handle } = await params;
  const lower = String(handle || "").toLowerCase();
  if (!isProfileHandle(lower)) notFound();
  // Handles are lower-case: one address for each person.
  if (handle !== lower) permanentRedirect(profilePagePath(lower));
  const profile = await getProfile(lower, await visitorIpOf());
  if (!profile) notFound();
  if (profile.handle !== lower) permanentRedirect(profilePagePath(profile.handle));
  return (
    <SitePage>
      <ProfileLive profile={stableProfile(profile)} />
    </SitePage>
  );
}
