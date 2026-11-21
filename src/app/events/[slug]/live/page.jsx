import Live from "@/components/live";
import { ApiError } from "@/server/api";
import { eventFor, eventSubMetadata } from "@/server/eventscoped";

/*
 * /events/{slug}/live: the live room. The server finds the event (404, 308
 * from an old slug or an id, query kept) and sets the head (never indexed);
 * the room is a client component that follows its feed (pushed, or polled
 * where it cannot be: src/api/liveStream.js), with the event's name in the
 * first paint.
 *
 * A hall full of phones scans the same code at once, so this is the page
 * that meets the API at its busiest. When the API is slow or down (the
 * server's read gives up after its usual timeout, src/server/api.js), the
 * page is still made, with the slug alone: the browser looks the event up
 * itself and opens the room, or offers to try again. A 404 and an old
 * slug's 308 are the API's answers, and stay what they are.
 */
export const dynamic = "force-dynamic";

const busy = (e) => e instanceof ApiError;

export async function generateMetadata({ params }) {
  try {
    return await eventSubMetadata({ params, sub: "live" });
  } catch (e) {
    if (!busy(e)) throw e;
    return { title: "Live", robots: { index: false, follow: true } };
  }
}

export default async function EventLive({ params, searchParams }) {
  let page;
  try {
    page = await eventFor({ params, searchParams, sub: "live" });
  } catch (e) {
    // notFound() and the 308 are thrown too: only the API's failure is caught.
    if (!busy(e)) throw e;
    const { slug } = await params;
    return <Live eventSlug={slug} />;
  }
  return <Live eventId={String(page.event.id)} eventSlug={page.event.slug} eventName={page.event.name} />;
}
