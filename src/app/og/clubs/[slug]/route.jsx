import { ImageResponse } from "next/og";
import { imageUrl, plural } from "@/utils/format";
import { asJpeg, imageDataUrl, ogFonts } from "@/og/assets";
import { ClubCard } from "@/og/layouts";
import { ApiError } from "@/server/api";
import { getClubPage } from "@/server/discover";

/**
 * GET /og/clubs/{slug} — the club's share picture (1200×630): its cover (or
 * the art drawn for it), the logo, the name, the tagline, where and how
 * many follow it.
 */
const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(request, { params }) {
  const { slug } = await params;
  let data;
  try {
    data = await getClubPage(slug);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return new Response("The picture can't be made right now", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (!data) return new Response("No such club", { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  const { club } = data;
  const [cover, logo] = await Promise.all([imageDataUrl(imageUrl(club.cover, "original")), imageDataUrl(imageUrl(club.logo, "medium"))]);
  const upcoming = Math.max(club.upcoming_events, data.upcoming.length);
  const facts = {
    place: club.location_name,
    followers: club.followers > 0 ? plural(club.followers, "follower") : null,
    upcoming: upcoming > 0 ? `${upcoming} upcoming ${upcoming === 1 ? "event" : "events"}` : null,
  };
  const image = new ImageResponse(<ClubCard club={club} cover={cover} logo={logo} facts={facts} />, {
    width: 1200,
    height: 630,
    fonts: await ogFonts(),
    headers: { "Cache-Control": CACHE },
  });
  return cover ? asJpeg(image) : image;
}
