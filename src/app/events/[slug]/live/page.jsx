import ClientPage from "../../../_client/pages";
import { eventFor, eventSubMetadata } from "../../../_client/event-scoped";

/* /events/{slug}/live. CLIENT PAGE: the server finds the event; @/components/live runs in the browser. */
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  return eventSubMetadata({ params, sub: "live" });
}

export default async function EventLive({ params, searchParams }) {
  const page = await eventFor({ params, searchParams, sub: "live" });
  return <ClientPage name="live" props={{ eventId: String(page.event.id), eventSlug: page.event.slug }} />;
}
