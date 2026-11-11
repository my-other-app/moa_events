import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS } from "@/server/discover";
import { SPEAKER_TAG } from "@/server/speakers";
import { HELP_TAG } from "@/server/support";

/*
 * POST /api/revalidate — for the API to say "this changed" the moment it
 * does, instead of the pages catching up within the minute.
 *
 *   Authorization: Bearer <REVALIDATE_SECRET>
 *   {"events": ["hack-night-04", "123"], "clubs": ["circuit-society"], "speakers": ["asha-rao"], "sitemap": true, "topics": true, "help": true}
 *
 * Each event and club named is looked up afresh on its next visit (its
 * page, its share picture, its media links, the feeds); "topics" reads the
 * topics and their interests again (after an admin edits them); "help" the
 * help page's answers and topics (after the desk's are edited); each speaker
 * named (by slug) has their page and photo read again. Without
 * REVALIDATE_SECRET set, this answers 404: it is off.
 */
const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export async function POST(request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return new Response("Not found", { status: 404 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send JSON" }, { status: 400 });
  }
  const list = (v) => (Array.isArray(v) ? v.map(String).filter((x) => REF.test(x)).slice(0, 200) : []);
  const events = list(body?.events);
  const clubs = list(body?.clubs);
  const speakers = list(body?.speakers);
  for (const ref of events) {
    revalidateTag(TAGS.event(ref), "max");
    revalidatePath(`/events/${ref}`);
  }
  for (const slug of clubs) {
    revalidateTag(TAGS.club(slug), "max");
    revalidatePath(`/clubs/${slug}`);
  }
  for (const slug of speakers) {
    revalidateTag(SPEAKER_TAG(slug), "max");
    revalidatePath(`/speakers/${slug}`);
  }
  if (events.length || clubs.length) revalidateTag(TAGS.lists, "max");
  if (body?.sitemap) revalidateTag(TAGS.sitemap, "max");
  if (body?.topics) revalidateTag(TAGS.topics, "max");
  if (body?.help) revalidateTag(HELP_TAG, "max");
  return Response.json({
    revalidated: { events, clubs, ...(speakers.length ? { speakers } : {}), sitemap: Boolean(body?.sitemap), ...(body?.topics ? { topics: true } : {}), ...(body?.help ? { help: true } : {}) },
  });
}
