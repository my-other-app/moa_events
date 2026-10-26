import { notFound } from "next/navigation";
import RequestStatus from "@/components/request";
import { pageMetadata } from "@/seo/metadata";
import { isRequestToken } from "@/server/flows";

/*
 * /requests/{token}: where a request for a place stands, for an event whose
 * club confirms each place (registration approval). The link comes by email
 * and from the form's last screen. The server checks the address's shape
 * (else a 404); the request is read (and withdrawn) in the browser, the
 * token being its only credential. Never indexed, kept, framed or named to
 * another site (next.config.mjs). The apps open these links themselves
 * (src/seo/appLinks.js).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Your request for a place", description: "Where your request for a place at an event stands.", path: null }),
  robots: { index: false, follow: false },
  // Other sites hear only the site's origin, never this address (next.config.mjs sets the same as a header).
  referrer: "strict-origin",
};

export default async function RequestPage({ params }) {
  const { token } = await params;
  if (!isRequestToken(token)) notFound();
  return <RequestStatus token={token} />;
}
