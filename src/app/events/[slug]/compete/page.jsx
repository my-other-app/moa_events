import Compete from "@/components/compete";
import { eventFor, eventSubMetadata } from "@/server/eventscoped";

/*
 * /events/{slug}/compete: a registered guest's team, tracks and submission.
 * The server finds the event (404, 308 from an old slug or an id, query
 * kept) and sets the head (never indexed); the rest is a client component,
 * read with the visitor's own token.
 */
export const dynamic = "force-dynamic";

export function generateMetadata({ params }) {
  return eventSubMetadata({ params, sub: "compete" });
}

export default async function EventCompete({ params, searchParams }) {
  const page = await eventFor({ params, searchParams, sub: "compete" });
  return <Compete eventId={String(page.event.id)} eventSlug={page.event.slug} />;
}
