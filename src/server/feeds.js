import "server-only";
import { FEED_LIMIT, newestFirst } from "@/seo/rss";
import { eventRefOf } from "@/seo/urls";
import { getEventPage } from "./discover";

/**
 * The feeds' items: the newest-published upcoming events, each with its
 * page's words (fetched through the same cache the event pages use, a few
 * at a time). An event whose page doesn't come in time, or fails, goes in
 * with its facts only: a feed is never held up by one event.
 */
export async function feedItems(cards, { limit = FEED_LIMIT, concurrency = 5, budgetMs = 6000 } = {}) {
  const chosen = newestFirst(cards).slice(0, limit);
  const details = new Map();
  const deadline = Date.now() + budgetMs;
  let next = 0;
  const worker = async () => {
    while (next < chosen.length && Date.now() < deadline) {
      const card = chosen[next];
      next += 1;
      const ref = eventRefOf(card);
      try {
        const page = await Promise.race([getEventPage(ref), new Promise((resolve) => setTimeout(() => resolve(null), Math.max(0, deadline - Date.now())))]);
        if (page?.event) details.set(ref, page.event);
      } catch {
        /* the event goes in without its words */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chosen.length) }, worker));
  return chosen.map((card) => ({ card, detail: details.get(eventRefOf(card)) || null }));
}
