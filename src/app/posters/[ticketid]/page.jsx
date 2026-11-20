import { notFound } from "next/navigation";
import PosterPage from "@/components/poster/posterpage";
import { pageMetadata } from "@/seo/metadata";
import { isKey, isLinkKey, queryValue } from "@/server/flows";

/*
 * /posters/{ticket}?s=: the guest's "I'm attending" poster
 * (feature-register/posters/CONTRACT.md §6), from the button on their
 * ticket or the poster link in the ticket email (which carries `s`, the
 * link's key). The server checks the address's shape (else a 404); the
 * poster is read, made and shared in the browser, with the key or, without
 * one, the same token that opens the ticket (the account's, or the guest
 * token the registration left). The address holds the ticket's id, which
 * is what the door scans: never indexed, kept, framed or passed on as a
 * referrer (next.config.mjs sets the same as headers). Not under
 * /tickets/, which the phone apps open themselves: the app has no poster
 * screen yet (/tickets/{id}/poster redirects here, query kept).
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Your poster", description: "Make and share your poster for the event.", path: null, noindex: true }),
  referrer: "no-referrer",
};

export default async function PosterRoute({ params, searchParams }) {
  const { ticketid } = await params;
  if (!isKey(ticketid)) notFound();
  const s = queryValue(((await searchParams) || {}).s);
  if (s && !isLinkKey(s)) notFound();
  return <PosterPage ticketid={ticketid} s={s} />;
}
