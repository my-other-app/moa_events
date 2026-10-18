import { notFound } from "next/navigation";
import Feedback from "@/components/feedback";
import { pageMetadata } from "@/seo/metadata";
import { isEventId, isKey, queryValue } from "@/server/flows";

/*
 * Feedback after an event, from the link in the email (?k= is the link's
 * key). The server checks the address (else a 404) and hands it over; the
 * survey is a client component. Never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Feedback", description: "Tell the organisers how it went.", path: null, noindex: true });

export default async function FeedbackPage({ params, searchParams }) {
  const { eventId, registrationId } = await params;
  if (!isEventId(eventId) || !isKey(registrationId)) notFound();
  const { k } = await searchParams;
  return <Feedback eventId={eventId} registrationId={registrationId} k={queryValue(k)} />;
}
