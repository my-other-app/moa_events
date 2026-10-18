import "server-only";

/**
 * Who a per-request read is made for: the visitor's address, as Vercel
 * hands it over, and the place Vercel's edge put them in.
 *
 *   ip    the first address in X-Forwarded-For (Vercel writes it, a client
 *         can't), else X-Real-IP; null when neither is an IP address
 *   geo   {lat, lng, city, region, country} from x-vercel-ip-latitude,
 *         -longitude, -city (URL-encoded), -country-region, -country; null
 *         without a usable point (local runs, a request Vercel couldn't place)
 *
 * Only pages and handlers that answer one visitor read this (src/app/events,
 * src/app/clubs, /api/near): see apiGet's `visitor` in ./api.js. A page that
 * is statically regenerated (ISR) never does — it is made for nobody in
 * particular, and reading the request would make it dynamic.
 */

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,39}(%[0-9a-z]+)?$/i;

/** True for something that reads as an IPv4 or IPv6 address (never a name, never a list). */
export function isIp(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (IPV4.test(s)) return true;
  return s.includes(":") && IPV6.test(s);
}

const header = (h, name) => {
  const v = typeof h?.get === "function" ? h.get(name) : h?.[name];
  return typeof v === "string" ? v.trim() : "";
};

const num = (v) => (v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

const decoded = (v) => {
  if (!v) return null;
  try {
    return decodeURIComponent(v).trim().slice(0, 80) || null;
  } catch {
    return v.slice(0, 80);
  }
};

/** The visitor's address: Vercel's X-Forwarded-For (its first hop), else X-Real-IP. */
export function visitorIp(h) {
  const first = header(h, "x-forwarded-for").split(",")[0]?.trim() || "";
  if (isIp(first)) return first;
  const real = header(h, "x-real-ip");
  return isIp(real) ? real : null;
}

/** Where Vercel's edge placed the visitor; null without a point. */
export function visitorGeo(h) {
  const lat = num(header(h, "x-vercel-ip-latitude"));
  const lng = num(header(h, "x-vercel-ip-longitude"));
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return {
    lat,
    lng,
    city: decoded(header(h, "x-vercel-ip-city")),
    region: decoded(header(h, "x-vercel-ip-country-region")),
    country: decoded(header(h, "x-vercel-ip-country")),
  };
}

/** {ip, geo} from request headers (a Headers, or a plain object of lower-case names). */
export function readVisitor(h) {
  return { ip: visitorIp(h), geo: visitorGeo(h) };
}

/** The visitor of the request being rendered. Only for dynamic pages: it reads the request's headers. */
export async function requestVisitor() {
  const { headers } = await import("next/headers");
  return readVisitor(await headers());
}
