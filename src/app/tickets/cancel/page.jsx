import TicketCancel from "@/components/ticketcancel";
import { pageMetadata } from "@/seo/metadata";
import { queryValue } from "@/server/flows";
import { isCancelToken } from "@/utils/ticketcancel";

/*
 * /tickets/cancel?t=<token>: "Can't come? Give your ticket back", the link
 * in the ticket emails (feature-register/ticket-self-cancel-contract.md;
 * components/ticketcancel.jsx). A word of its own under /tickets, so it is
 * never read as a ticket's id. The token is the link's only credential: the
 * page is never indexed, kept, framed or named to another site (next.config's
 * headers for /tickets/:ticketid cover this address too), Sentry masks it,
 * and the iPhone app leaves it to the browser (src/seo/appLinks.js). A
 * missing or malformed token is said at once, without asking the API.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  ...pageMetadata({ title: "Give your ticket back", description: "Can't come? Give your ticket back so someone else can have your seat.", path: null }),
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function TicketCancelPage({ searchParams }) {
  const query = (await searchParams) || {};
  const t = queryValue(query.t).trim();
  return <TicketCancel token={isCancelToken(t) ? t : null} />;
}
