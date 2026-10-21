import { ImageResponse } from "next/og";
import { imageUrl } from "@/utils/format";
import { asJpeg, imageDataUrl, ogFonts } from "@/og/assets";
import { eventFacts } from "@/og/facts";
import { EVENT_FRAMES, EventCard, EventFrame } from "@/og/layouts";
import { posterOf } from "@/seo/media";
import { ApiError } from "@/server/api";
import { getEventPage, getEventPageFresh } from "@/server/discover";

/**
 * GET /og/events/{slug} — the event's share picture (1200×630): the poster
 * or its drawn cover, the name, when and where, the price and the club.
 * og:image and twitter:image point here (with ?v= changing when what it
 * shows does), so the link previews never hold a dead S3 link.
 *
 * ?ratio=16x9 | 4x3 | 1x1 — the event's picture for its structured data
 * (Google wants those three): the whole poster on its drawn art, or the
 * drawn cover, at 1200×675, 1200×900 or 1200×1200 (EVENT_FRAMES).
 */
const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(request, { params }) {
  const { slug } = await params;
  let page;
  try {
    page = await getEventPage(slug);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return new Response("The picture can't be made right now", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (!page) return new Response("No such event", { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });

  const frame = EVENT_FRAMES[request.nextUrl?.searchParams.get("ratio")] || null;
  // The poster at its middle size is plenty for 504×630 (a frame shows it whole, so the original); a dead
  // link (an old cached answer) is looked up once more.
  const size = frame ? "original" : "medium";
  let poster = await imageDataUrl(posterOf(page, size));
  if (!poster && page.event.poster) {
    const fresh = await getEventPageFresh(slug).catch(() => null);
    poster = fresh ? await imageDataUrl(posterOf(fresh, size)) : null;
  }
  if (frame) {
    const [w, h] = frame;
    const picture = new ImageResponse(<EventFrame event={page.event} poster={poster} w={w} h={h} />, { width: w, height: h, fonts: await ogFonts(), headers: { "Cache-Control": CACHE } });
    return poster ? asJpeg(picture) : picture;
  }
  const clubLogo = page.club?.logo ? await imageDataUrl(imageUrl(page.club.logo, "medium")) : null;

  const image = new ImageResponse(<EventCard event={page.event} club={page.club} poster={poster} clubLogo={clubLogo} facts={eventFacts(page.event)} />, {
    width: 1200,
    height: 630,
    fonts: await ogFonts(),
    headers: { "Cache-Control": CACHE },
  });
  // A poster is usually a photo: as a JPEG it stays well under what the chat apps allow.
  return poster ? asJpeg(image) : image;
}
