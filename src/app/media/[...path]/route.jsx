import { ImageResponse } from "next/og";
import { EventCoverPanel } from "@/og/layouts";
import { ogFonts } from "@/og/assets";
import { isStale, mediaTarget, redirectTtl } from "@/seo/media";
import { media } from "@/seo/urls";
import { ApiError } from "@/server/api";
import { getClubPage, getClubPageFresh, getEventPage, getEventPageFresh, getThread } from "@/server/discover";

/**
 * GET /media/... — a stable address for an image the API only hands out as
 * a presigned S3 link (which dies within the hour). Looks up the current
 * link and redirects to it (307), cached for up to five minutes and never
 * past the link's own life. Pages, structured data and feeds point here, so
 * a cached page never holds a dead link. See src/seo/media.js for the
 * addresses.
 *
 * An event without a poster redirects to its drawn cover
 * (/media/events/{ref}/cover), which is drawn here as a PNG.
 */

const LOADERS = {
  event: (ref, fresh) => (fresh ? getEventPageFresh(ref) : getEventPage(ref)),
  club: (slug, fresh) => (fresh ? getClubPageFresh(slug) : getClubPage(slug)),
  thread: (id, fresh) => getThread(id, { fresh }),
};

const status = (code, text, cache) => new Response(text, { status: code, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cache } });

const redirect = (location, ttl) =>
  new Response(null, {
    status: 307,
    headers: { Location: location, "Cache-Control": ttl > 0 ? `public, max-age=${ttl}, s-maxage=${ttl}` : "no-store" },
  });

const COVER_W = 800;
const COVER_H = 1000;

async function cover(ref) {
  const page = await getEventPage(ref);
  if (!page) return status(404, "No such event", "public, max-age=60, s-maxage=60");
  return new ImageResponse(<EventCoverPanel event={page.event} w={COVER_W} h={COVER_H} />, {
    width: COVER_W,
    height: COVER_H,
    fonts: await ogFonts(),
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

export async function GET(request, { params }) {
  const { path } = await params;
  const target = mediaTarget(path);
  if (!target) return status(404, "Not found", "public, max-age=3600, s-maxage=3600");
  const size = request.nextUrl.searchParams.get("size");
  try {
    // Only an event's cover is drawn here; a club's cover is its own picture, looked up below.
    if (target.source === "event" && target.what === "cover") return await cover(target.ref);
    const load = LOADERS[target.source];
    let data = await load(target.ref, false);
    let url = data ? target.pick(data, size) : null;
    // A link about to die (an old cached answer) is asked for again, fresh.
    if (data && isStale(url)) {
      data = await load(target.ref, true);
      url = data ? target.pick(data, size) : null;
    }
    if (!data) return status(404, "Not found", "public, max-age=60, s-maxage=60");
    if (!url) {
      if (target.source === "event" && target.what === "poster") return redirect(new URL(media.eventCover(target.ref), request.url).toString(), 300);
      return status(404, "No image", "public, max-age=60, s-maxage=60");
    }
    return redirect(url, redirectTtl(url));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return status(502, "The image can't be looked up right now", "no-store");
  }
}
