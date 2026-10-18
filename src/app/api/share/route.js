import { sharePage } from "@/server/share/respond";

/*
 * GET /api/share?path=/events (and /api/share/events, the form the bot
 * rewrites use): the page link-preview bots get for a page that is still
 * drawn in the browser (next.config.mjs rewrites their requests here;
 * src/seo/bots.js lists the pages). People never see it.
 */
export async function GET(request) {
  return sharePage(request.nextUrl.searchParams.get("path") || "/");
}
