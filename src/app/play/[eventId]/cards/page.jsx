import CardsPage from "@/components/games/cards";
import { playEvent } from "@/components/games/eventref";
import { pageMetadata } from "@/seo/metadata";

/* /play/{ref}/cards: the card game, played from a phone. Server data only; never indexed. */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Play", description: "Play at your event.", path: null, noindex: true });

export default async function Cards({ params }) {
  const { eventId } = await params;
  const e = await playEvent(eventId);
  return <CardsPage eventId={e.id} eventRef={e.ref} />;
}
