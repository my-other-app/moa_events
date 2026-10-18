import { shareDocument } from "@/server/share/share";

/*
 * GET /api/share?path=/events — the page link-preview bots get for a page
 * that is still drawn in the browser (next.config.mjs rewrites their
 * requests here; src/seo/bots.js lists the pages). People never see it.
 */
export async function GET(request) {
  const path = request.nextUrl.searchParams.get("path") || "/";
  const doc = await shareDocument(path);
  return new Response(doc.html, {
    status: doc.status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": doc.cache, "X-Robots-Tag": "all" },
  });
}
