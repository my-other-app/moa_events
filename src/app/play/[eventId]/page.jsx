import { notFound } from "next/navigation";
import Play from "@/components/play";
import HubPage from "@/components/games/hub";
import { playEvent } from "@/components/games/eventref";
import { pageMetadata } from "@/seo/metadata";
import { isEventId } from "@/server/flows";

/*
 * /play/{ref}. Two things live under this address, told apart by the ref:
 *
 *   an event's numeric id   the live quiz, played from a phone (the server checks the
 *                           shape, else a 404; the player's key is in this browser)
 *   an event's slug         the games hub: each game that is on, by the name the
 *                           organiser gave it (the games add-on; components/games)
 *
 * Never indexed.
 */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Play", description: "Play along live on MyOtherApp.", path: null, noindex: true });

export default async function PlayPage({ params }) {
  const { eventId } = await params;
  if (isEventId(eventId)) return <Play eventId={eventId} />;
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/i.test(String(eventId))) notFound();
  const e = await playEvent(eventId);
  return <HubPage eventId={e.id} eventRef={e.ref} eventName={e.name} />;
}
