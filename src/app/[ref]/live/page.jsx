import Live from "@/components/live";
import { ApiError } from "@/server/api";
import { redirectLegacy } from "@/server/legacy";

/*
 * /{ref}/live: the old live room address (and the big screen's QR before it
 * knows the event's slug). A 308 to /events/{slug}/live.
 *
 * When the API is too busy to say where that is, the room opens here
 * instead of an error page: by the id when the address is one (the room's
 * own calls are by id), else by the slug, which the browser looks up.
 */
export const dynamic = "force-dynamic";

export default async function LegacyLive({ params, searchParams }) {
  const { ref } = await params;
  try {
    await redirectLegacy({ ref, sub: "live", searchParams: await searchParams });
  } catch (e) {
    // The 308 and notFound() are thrown too: only the API's failure is caught.
    if (!(e instanceof ApiError)) throw e;
    return /^\d+$/.test(ref) ? <Live eventId={ref} /> : <Live eventSlug={ref} />;
  }
  return null;
}
