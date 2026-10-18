import { notFound } from "next/navigation";
import Play from "@/components/play";
import { pageMetadata } from "@/seo/metadata";
import { isEventId } from "@/server/flows";

/*
 * The live quiz, played from a phone. The server checks the address (an
 * event's id, else a 404); the game is a client component (the player's
 * key is in this browser). Never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Play", description: "Play along live on MyOtherApp.", path: null, noindex: true });

export default async function PlayPage({ params }) {
  const { eventId } = await params;
  if (!isEventId(eventId)) notFound();
  return <Play eventId={eventId} />;
}
