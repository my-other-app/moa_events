import "server-only";
import { notFound } from "next/navigation";
import { getEventPage } from "@/server/discover";

/** The event a /play/{ref} page is for (slug or numeric id): its id, slug and name, or a real 404. */
export async function playEvent(ref) {
  const page = await getEventPage(ref).catch(() => null);
  if (!page) notFound();
  return { id: String(page.event.id), ref: page.event.slug || String(page.event.id), name: page.event.name };
}
