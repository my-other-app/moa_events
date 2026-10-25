/**
 * The structured data search engines read off the site's pages
 * (schema.org, as JSON-LD). Pure functions of the API's data, so they are
 * tested on their own (jsonld.test.js) and shared by the pages and the
 * link-preview function.
 *
 * Every image here is a stable address on the site (/media/..., /og/...),
 * never a presigned S3 link: a crawler keeps what it read for weeks.
 */
import { APP_STORE_URL, CONTACT_EMAIL, PLAY_STORE_URL, SITE_NAME, SITE_URL, SOCIAL_PROFILES } from "@/config";
import { addressOf, cityOf } from "./cities";
import { istIso } from "./time";

const SCHEMA = "https://schema.org/";

const positive = (v) => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

const isHttp = (v) => typeof v === "string" && /^https?:\/\//i.test(v);

/** Drops empty values (null, "", []) all the way down, so no field is ever there with nothing in it. */
export function clean(o) {
  if (Array.isArray(o)) return o.map(clean).filter((v) => v !== null && v !== undefined);
  if (!o || typeof o !== "object") return o;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const c = clean(v);
    if (c === null || c === undefined || c === "" || (Array.isArray(c) && !c.length)) continue;
    if (typeof c === "object" && !Array.isArray(c) && !Object.keys(c).length) continue;
    out[k] = c;
  }
  return out;
}

/** JSON for inside a <script> tag: a "</script>" in a club's text can't close it. */
export const jsonForScript = (data) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

/** When it ends: the end it was given, or the start plus its length. */
function endOf(event) {
  if (event.ends_at) return event.ends_at;
  const hours = positive(event.duration_hours);
  const start = event.starts_at ? new Date(event.starts_at) : null;
  if (!hours || !start || Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + hours * 3600 * 1000).toISOString();
}

/**
 * schema.org's availability for the ticket: InStock while registration is
 * open, PreOrder before it opens, SoldOut once it is full or closed (or the
 * event is over, or cancelled).
 */
export function availability(event, now = Date.now()) {
  if (event.status === "full") return "SoldOut";
  if (event.status === "ended" || event.status === "cancelled") return "SoldOut";
  if (event.registration_open) return "InStock";
  const opens = event.reg_opens_at ? new Date(event.reg_opens_at) : null;
  if (opens && !Number.isNaN(opens.getTime()) && opens.getTime() > now) return "PreOrder";
  return "SoldOut";
}

const hasPoint = (e) => typeof e.lat === "number" && typeof e.lng === "number" && !(e.lat === 0 && e.lng === 0);

/** How the API may say it outright (`attendance_mode`, newer APIs); otherwise it is worked out. */
const MODE_WORDS = {
  in_person: "OfflineEventAttendanceMode",
  offline: "OfflineEventAttendanceMode",
  online: "OnlineEventAttendanceMode",
  mixed: "MixedEventAttendanceMode",
  hybrid: "MixedEventAttendanceMode",
};

/** Offline, online, or both: as the API says, else an online event that also has a pinned venue is mixed. */
export function attendanceMode(event) {
  const said = MODE_WORDS[String(event.attendance_mode || "").toLowerCase()];
  if (said) return said;
  if (!event.is_online) return "OfflineEventAttendanceMode";
  return hasPoint(event) ? "MixedEventAttendanceMode" : "OnlineEventAttendanceMode";
}

/** What the API may say of an event's state (`event_status`, newer APIs); anything else is as planned. */
const STATUS_WORDS = {
  scheduled: "EventScheduled",
  cancelled: "EventCancelled",
  canceled: "EventCancelled",
  postponed: "EventPostponed",
  rescheduled: "EventRescheduled",
  moved_online: "EventMovedOnline",
};

/**
 * schema.org's eventStatus. An event that has happened (or is happening) as
 * planned stays EventScheduled: Google reads the dates for "past", and
 * EventScheduled is what it asks for an event that wasn't called off or moved.
 * An event its club cancelled says so in its own `status` too.
 */
export function eventStatus(event) {
  if (event.status === "cancelled") return "EventCancelled";
  return STATUS_WORDS[String(event.event_status || "").toLowerCase()] || "EventScheduled";
}

/**
 * The venue's PostalAddress: its words as the street address, and the city,
 * state and PIN code, as the API says them (newer APIs) or as worked out
 * from its words and point (./cities.js). Always in India.
 */
function postalAddress(place, street) {
  const derived = addressOf(place);
  return {
    "@type": "PostalAddress",
    streetAddress: street,
    addressLocality: place.locality || derived.addressLocality,
    addressRegion: place.region || derived.addressRegion,
    postalCode: place.postal_code || derived.postalCode,
    addressCountry: "IN",
  };
}

function place(event) {
  const name = event.location_name && !/^online$/i.test(event.location_name.trim()) ? event.location_name : null;
  return {
    "@type": "Place",
    name: name || "Venue to be announced",
    address: postalAddress(event, name),
    geo: hasPoint(event) ? { "@type": "GeoCoordinates", latitude: event.lat, longitude: event.lng } : null,
    hasMap: isHttp(event.location_link) ? event.location_link : null,
  };
}

function location(event, url) {
  const mode = attendanceMode(event);
  const virtual = { "@type": "VirtualLocation", url };
  if (mode === "OnlineEventAttendanceMode") return virtual;
  if (mode === "MixedEventAttendanceMode") return [place(event), virtual];
  return place(event);
}

function offer(event, url) {
  const fee = event.has_fee ? positive(event.fee) : 0;
  if (fee === null) return null;
  return {
    "@type": "Offer",
    price: fee,
    priceCurrency: "INR",
    availability: `${SCHEMA}${availability(event)}`,
    validFrom: istIso(event.reg_opens_at),
    url,
  };
}

/**
 * The Event for an event's page.
 *
 *   event, club, speakers   as parseEventPage reads them
 *   url                     the canonical page (absolute)
 *   images                  absolute picture addresses, the poster's first
 *   clubUrl, clubLogo       absolute, or null
 *   description             plain text
 *   speakerImage(s, i)      an absolute photo address for a speaker, or null
 *   topics                  [{name, url}]: what it is about (its topics' pages, absolute)
 */
export function eventJsonLd({ event, club = null, speakers = [], url, images = [], image = null, clubUrl = null, clubLogo = null, description = null, speakerImage = () => null, topics = [] }) {
  if (!event) return null;
  const fee = event.has_fee ? positive(event.fee) : 0;
  const pictures = [...(image ? [image] : []), ...images].filter(isHttp);
  const words = [...new Set([...topics.map((t) => t.name), ...(Array.isArray(event.interests) ? event.interests : [])].filter(Boolean))];
  return clean({
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: description || null,
    startDate: istIso(event.starts_at),
    endDate: istIso(endOf(event)),
    eventStatus: `${SCHEMA}${eventStatus(event)}`,
    previousStartDate: eventStatus(event) === "EventRescheduled" ? istIso(event.previous_starts_at) : null,
    eventAttendanceMode: `${SCHEMA}${attendanceMode(event)}`,
    location: location(event, url),
    image: [...new Set(pictures)],
    url,
    inLanguage: "en-IN",
    isAccessibleForFree: fee === 0 ? true : null,
    about: topics.map((t) => ({ "@type": "Thing", name: t.name, url: isHttp(t.url) ? t.url : null })),
    keywords: words.length ? words.join(", ") : null,
    organizer: club
      ? { "@type": "Organization", "@id": clubUrl ? `${clubUrl}#organization` : null, name: club.name, url: clubUrl, logo: isHttp(clubLogo) ? clubLogo : null }
      : null,
    performer: speakers
      .filter((s) => s && s.name)
      .map((s, i) => ({
        "@type": "Person",
        name: s.name,
        jobTitle: s.designation || null,
        description: s.bio ? String(s.bio).slice(0, 300) : null,
        image: speakerImage(s, i),
        sameAs: isHttp(s.link) ? [s.link] : null,
      })),
    offers: offer(event, url),
    maximumAttendeeCapacity: positive(event.capacity),
    remainingAttendeeCapacity: positive(event.capacity) && typeof event.seats_left === "number" ? Math.max(0, event.seats_left) : null,
  });
}

/** A short Event for a list (a club's upcoming events): an event card as the API sends it. */
export function eventCardJsonLd(card, { url, image = null, organizer = null }) {
  const fee = card.has_fee ? positive(card.fee) : 0;
  return clean({
    "@type": "Event",
    name: card.name,
    url,
    startDate: istIso(card.starts_at),
    endDate: istIso(card.ends_at),
    eventStatus: `${SCHEMA}${eventStatus(card)}`,
    eventAttendanceMode: `${SCHEMA}${attendanceMode(card)}`,
    location: location(card, url),
    image: isHttp(image) ? [image] : null,
    organizer,
    offers:
      fee === null
        ? null
        : { "@type": "Offer", price: fee, priceCurrency: "INR", availability: `${SCHEMA}${card.status === "full" || card.status === "ended" ? "SoldOut" : "InStock"}`, url },
  });
}

/** Home › … › here, as a BreadcrumbList: `items` are [name, absolute url]. */
export function breadcrumbJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
  };
}

const SOCIAL_KEYS = ["instagram", "linkedin", "youtube", "x", "website"];

/**
 * The Organization for a club's page, with its upcoming events.
 *   data      parseClubPage's result
 *   url       the club page (absolute); logo, image: absolute or null
 *   events    [{card, url, image}] for the upcoming events
 * What it knows about: its topics' names (when the API sends them), then its interests.
 */
export function clubJsonLd({ club, url, logo = null, image = null, description = null, events = [] }) {
  if (!club) return null;
  const sameAs = [...SOCIAL_KEYS.map((k) => club.socials?.[k]), club.website_url].filter(isHttp);
  const knows = [...new Set([...(club.topics || []).map((t) => t.name), ...(club.interests || [])].filter(Boolean))];
  const organizer = { "@type": "Organization", name: club.name, url };
  // Where it is: its city when its words name one ("Panampilly Nagar, Kochi"), else its words.
  const city = cityOf({ location_name: club.location_name });
  return clean({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${url}#organization`,
    name: club.name,
    url,
    logo: isHttp(logo) ? logo : null,
    image: isHttp(image) ? image : null,
    description: description || club.tagline || null,
    slogan: club.tagline || null,
    email: club.contact_email || null,
    address: club.location_name
      ? { "@type": "PostalAddress", addressLocality: city ? city.name : club.location_name, addressRegion: city ? city.state : null, addressCountry: "IN" }
      : null,
    areaServed: city ? { "@type": "City", name: city.name, containedInPlace: { "@type": "State", name: city.state } } : null,
    knowsAbout: knows.length ? knows : null,
    sameAs: [...new Set(sameAs)],
    event: events.map((e) => eventCardJsonLd(e.card, { url: e.url, image: e.image, organizer })),
  });
}

/** The site itself, for the home page: who runs it, and how to search it. */
export function siteJsonLd() {
  const org = `${SITE_URL}/#organization`;
  return [
    clean({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": org,
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/brand/logo-icon.png`, width: 312, height: 312 },
      email: CONTACT_EMAIL,
      // India, starting in Kerala.
      areaServed: [
        { "@type": "Country", name: "India" },
        { "@type": "State", name: "Kerala" },
      ],
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, areaServed: "IN", availableLanguage: ["en"] },
      sameAs: [...SOCIAL_PROFILES, PLAY_STORE_URL, APP_STORE_URL].filter(isHttp),
    }),
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: "en-IN",
      publisher: { "@id": org },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/events?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ];
}

/**
 * A list of things that each have their own page (the events or clubs a
 * find page shows): an ItemList of ListItems, each its position, address
 * and name, in the order shown — Google's "summary page" shape.
 *   items   [{url, name}], urls absolute
 */
export function itemListJsonLd({ name, url, items, id = null }) {
  return clean({
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": id,
    name,
    url,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, url: it.url, name: it.name || null })),
  });
}

/**
 * A page that is a collection of other pages (/topics, a topic's page):
 * its name and words, what it is about, and the list it shows, by @id (the
 * ItemList goes alongside, as its own object).
 *   about   {name, url?} or null; list: the ItemList's @id or null
 */
export function collectionPageJsonLd({ name, description = null, url, image = null, about = null, list = null }) {
  return clean({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    name,
    description: description || null,
    url,
    image: isHttp(image) ? image : null,
    inLanguage: "en-IN",
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: about ? { "@type": "Thing", name: about.name, url: isHttp(about.url) ? about.url : null } : null,
    mainEntity: list ? { "@id": list } : null,
  });
}

const counter = (type, n) => ({ "@type": "InteractionCounter", interactionType: `${SCHEMA}${type}`, userInteractionCount: Math.max(0, Math.floor(Number(n) || 0)) });

/**
 * A club's post, as Google reads a forum post (DiscussionForumPosting):
 * who posted it (the club), when, what it says and shows, how many liked
 * it and how many comments it has, and the comments shown with it.
 *   comments   [{text, author: {name, is_club}, datePublished}]
 */
export function discussionPostingJsonLd({ url, headline, text, image = null, author, datePublished, likes = 0, commentCount = 0, comments = [], isPartOf = null }) {
  return clean({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": `${url}#post`,
    mainEntityOfPage: url,
    url,
    headline,
    text: text || null,
    image: isHttp(image) ? image : null,
    author: author ? { "@type": "Organization", name: author.name, url: isHttp(author.url) ? author.url : null } : null,
    datePublished: istIso(datePublished),
    isPartOf: isPartOf ? { "@type": "WebPage", "@id": isPartOf, url: isPartOf } : null,
    interactionStatistic: [counter("LikeAction", likes), counter("CommentAction", commentCount)],
    commentCount: Math.max(0, Math.floor(Number(commentCount) || 0)),
    comment: comments.map((c) => ({
      "@type": "Comment",
      text: c.text,
      datePublished: istIso(c.datePublished),
      author: { "@type": c.author?.is_club ? "Organization" : "Person", name: c.author?.name || "Someone" },
    })),
  });
}
