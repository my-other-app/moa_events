/**
 * Checks for what the site publishes for machines, standing in for Google's
 * Rich Results Test and the W3C feed validator (neither is reachable from a
 * build). Used by the tests and by scripts/check-seo.mjs against a running
 * site. Each returns {errors, warnings}: errors break the rich result or
 * the feed, warnings are fields Google recommends.
 *
 * Event: https://developers.google.com/search/docs/appearance/structured-data/event
 * RSS 2.0: https://www.rssboard.org/rss-specification
 */

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ABS = /^https?:\/\/[^\s]+$/i;
const SCHEMA = "https://schema.org/";
const STATUSES = ["EventScheduled", "EventCancelled", "EventMovedOnline", "EventPostponed", "EventRescheduled"].map((s) => SCHEMA + s);
const MODES = ["OfflineEventAttendanceMode", "OnlineEventAttendanceMode", "MixedEventAttendanceMode"].map((s) => SCHEMA + s);
const AVAILABILITY = ["InStock", "SoldOut", "PreOrder", "LimitedAvailability", "OnlineOnly", "OutOfStock", "Discontinued", "PreSale", "BackOrder"].map((s) => SCHEMA + s);

const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** {errors, warnings}, with err() and warn() to add to them (not enumerable: the result compares as just the two lists). */
function result() {
  const errors = [];
  const warnings = [];
  return Object.defineProperties(
    { errors, warnings },
    { err: { value: (m) => errors.push(m) }, warn: { value: (m) => warnings.push(m) } }
  );
}

function checkPlace(p, r, at) {
  if (!p.name) r.warn(`${at}.name is missing`);
  const address = p.address;
  if (!address) r.err(`${at}.address is required for an offline event`);
  else if (typeof address === "object") {
    if (address["@type"] !== "PostalAddress") r.err(`${at}.address must be a PostalAddress`);
    if (!address.streetAddress && !address.addressLocality && !address.addressRegion && !address.addressCountry) r.err(`${at}.address says nothing`);
    for (const k of ["streetAddress", "addressLocality", "addressRegion", "postalCode", "addressCountry"]) if (!address[k]) r.warn(`${at}.address.${k} is recommended`);
  }
  if (p.geo) {
    const { latitude, longitude } = p.geo;
    if (typeof latitude !== "number" || Math.abs(latitude) > 90 || typeof longitude !== "number" || Math.abs(longitude) > 180) r.err(`${at}.geo has bad coordinates`);
  }
}

/** A schema.org Event, as Google's event rich result reads it. */
export function validateEvent(ld, { nested = false } = {}) {
  const r = result();
  if (!ld || typeof ld !== "object") {
    r.err("no Event");
    return r;
  }
  if (!nested && ld["@context"] !== "https://schema.org") r.err('@context must be "https://schema.org"');
  if (ld["@type"] !== "Event") r.err('@type must be "Event"');
  if (!ld.name) r.err("name is required");
  if (!ld.startDate) r.err("startDate is required");
  else if (!ISO_WITH_ZONE.test(ld.startDate)) r.err(`startDate "${ld.startDate}" must be ISO 8601 with a time zone`);
  if (!ld.endDate) r.warn("endDate is recommended");
  else if (!ISO_WITH_ZONE.test(ld.endDate)) r.err(`endDate "${ld.endDate}" must be ISO 8601 with a time zone`);
  else if (ld.startDate && Date.parse(ld.endDate) < Date.parse(ld.startDate)) r.err("endDate is before startDate");
  if (!ld.eventStatus) r.warn("eventStatus is recommended");
  else if (!STATUSES.includes(ld.eventStatus)) r.err(`eventStatus "${ld.eventStatus}" isn't one schema.org knows`);
  if (!ld.eventAttendanceMode) r.warn("eventAttendanceMode is recommended");
  else if (!MODES.includes(ld.eventAttendanceMode)) r.err(`eventAttendanceMode "${ld.eventAttendanceMode}" isn't one schema.org knows`);

  const locations = asList(ld.location);
  if (!locations.length) r.err("location is required");
  locations.forEach((loc, i) => {
    const at = locations.length > 1 ? `location[${i}]` : "location";
    if (loc["@type"] === "Place") checkPlace(loc, r, at);
    else if (loc["@type"] === "VirtualLocation") {
      if (!ABS.test(loc.url || "")) r.err(`${at}.url must be an absolute URL`);
    } else r.err(`${at} must be a Place or a VirtualLocation`);
  });
  const mode = ld.eventAttendanceMode;
  const types = locations.map((l) => l["@type"]);
  if (mode === SCHEMA + "OfflineEventAttendanceMode" && !types.includes("Place")) r.err("an offline event needs a Place");
  if (mode === SCHEMA + "OnlineEventAttendanceMode" && !types.includes("VirtualLocation")) r.err("an online event needs a VirtualLocation");
  if (mode === SCHEMA + "MixedEventAttendanceMode" && !(types.includes("Place") && types.includes("VirtualLocation"))) r.err("a mixed event needs a Place and a VirtualLocation");

  if (!nested && !ld.description) r.warn("description is recommended");
  const images = asList(ld.image);
  if (!images.length) r.warn("image is recommended");
  images.forEach((img) => {
    const u = typeof img === "string" ? img : img?.url;
    if (!ABS.test(u || "")) r.err(`image "${u}" must be an absolute URL`);
  });
  if (ld.url && !ABS.test(ld.url)) r.err("url must be absolute");

  const offers = asList(ld.offers);
  if (!offers.length) r.warn("offers is recommended");
  offers.forEach((o, i) => {
    const at = offers.length > 1 ? `offers[${i}]` : "offers";
    if (o["@type"] !== "Offer") r.err(`${at} must be an Offer`);
    if (typeof o.price !== "number" || o.price < 0) r.err(`${at}.price must be a number`);
    if (!/^[A-Z]{3}$/.test(o.priceCurrency || "")) r.err(`${at}.priceCurrency must be a 3-letter code`);
    if (!o.availability) r.warn(`${at}.availability is recommended`);
    else if (!AVAILABILITY.includes(o.availability)) r.err(`${at}.availability "${o.availability}" isn't one schema.org knows`);
    if (!ABS.test(o.url || "")) r.warn(`${at}.url is recommended (absolute)`);
    if (!nested && !o.validFrom) r.warn(`${at}.validFrom is recommended`);
    else if (o.validFrom && !ISO_WITH_ZONE.test(o.validFrom)) r.err(`${at}.validFrom must be ISO 8601 with a time zone`);
  });

  if (!ld.organizer) r.warn("organizer is recommended");
  else {
    for (const o of asList(ld.organizer)) {
      if (!["Organization", "Person"].includes(o["@type"])) r.err("organizer must be an Organization or a Person");
      if (!o.name) r.err("organizer.name is required");
      if (!ABS.test(o.url || "")) r.warn("organizer.url is recommended");
    }
  }
  if (!nested && !asList(ld.performer).length) r.warn("performer is recommended");
  for (const p of asList(ld.performer)) {
    if (!["Person", "PerformingGroup", "Organization"].includes(p["@type"])) r.err("performer must be a Person (or a group)");
    if (!p.name) r.err("performer.name is required");
  }
  return r;
}

/** A BreadcrumbList: positions 1…n, each with a name and an absolute item. */
export function validateBreadcrumbs(ld) {
  const r = result();
  if (ld?.["@type"] !== "BreadcrumbList") r.err('@type must be "BreadcrumbList"');
  const items = asList(ld?.itemListElement);
  if (items.length < 2) r.err("a breadcrumb trail needs at least two items");
  items.forEach((it, i) => {
    if (it["@type"] !== "ListItem") r.err(`item ${i + 1} must be a ListItem`);
    if (it.position !== i + 1) r.err(`item ${i + 1} has position ${it.position}`);
    if (!it.name) r.err(`item ${i + 1} needs a name`);
    if (i < items.length - 1 && !ABS.test(it.item || "")) r.err(`item ${i + 1} needs an absolute item URL`);
  });
  return r;
}

/** An Organization (a club, or the site), with its events if it lists them. */
export function validateOrganization(ld) {
  const r = result();
  if (ld?.["@type"] !== "Organization") r.err('@type must be "Organization"');
  if (!ld?.name) r.err("name is required");
  if (!ABS.test(ld?.url || "")) r.err("url must be absolute");
  const logo = typeof ld?.logo === "object" ? ld.logo?.url : ld?.logo;
  if (!logo) r.warn("logo is recommended");
  else if (!ABS.test(logo)) r.err("logo must be absolute");
  for (const s of asList(ld?.sameAs)) if (!ABS.test(s)) r.err(`sameAs "${s}" must be absolute`);
  asList(ld?.event).forEach((e, i) => {
    const sub = validateEvent(e, { nested: true });
    sub.errors.forEach((m) => r.err(`event[${i}]: ${m}`));
  });
  return r;
}

/**
 * An ItemList of pages (a "summary page" carousel): ListItems at positions
 * 1…n, each with an absolute url, no address twice.
 * https://developers.google.com/search/docs/appearance/structured-data/carousel
 */
export function validateItemList(ld) {
  const r = result();
  if (ld?.["@context"] !== "https://schema.org") r.err('@context must be "https://schema.org"');
  if (ld?.["@type"] !== "ItemList") r.err('@type must be "ItemList"');
  const items = asList(ld?.itemListElement);
  if (!items.length) r.warn("an empty list");
  const seen = new Set();
  items.forEach((it, i) => {
    if (it["@type"] !== "ListItem") r.err(`item ${i + 1} must be a ListItem`);
    if (it.position !== i + 1) r.err(`item ${i + 1} has position ${it.position}`);
    if (!ABS.test(it.url || "")) r.err(`item ${i + 1} needs an absolute url`);
    if (seen.has(it.url)) r.err(`item ${i + 1}: ${it.url} is listed twice`);
    seen.add(it.url);
    if (!it.name) r.warn(`item ${i + 1}: name is recommended`);
  });
  if (ld?.numberOfItems !== undefined && ld.numberOfItems !== items.length) r.err(`numberOfItems is ${ld.numberOfItems} for ${items.length} items`);
  return r;
}

const COUNTERS = ["LikeAction", "CommentAction", "WriteAction", "ShareAction", "FollowAction", "ViewAction"].map((s) => SCHEMA + s);

function checkAuthor(a, r, at) {
  if (!a) {
    r.err(`${at}author is required`);
    return;
  }
  for (const x of asList(a)) {
    if (!["Person", "Organization"].includes(x["@type"])) r.err(`${at}author must be a Person or an Organization`);
    if (!x.name) r.err(`${at}author.name is required`);
  }
}

/**
 * A forum post, as Google's discussion forum rich result reads it: an
 * author with a name, when it was posted, and words or a picture; the
 * counts and comments it carries well formed.
 * https://developers.google.com/search/docs/appearance/structured-data/discussion-forum
 */
export function validateDiscussionPosting(ld) {
  const r = result();
  if (ld?.["@context"] !== "https://schema.org") r.err('@context must be "https://schema.org"');
  if (!["DiscussionForumPosting", "SocialMediaPosting"].includes(ld?.["@type"])) r.err('@type must be "DiscussionForumPosting"');
  checkAuthor(ld?.author, r, "");
  for (const a of asList(ld?.author)) if (!ABS.test(a?.url || "")) r.warn("author.url is recommended");
  if (!ld?.datePublished) r.err("datePublished is required");
  else if (!ISO_WITH_ZONE.test(ld.datePublished)) r.err("datePublished must be ISO 8601 with a time zone");
  if (!ld?.text && !asList(ld?.image).length && !ld?.video) r.err("text, image or video is required");
  if (!ld?.headline) r.warn("headline is recommended");
  if (!ABS.test(ld?.url || "")) r.warn("url is recommended (absolute)");
  for (const img of asList(ld?.image)) if (!ABS.test(typeof img === "string" ? img : img?.url || "")) r.err("image must be an absolute URL");
  const stats = asList(ld?.interactionStatistic);
  if (!stats.length) r.warn("interactionStatistic is recommended");
  stats.forEach((s, i) => {
    if (s["@type"] !== "InteractionCounter") r.err(`interactionStatistic[${i}] must be an InteractionCounter`);
    if (!COUNTERS.includes(s.interactionType)) r.err(`interactionStatistic[${i}].interactionType "${s.interactionType}" isn't one schema.org knows`);
    if (!Number.isInteger(s.userInteractionCount) || s.userInteractionCount < 0) r.err(`interactionStatistic[${i}].userInteractionCount must be a whole number`);
  });
  if (ld?.commentCount !== undefined && (!Number.isInteger(ld.commentCount) || ld.commentCount < 0)) r.err("commentCount must be a whole number");
  asList(ld?.comment).forEach((c, i) => {
    const at = `comment[${i}].`;
    if (c["@type"] !== "Comment") r.err(`${at}@type must be "Comment"`);
    checkAuthor(c.author, r, at);
    if (!c.datePublished) r.err(`${at}datePublished is required`);
    else if (!ISO_WITH_ZONE.test(c.datePublished)) r.err(`${at}datePublished must be ISO 8601 with a time zone`);
    if (!c.text && !c.image && !c.video) r.err(`${at}text, image or video is required`);
  });
  return r;
}

/** The clubs' plans: a SoftwareApplication with an Offer per plan and cycle, each priced. */
export function validateSoftwareApplication(ld) {
  const r = result();
  if (ld?.["@context"] !== "https://schema.org") r.err('@context must be "https://schema.org"');
  if (ld?.["@type"] !== "SoftwareApplication") r.err('@type must be "SoftwareApplication"');
  if (!ld?.name) r.err("name is required");
  if (!ld?.applicationCategory) r.warn("applicationCategory is recommended");
  const offers = asList(ld?.offers);
  if (!offers.length) r.err("offers is required");
  offers.forEach((o, i) => {
    const at = `offers[${i}]`;
    if (o["@type"] !== "Offer") r.err(`${at} must be an Offer`);
    if (typeof o.price !== "number" || o.price < 0) r.err(`${at}.price must be a number`);
    if (!/^[A-Z]{3}$/.test(o.priceCurrency || "")) r.err(`${at}.priceCurrency must be a 3-letter code`);
    if (!ABS.test(o.url || "")) r.warn(`${at}.url is recommended (absolute)`);
  });
  return r;
}

const RFC822 = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} (GMT|[+-]\d{4})$/;

const NS = {
  atom: "http://www.w3.org/2005/Atom",
  dc: "http://purl.org/dc/elements/1.1/",
  ev: "http://purl.org/rss/1.0/modules/event/",
};

/** An RSS 2.0 feed, parsed by `parse(text)` (a strict XML parser that throws on bad XML). */
export function validateRss(text, parse) {
  const r = result();
  let doc;
  try {
    doc = parse(text);
  } catch (e) {
    r.err(`not well-formed XML: ${e.message}`);
    return r;
  }
  const root = doc.documentElement;
  if (root.tagName !== "rss" || root.getAttribute("version") !== "2.0") r.err('the root must be <rss version="2.0">');
  const channels = [...root.children].filter((c) => c.tagName === "channel");
  if (channels.length !== 1) {
    r.err("there must be exactly one <channel>");
    return r;
  }
  const channel = channels[0];
  const kid = (el, tag) => [...el.children].find((c) => c.tagName === tag);
  const text_ = (el, tag) => kid(el, tag)?.textContent ?? null;
  for (const tag of ["title", "link", "description"]) if (!text_(channel, tag)) r.err(`<channel> needs <${tag}>`);
  if (text_(channel, "link") && !ABS.test(text_(channel, "link"))) r.err("<channel><link> must be absolute");
  const build = text_(channel, "lastBuildDate");
  if (!build) r.warn("<lastBuildDate> is recommended");
  else if (!RFC822.test(build)) r.err(`<lastBuildDate> "${build}" must be RFC 822`);
  const ttl = text_(channel, "ttl");
  if (ttl !== null && !/^\d+$/.test(ttl)) r.err("<ttl> must be a number of minutes");
  const self = [...channel.children].find((c) => c.localName === "link" && c.namespaceURI === NS.atom);
  if (!self) r.warn("<atom:link rel=\"self\"> is recommended");
  else if (self.getAttribute("rel") !== "self" || !ABS.test(self.getAttribute("href") || "")) r.err("<atom:link> must be rel=\"self\" with an absolute href");
  for (const [prefix, uri] of Object.entries(NS)) {
    if (text.includes(`<${prefix}:`) && root.getAttribute(`xmlns:${prefix}`) !== uri) r.err(`the ${prefix}: namespace must be declared as ${uri}`);
  }
  const items = [...channel.children].filter((c) => c.tagName === "item");
  const guids = new Set();
  items.forEach((item, i) => {
    const at = `item ${i + 1}`;
    if (!text_(item, "title") && !text_(item, "description")) r.err(`${at} needs a <title> or a <description>`);
    const link = text_(item, "link");
    if (link !== null && !ABS.test(link)) r.err(`${at}: <link> must be absolute`);
    const guid = kid(item, "guid");
    if (guid) {
      const perma = guid.getAttribute("isPermaLink");
      if (perma !== "false" && !ABS.test(guid.textContent)) r.err(`${at}: a permalink <guid> must be an absolute URL`);
      if (guids.has(guid.textContent)) r.err(`${at}: <guid> repeats`);
      guids.add(guid.textContent);
    } else r.warn(`${at}: <guid> is recommended`);
    const pub = text_(item, "pubDate");
    if (pub !== null && !RFC822.test(pub)) r.err(`${at}: <pubDate> "${pub}" must be RFC 822`);
    const enclosure = kid(item, "enclosure");
    if (enclosure) {
      if (!ABS.test(enclosure.getAttribute("url") || "")) r.err(`${at}: <enclosure> needs an absolute url`);
      if (!/^\d+$/.test(enclosure.getAttribute("length") || "")) r.err(`${at}: <enclosure> needs a length`);
      if (!/^[a-z]+\/[a-z0-9.+-]+$/i.test(enclosure.getAttribute("type") || "")) r.err(`${at}: <enclosure> needs a MIME type`);
    }
    for (const c of item.children) {
      if (c.namespaceURI === NS.ev && (c.localName === "startdate" || c.localName === "enddate") && !ISO_WITH_ZONE.test(c.textContent)) {
        r.err(`${at}: <ev:${c.localName}> must be ISO 8601 with a time zone`);
      }
    }
  });
  return r;
}
