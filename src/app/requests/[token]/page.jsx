import { notFound } from "next/navigation";
import RequestStatus from "@/components/request";
import { pageMetadata } from "@/seo/metadata";
import { isRequestToken } from "@/server/flows";

/*
 * /requests/{token}: where a registration stands, for an event that reviews
 * registrations (registration approval; the API calls it a request). The
 * link comes by email and from the form's last screen. The server checks the
 * address's shape (else a 404); the registration is read (and cancelled) in
 * the browser, the token being its only credential. Never indexed, kept,
 * framed or named to another site (next.config.mjs). The apps open these
 * links themselves (src/seo/appLinks.js).
 *
 * `?withdraw=1` is the email's "Cancel my registration" link: the page opens
 * on the cancel question once the registration has loaded, if it can still
 * be cancelled. Nothing is cancelled without the person saying yes.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Your registration", description: "Where your registration for an event stands.", path: null }),
  robots: { index: false, follow: false },
  // Other sites hear only the site's origin, never this address (next.config.mjs sets the same as a header).
  referrer: "strict-origin",
};

export default async function RequestPage({ params, searchParams }) {
  const { token } = await params;
  if (!isRequestToken(token)) notFound();
  const query = (await searchParams) || {};
  const withdraw = Array.isArray(query.withdraw) ? query.withdraw[0] : query.withdraw;
  return <RequestStatus token={token} askToCancel={withdraw === "1"} />;
}
