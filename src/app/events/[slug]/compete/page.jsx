import ClientPage from "../../../_client/pages";
import { eventFor, eventSubMetadata } from "../../../_client/event-scoped";

/* /events/{slug}/compete. CLIENT PAGE: the server finds the event; @/components/compete runs in the browser. */
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  return eventSubMetadata({ params, sub: "compete" });
}

export default async function EventCompete({ params, searchParams }) {
  const page = await eventFor({ params, searchParams, sub: "compete" });
  return <ClientPage name="compete" props={{ eventId: String(page.event.id), eventSlug: page.event.slug }} />;
}
