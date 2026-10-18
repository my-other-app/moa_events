import "server-only";
import { notFound, permanentRedirect } from "next/navigation";
import { isLegacyRef, legacyDestination, queryOf } from "@/seo/legacy";
import { getEventPage } from "./discover";

/**
 * Answers an old event address (see src/seo/legacy.js): a 308 to the
 * event's page (or the page under it), keeping the query; the 404 page
 * when no public event goes by that name. An API failure throws, and the
 * error page offers a retry.
 */
export async function redirectLegacy({ ref, sub = "", searchParams = {} }) {
  if (!isLegacyRef(ref)) notFound();
  const page = await getEventPage(ref);
  if (!page) notFound();
  permanentRedirect(legacyDestination(page.event, sub, queryOf(searchParams)));
}
