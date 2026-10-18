import { revalidatePath, revalidateTag } from "next/cache";
import { TAGS } from "@/server/discover";

/*
 * POST /api/revalidate — for the API to say "this changed" the moment it
 * does, instead of the pages catching up within the minute.
 *
 *   Authorization: Bearer <REVALIDATE_SECRET>
 *   {"events": ["hack-night-04", "123"], "clubs": ["circuit-society"], "sitemap": true}
 *
 * Each event and club named is looked up afresh on its next visit (its
 * page, its share picture, its media links, the feeds). Without
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
  for (const ref of events) {
    revalidateTag(TAGS.event(ref), "max");
    revalidatePath(`/events/${ref}`);
  }
  for (const slug of clubs) {
    revalidateTag(TAGS.club(slug), "max");
    revalidatePath(`/clubs/${slug}`);
  }
  if (events.length || clubs.length) revalidateTag(TAGS.lists, "max");
  if (body?.sitemap) revalidateTag(TAGS.sitemap, "max");
  return Response.json({ revalidated: { events, clubs, sitemap: Boolean(body?.sitemap) } });
}
