import { isKey, isLinkKey } from "@/server/flows";

/*
 * /tickets/{ticket}/poster?s=: an older form of the poster link in a ticket
 * email (feature-register/posters/CONTRACT.md §12 now names /posters/{ticket}
 * itself). On to the poster page with the link's key, at once. The address
 * holds the ticket's id and the key, so the redirect is never kept, indexed
 * or named to another site; anything that isn't a ticket and a key is a 404.
 * The iPhone app leaves this address to the browser (src/seo/appLinks.js).
 */
export const dynamic = "force-dynamic";

const PRIVATE = {
  "Cache-Control": "no-store, max-age=0",
  "Vercel-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(request, { params }) {
  const { ticketid } = await params;
  const s = new URL(request.url).searchParams.get("s") || "";
  if (!isKey(ticketid) || (s && !isLinkKey(s))) {
    return new Response("No such poster", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...PRIVATE } });
  }
  const to = `/posters/${encodeURIComponent(ticketid)}${s ? `?s=${encodeURIComponent(s)}` : ""}`;
  return new Response(null, { status: 307, headers: { Location: to, ...PRIVATE } });
}

export const HEAD = GET;
