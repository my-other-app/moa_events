import { nearPoint } from "@/api/parse";
import { stableCard, stableClubCard } from "@/seo/stabilize";
import { ApiError, forwardsVisitor } from "@/server/api";
import { getNearHome } from "@/server/discover";
import { readVisitor } from "@/server/visitor";
import { NOWHERE, nearAnswer, sameTown } from "@/utils/home";

/*
 * GET /api/near[?lat=&lng=] — what is near one visitor, for the home page's
 * NearYou island: {where: {city, region, lat, lng, source}, near: [event
 * cards], clubs: [club cards within 50 km], clubs_more: [the nearest club
 * cards further away]} (images on /media/... links).
 *
 * Where they are:
 *   ?lat=&lng=     the point they shared in this browser ("Use my location")
 *   else           Vercel's guess from their connection (x-vercel-ip-latitude,
 *                  -longitude, -city), sent to the API as the point
 *   else           their address (X-Visitor-IP, when API_SITE_TOKEN is set),
 *                  for the API to place them itself
 *   else           nowhere: an empty answer (the API would place this server)
 *
 * Caching. A guess is the same for everyone Vercel puts at the same spot,
 * so that answer is kept at the edge for a minute (and served stale for
 * five more while it is made again), varied by the three headers it was
 * made from: one copy per place, never another place's. An answer for a
 * shared point or an address is that visitor's alone: their browser keeps
 * it a minute, the edge not at all.
 */
export const dynamic = "force-dynamic";

const SHARED = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
  Vary: "X-Vercel-IP-Latitude, X-Vercel-IP-Longitude, X-Vercel-IP-City",
};
const PRIVATE = { "Cache-Control": "private, max-age=60" };

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const visitor = readVisitor(request.headers);
  const shared = params.has("lat") || params.has("lng") ? nearPoint(`${params.get("lat")},${params.get("lng")}`) : null;
  const guess = visitor.geo;

  let point = null;
  let label = null;
  let source = "ip";
  let headers = PRIVATE;
  if (shared) {
    point = shared;
    label = sameTown(shared, guess);
    source = "browser";
  } else if (guess) {
    point = { lat: guess.lat, lng: guess.lng };
    label = guess.city;
    headers = SHARED;
  } else if (!forwardsVisitor(visitor)) {
    return Response.json({ where: NOWHERE, near: [], clubs: [], clubs_more: [] }, { headers: PRIVATE });
  }

  try {
    const home = await getNearHome(point, { visitor });
    const answer = nearAnswer(home, { label, source });
    return Response.json(
      { where: answer.where, near: answer.near.map(stableCard), clubs: answer.clubs.map(stableClubCard), clubs_more: answer.clubs_more.map(stableClubCard) },
      { headers }
    );
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return Response.json({ error: "Near you can't be worked out right now" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
}
