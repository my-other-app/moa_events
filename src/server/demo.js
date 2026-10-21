import "server-only";
import { demoSettings } from "@/seo/demo";
import { getClubEvents } from "./discover";

/**
 * The slugs of every event the listed demo clubs have (upcoming and past),
 * for the sitemaps: the API's sitemap rows carry only an event's slug, not
 * its club (see src/seo/demo.js). Read a page of 48 at a time, at most
 * MAX_PAGES a club and kind, cached as long as the sitemap (ten minutes).
 * Nothing is read while the switch is off or the list is empty. A club the
 * API doesn't know is skipped; any other failure throws (the sitemap then
 * says "try again" rather than list demo events).
 */
const PAGE = 48;
const MAX_PAGES = 20;
const REVALIDATE = 600;

async function eventsOf(slug, when) {
  const out = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const read = await getClubEvents(slug, { when, offset: page * PAGE, limit: PAGE, revalidate: REVALIDATE });
    if (!read) break;
    for (const e of read.items) if (e.slug) out.push(e.slug);
    if (read.items.length < PAGE || (page + 1) * PAGE >= read.total) break;
  }
  return out;
}

export async function getDemoEventSlugs(settings = demoSettings()) {
  if (!settings.on || !settings.slugs.size) return new Set();
  const lists = await Promise.all([...settings.slugs].flatMap((slug) => [eventsOf(slug, "upcoming"), eventsOf(slug, "past")]));
  return new Set(lists.flat());
}
