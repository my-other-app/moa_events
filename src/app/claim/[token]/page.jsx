import { notFound } from "next/navigation";
import Claim from "@/components/claim";
import { pageMetadata } from "@/seo/metadata";
import { isClaimToken } from "@/server/flows";

/*
 * /claim/{token}: the link a waiting list's offer sends (by email, push and
 * WhatsApp) when a place opens up. The server checks the address's shape
 * (else a 404); the offer is read and claimed in the browser, the token
 * being its only credential. Never indexed. The apps open these links
 * themselves (src/seo/appLinks.js).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Claim your place", description: "A place opened up for you on the waiting list.", path: null }),
  robots: { index: false, follow: false },
  // Other sites hear only the site's origin, never this address (next.config.mjs sets the same as a header).
  referrer: "strict-origin",
};

export default async function ClaimPage({ params }) {
  const { token } = await params;
  if (!isClaimToken(token)) notFound();
  return <Claim token={token} />;
}
