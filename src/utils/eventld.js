/**
 * The schema.org Event a search engine reads off an event page. Shared by
 * the page (for crawlers that run scripts) and the link-preview function
 * under /api (for the ones that don't), so it imports nothing.
 *
 * `event` is the event as GET /discover/events/{ref} sends it; `image`,
 * `url` and `clubUrl` are absolute addresses worked out by the caller.
 */
const SCHEMA = "https://schema.org/";

const positive = (v) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

const clean = (o) => {
  if (Array.isArray(o)) return o.map(clean);
  if (!o || typeof o !== "object") return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
    out[k] = clean(v);
  }
  return out;
};

function availability(event) {
  if (event.status === "full") return "SoldOut";
  if (event.status === "ended") return "Discontinued";
  if (event.registration_open) return event.status === "closing_soon" ? "LimitedAvailability" : "InStock";
  const opens = event.reg_opens_at ? new Date(event.reg_opens_at) : null;
  if (opens && !Number.isNaN(opens.getTime()) && opens.getTime() > Date.now()) return "PreOrder";
  return "OutOfStock";
}

function endOf(event) {
  if (event.ends_at) return event.ends_at;
  const hours = positive(event.duration_hours);
  const start = event.starts_at ? new Date(event.starts_at) : null;
  if (!hours || !start || Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + hours * 3600 * 1000).toISOString();
}

export function eventJsonLd({ event, club, speakers = [], image, url, clubUrl, description }) {
  if (!event) return null;
  const online = Boolean(event.is_online);
  const lat = typeof event.lat === "number" ? event.lat : null;
  const lng = typeof event.lng === "number" ? event.lng : null;
  const fee = event.has_fee ? positive(event.fee) : 0;
  return clean({
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: description || null,
    startDate: event.starts_at || null,
    endDate: endOf(event),
    eventStatus: `${SCHEMA}EventScheduled`,
    eventAttendanceMode: `${SCHEMA}${online ? "OnlineEventAttendanceMode" : "OfflineEventAttendanceMode"}`,
    location: online
      ? { "@type": "VirtualLocation", url }
      : {
          "@type": "Place",
          name: event.location_name || "Venue to be announced",
          address: event.location_name || null,
          geo: lat !== null && lng !== null ? { "@type": "GeoCoordinates", latitude: lat, longitude: lng } : null,
          hasMap: event.location_link || null,
        },
    image: image ? [image] : null,
    url,
    organizer: club ? { "@type": "Organization", name: club.name, url: clubUrl || null } : null,
    performer: speakers.filter((s) => s && s.name).map((s) => ({ "@type": "Person", name: s.name })),
    offers:
      fee === null
        ? null
        : {
            "@type": "Offer",
            price: fee,
            priceCurrency: "INR",
            availability: `${SCHEMA}${availability(event)}`,
            url,
            validFrom: event.reg_opens_at || null,
          },
    maximumAttendeeCapacity: positive(event.capacity),
    remainingAttendeeCapacity: positive(event.capacity) && typeof event.seats_left === "number" ? Math.max(0, event.seats_left) : null,
  });
}

/** JSON for inside a <script> tag: a "</script>" in a club's text can't close it. */
export const jsonForScript = (data) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
