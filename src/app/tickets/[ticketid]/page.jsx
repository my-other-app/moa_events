import { notFound } from "next/navigation";
import Ticket from "@/components/ticket";
import { pageMetadata } from "@/seo/metadata";
import { isKey } from "@/server/flows";

/*
 * A ticket, from the link in the email or My tickets. The server checks the
 * address (else a 404); the ticket opens in the browser, with the token that
 * may read it. Never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Your ticket", description: "Your ticket on MyOtherApp.", path: null, noindex: true });

export default async function TicketPage({ params }) {
  const { ticketid } = await params;
  if (!isKey(ticketid)) notFound();
  return <Ticket ticketid={ticketid} />;
}
