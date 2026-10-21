/**
 * The home page's data, as everyone gets it and as one visitor gets it.
 * Pure: the server shapes the cached page with these, the near-you island
 * in the browser reads the rest.
 */

/** Nobody's place: what a page made for everyone says about where the reader is. */
export const NOWHERE = Object.freeze({ city: null, region: null, lat: null, lng: null, source: "none" });

/** How far "near" reaches, in km: the API's radius for "Events near you" and for the clubs it calls near. */
export const NEAR_KM = 50;

const hasDistance = (x) => typeof x?.distance_km === "number" && Number.isFinite(x.distance_km);

/** Within NEAR_KM of the reader: an event or club with a distance that short. Online, or with no place, is near no one. */
export const isNear = (x) => hasDistance(x) && !x.is_online && x.distance_km <= NEAR_KM;

/**
 * The clubs near the reader and the ones further away (nearest first), from
 * the API's `clubs` and `clubs_more`. Only a club within NEAR_KM is near. An
 * API from before `clubs_more` sent the nearest eight however far in `clubs`
 * (from Thiruvananthapuram, six of them 126 to 412 km off): those beyond
 * NEAR_KM are further away, never near. A club with no distance (the most
 * followed) is neither.
 */
export function splitClubs(clubs = [], more = []) {
  const near = clubs.filter(isNear);
  const seen = new Set(near.map((c) => c.slug || c.id));
  const further = [];
  // The API's further ones as it sent them; from `clubs`, those past NEAR_KM.
  for (const c of [...more, ...clubs.filter((x) => !isNear(x))]) {
    const key = c.slug || c.id;
    if (!hasDistance(c) || seen.has(key)) continue;
    seen.add(key);
    further.push(c);
  }
  further.sort((a, b) => a.distance_km - b.distance_km);
  return { near, further };
}

const placeless = (x) => (x && x.distance_km !== null && x.distance_km !== undefined ? { ...x, distance_km: null } : x);

/**
 * The home page for everyone (parseHome's result): no "near", no distances,
 * nobody's place; the clubs are `popular` when given (the most followed),
 * else the ones the API sent.
 */
export function everyoneHome(home, popular = null) {
  return {
    ...home,
    where: NOWHERE,
    near: [],
    this_week: home.this_week.map(placeless),
    online: home.online.map(placeless),
    popular: home.popular.map(placeless),
    clubs: (popular && popular.length ? popular : home.clubs).map(placeless),
    clubs_more: [],
  };
}

/**
 * What /api/near answers for one visitor: where they are, the events near
 * them, the clubs near them (within NEAR_KM) and the nearest further away
 * (`clubs_more`). Clubs only when the API placed them (otherwise its clubs
 * are just the popular ones the page already shows).
 *   home      parseHome's result, read at their point (or by their address)
 *   label     the city to call it when the API names none (Vercel's guess)
 *   source    "browser" for a point they shared, "ip" for a guess
 */
export function nearAnswer(home, { label = null, source = "ip" } = {}) {
  const w = home?.where || NOWHERE;
  const placed = w.lat !== null && w.lng !== null && w.source !== "none";
  if (!placed) return { where: NOWHERE, near: [], clubs: [], clubs_more: [] };
  const clubs = splitClubs(home.clubs, home.clubs_more);
  return {
    where: { city: w.city || label || null, region: w.region || null, lat: w.lat, lng: w.lng, source: w.source === "browser" ? source : w.source },
    near: home.near.filter(isNear),
    clubs: clubs.near,
    clubs_more: clubs.further,
  };
}

/** Kilometres between two points (haversine): close enough for "is it the same town". */
export function km(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The place a guess names, for a point the visitor shared: the guess's city when it is the same town (within 75 km, as the API decides). */
export const sameTown = (point, guess) => (point && guess && Number.isFinite(guess.lat) && km(point, guess) <= 75 ? guess.city || null : null);
