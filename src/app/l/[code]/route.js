import { trackingTarget } from "@/utils/trackinglink";

/*
 * /l/{code}: a tracking link on the site's own domain (what a guest's
 * "I'm attending" poster prints: https://myotherapp.in/l/x7k2m9pq). Passed
 * straight on to the API's own tracking link, /l/{code} on the API, query
 * kept: the API counts the click and sends the visitor on to the page the
 * link is for (the event's page, with `?ref=` for the registration to
 * carry: utils/ref.js). The site looks nothing up.
 *
 * Only a code goes on, and only ever to the API's /l/ path: anything else is
 * a 404 here, so this can't be made to send anyone anywhere else. The
 * redirect is never kept, by a browser or an edge (each click must reach the
 * API to be counted), and never indexed.
 */
export const dynamic = "force-dynamic";

const NEVER_KEPT = {
  "Cache-Control": "no-store, max-age=0",
  "Vercel-CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(request, { params }) {
  const { code } = await params;
  const target = trackingTarget(code, new URL(request.url).search);
  if (!target) {
    return new Response("No such link", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...NEVER_KEPT } });
  }
  return new Response(null, { status: 307, headers: { Location: target, "Referrer-Policy": "strict-origin-when-cross-origin", ...NEVER_KEPT } });
}

export const HEAD = GET;
