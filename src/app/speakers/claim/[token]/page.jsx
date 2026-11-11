import { notFound } from "next/navigation";
import SpeakerClaim from "@/components/speakers/claim";
import { pageMetadata } from "@/seo/metadata";
import { isClaimToken } from "@/server/flows";

/*
 * /speakers/claim/{token}: a speaker claims their profile from our invite
 * email (components/speakers/claim.jsx; feature-register/speakers-contract.md).
 * The server checks the token's shape (404 otherwise); the link is read and
 * claimed in the browser. The token is the invite's credential: never
 * indexed, kept, framed or named to another site (CLAIM_HEADERS in
 * next.config.mjs), masked in Sentry, and the apps leave it to the browser
 * (src/seo/appLinks.js).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Claim your speaker profile", description: "Claim the speaker profile clubs made for you on MyOtherApp.", path: null }),
  robots: { index: false, follow: false },
  referrer: "strict-origin",
};

export default async function SpeakerClaimPage({ params }) {
  const { token } = await params;
  if (!isClaimToken(token)) notFound();
  return <SpeakerClaim token={token} />;
}
