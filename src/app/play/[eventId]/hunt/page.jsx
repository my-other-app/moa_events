import HuntPage from "@/components/games/hunt";
import { playEvent } from "@/components/games/eventref";
import { pageMetadata } from "@/seo/metadata";

/* /play/{ref}/hunt: the scavenger hunt, played from a phone. Server data only; never indexed. */
export const dynamic = "force-dynamic";

export const metadata = pageMetadata({ title: "Play", description: "Play at your event.", path: null, noindex: true });

export default async function Hunt({ params }) {
  const { eventId } = await params;
  const e = await playEvent(eventId);
  return <HuntPage eventId={e.id} eventRef={e.ref} />;
}
