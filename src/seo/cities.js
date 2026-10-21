/**
 * The cities the site has landing pages for ("Events in Kochi"), Kerala
 * first, and how an event's or a club's place is matched to one. Pure:
 * the city pages, the structured data's addresses and the tests share it.
 *
 * The API has no city on an event (its `city` is null today): only the
 * venue's words (`location_name`, "Thuruthu Coworks, …, Panampilly Nagar,
 * Kochi 682036") and its point. So a place is matched by
 *   1. the city its words name last (an address runs from the room to the
 *      city: "…, Payyannur, Kannur 670309" is Kannur), by its name or a
 *      name it also goes by (Ernakulam, Cochin, Trivandrum, Calicut, …);
 *   2. else the nearest city whose radius holds its point;
 *   3. else none.
 * A city's page lists the in-person events the API finds within its radius
 * that match it (so an event inside two radii is on one page only).
 *
 * To add a city: a row here (its centre, a radius that doesn't swallow the
 * next town, the names people write it by). Its page exists at once; it is
 * indexed, linked and in the sitemap only while it has upcoming events.
 */

export const KERALA = "Kerala";

/**
 * slug, name, also (other names and the big localities people write
 * instead of the city), state, centre, radiusKm, about (one line of our own
 * for the page's introduction; optional).
 */
export const CITIES = [
  {
    slug: "kochi",
    name: "Kochi",
    also: ["Ernakulam", "Cochin", "Kakkanad", "Kalamassery", "Edappally", "Vyttila", "Aluva", "Fort Kochi"],
    state: KERALA,
    lat: 9.9816,
    lng: 76.2999,
    radiusKm: 25,
    about: "Kerala's busiest startup and tech city, from Infopark in Kakkanad and the startup hubs in Kalamassery to the cafés and studios of Fort Kochi and Ernakulam.",
  },
  {
    slug: "thiruvananthapuram",
    name: "Thiruvananthapuram",
    also: ["Trivandrum", "Technopark", "Kazhakkoottam", "Kovalam"],
    state: KERALA,
    lat: 8.5241,
    lng: 76.9366,
    radiusKm: 25,
    about: "Kerala's capital, home to Technopark and many of the state's engineering colleges.",
  },
  {
    slug: "kozhikode",
    name: "Kozhikode",
    also: ["Calicut"],
    state: KERALA,
    lat: 11.2588,
    lng: 75.7804,
    radiusKm: 25,
    about: "The Malabar coast's biggest city, with NIT Calicut, IIM Kozhikode and the city's cyberparks.",
  },
  {
    slug: "thrissur",
    name: "Thrissur",
    also: ["Trichur"],
    state: KERALA,
    lat: 10.5276,
    lng: 76.2144,
    radiusKm: 25,
    about: "Kerala's cultural capital, with a dense ring of engineering, arts and science colleges.",
  },
  {
    slug: "kannur",
    name: "Kannur",
    also: ["Cannanore", "Payyannur", "Thalassery", "Tellicherry"],
    state: KERALA,
    lat: 11.8745,
    lng: 75.3704,
    radiusKm: 40,
    about: "North Malabar's city of beaches and colleges, from Thalassery up to Payyannur.",
  },
  {
    slug: "kottayam",
    name: "Kottayam",
    also: ["Pala", "Changanassery"],
    state: KERALA,
    lat: 9.5916,
    lng: 76.5222,
    radiusKm: 25,
    about: "A college town at heart, home to Mahatma Gandhi University and IIIT Kottayam.",
  },
  { slug: "kollam", name: "Kollam", also: ["Quilon"], state: KERALA, lat: 8.8932, lng: 76.6141, radiusKm: 20 },
  { slug: "alappuzha", name: "Alappuzha", also: ["Alleppey"], state: KERALA, lat: 9.4981, lng: 76.3388, radiusKm: 15 },
  { slug: "palakkad", name: "Palakkad", also: ["Palghat"], state: KERALA, lat: 10.7867, lng: 76.6548, radiusKm: 25 },
  { slug: "malappuram", name: "Malappuram", also: ["Manjeri", "Tirur"], state: KERALA, lat: 11.051, lng: 76.0711, radiusKm: 20 },
  { slug: "bengaluru", name: "Bengaluru", also: ["Bangalore"], state: "Karnataka", lat: 12.9716, lng: 77.5946, radiusKm: 40 },
  { slug: "chennai", name: "Chennai", also: ["Madras"], state: "Tamil Nadu", lat: 13.0827, lng: 80.2707, radiusKm: 40 },
  { slug: "coimbatore", name: "Coimbatore", also: [], state: "Tamil Nadu", lat: 11.0168, lng: 76.9558, radiusKm: 25 },
  { slug: "mangaluru", name: "Mangaluru", also: ["Mangalore"], state: "Karnataka", lat: 12.9141, lng: 74.856, radiusKm: 25 },
  { slug: "hyderabad", name: "Hyderabad", also: ["Secunderabad"], state: "Telangana", lat: 17.385, lng: 78.4867, radiusKm: 40 },
  { slug: "mumbai", name: "Mumbai", also: ["Bombay", "Navi Mumbai", "Thane"], state: "Maharashtra", lat: 19.076, lng: 72.8777, radiusKm: 40 },
  { slug: "pune", name: "Pune", also: [], state: "Maharashtra", lat: 18.5204, lng: 73.8567, radiusKm: 30 },
  { slug: "delhi", name: "Delhi", also: ["New Delhi", "Delhi NCR", "Gurugram", "Gurgaon", "Noida"], state: "Delhi", lat: 28.6139, lng: 77.209, radiusKm: 40 },
];

const BY_SLUG = new Map(CITIES.map((c) => [c.slug, c]));

/** The city a page address names ("kochi"), or null. */
export const cityBySlug = (slug) => BY_SLUG.get(String(slug ?? "").toLowerCase()) || null;

/** "Navi Mumbai" → "navi-mumbai". */
export const slugify = (name) =>
  String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const BY_ANY_NAME = new Map(CITIES.flatMap((c) => [c.name, ...c.also].map((n) => [slugify(n), c])));

/**
 * The city an address names by any of its names ("cochin", "trivandrum",
 * "bangalore", "KOCHI"), or null: the page answers those with a 308 to the
 * city's own slug.
 */
export const cityByAnySlug = (slug) => cityBySlug(slug) || BY_ANY_NAME.get(slugify(slug)) || null;

export const isKerala = (city) => city?.state === KERALA;

/* ---------- addresses ---------- */

export const cityEventsPath = (city) => `/events/in/${encodeURIComponent(city.slug)}`;
export const cityClubsPath = (city) => `/clubs/in/${encodeURIComponent(city.slug)}`;
export const CITIES_PATH = "/events/in";

/* ---------- matching a place ---------- */

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every name a city goes by, as one case-blind, whole-word pattern. */
const PATTERNS = CITIES.map((city) => ({
  city,
  re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${[city.name, ...city.also].map(escape).join("|")})(?![\\p{L}\\p{N}])`, "giu"),
}));

/** The city a place's words name last, or null ("…, Panampilly Nagar, Kochi 682036" → Kochi). */
export function cityInText(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  let best = null;
  let at = -1;
  for (const { city, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > at) {
        at = m.index;
        best = city;
      }
    }
  }
  return best;
}

const RAD = Math.PI / 180;

/** Kilometres between two points on the earth (haversine). */
export function distanceKm(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const placed = (p) => p && typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

/** The nearest city whose radius holds the point, or null. */
export function cityNear(point) {
  if (!placed(point)) return null;
  let best = null;
  let bestKm = Infinity;
  for (const city of CITIES) {
    const km = distanceKm(point, city);
    if (km <= city.radiusKm && km < bestKm) {
      best = city;
      bestKm = km;
    }
  }
  return best;
}

/**
 * The city an event (or a club) is in: by its words first, then its point.
 * Online events are in no city.
 *   place: {location_name, lat, lng, is_online?}
 */
export function cityOf(place) {
  if (!place || place.is_online) return null;
  return cityInText(place.location_name) || cityNear(place);
}

/** India's six-digit PIN code in a place's words ("… Kochi 682036" → "682036"; "682 036" too), or null. */
export function postalCodeOf(text) {
  if (typeof text !== "string") return null;
  const all = [...text.matchAll(/(?<![\d/])([1-9]\d{2})\s?(\d{3})(?![\d/])/g)];
  const last = all.at(-1);
  return last ? `${last[1]}${last[2]}` : null;
}

/**
 * What a schema.org PostalAddress can say about a place beyond its words:
 * {addressLocality, addressRegion, postalCode, addressCountry}, each null
 * when unknown. Every place on the site is in India.
 */
export function addressOf(place) {
  const city = cityOf(place);
  return {
    addressLocality: city ? city.name : null,
    addressRegion: city ? city.state : null,
    postalCode: postalCodeOf(place?.location_name),
    addressCountry: "IN",
  };
}
