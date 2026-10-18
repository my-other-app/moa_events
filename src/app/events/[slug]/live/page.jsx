import Live from "@/components/live";
import { eventFor, eventSubMetadata } from "@/server/eventscoped";

/*
 * /events/{slug}/live: the live room. The server finds the event (404, 308
 * from an old slug or an id, query kept) and sets the head (never indexed);
 * the room is a client component that polls its feed, with the event's
 * name in the first paint.
 */
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  return eventSubMetadata({ params, sub: "live" });
}

export default async function EventLive({ params, searchParams }) {
  const page = await eventFor({ params, searchParams, sub: "live" });
  return <Live eventId={String(page.event.id)} eventSlug={page.event.slug} eventName={page.event.name} />;
}
