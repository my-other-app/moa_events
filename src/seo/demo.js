/**
 * The made-up showcase clubs, kept out of search.
 *
 * Production carries invented demo clubs (with their events and posts) so
 * the site has something to show. People can still open every one of
 * them; search engines are told to leave them be:
 *   - their pages (the club, its events, its posts) say
 *     `<meta name="robots" content="noindex, follow">`;
 *   - they are left out of the sitemaps, the find pages' and the topic and
 *     city pages' ItemLists, and they don't count towards a city page
 *     being worth indexing.
 *
 * A club is demo when the API says so (`is_demo: true`, once it sends it),
 * when its contact address (or its event's) is at demo.myotherapp.in, or
 * when its slug is on the list (DEMO_CLUB_SLUGS, else the eight below).
 * Events and posts carry only their club's slug, so the list is what
 * catches them until the API sends `is_demo`.
 *
 * One switch: DEMO_NOINDEX=off (on the Vercel project, then redeploy)
 * turns all of it off, for when real clubs have replaced the demo.
 * Server-only settings: nothing here reaches the browser.
 */

export const DEMO_EMAIL_DOMAIN = "demo.myotherapp.in";

/** The eight invented clubs seeded into production in October 2026. */
export const DEFAULT_DEMO_CLUB_SLUGS = Object.freeze([
  "borrow-checkers-kochi",
  "neural-tide",
  "thattukada-design-club",
  "pooram-sound-society",
  "founders-verandah",
  "sulaimani-striders",
  "kandal-kootam",
  "respawn-room",
]);

const OFF = new Set(["off", "0", "false", "no"]);

/**
 * The settings, from the environment:
 *   DEMO_NOINDEX      "off" (or 0, false, no) turns the whole thing off; anything else, or unset, is on
 *   DEMO_CLUB_SLUGS   comma-separated slugs; replaces the built-in list ("" for none: by address only)
 */
export function demoSettings(env = process.env) {
  const on = !OFF.has(String(env.DEMO_NOINDEX ?? "").trim().toLowerCase());
  const listed =
    typeof env.DEMO_CLUB_SLUGS === "string"
      ? env.DEMO_CLUB_SLUGS.split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : DEFAULT_DEMO_CLUB_SLUGS;
  return { on, slugs: new Set(listed) };
}

/** An address at demo.myotherapp.in or under it ("hello@neural-tide.demo.myotherapp.in"). */
export function isDemoEmail(email) {
  if (typeof email !== "string") return false;
  const domain = email.trim().toLowerCase().split("@")[1] || "";
  return domain === DEMO_EMAIL_DOMAIN || domain.endsWith(`.${DEMO_EMAIL_DOMAIN}`);
}

/** A club (a club page's, a card's or an event's club ref): demo by the API's word, its address, or its slug. */
export function isDemoClub(club, settings = demoSettings()) {
  if (!settings.on || !club) return false;
  if (club.is_demo === true) return true;
  if (isDemoEmail(club.contact_email)) return true;
  return typeof club.slug === "string" && settings.slugs.has(club.slug.toLowerCase());
}

/** An event card (its club ref inside). */
export const isDemoCard = (card, settings = demoSettings()) => Boolean(settings.on && card && (card.is_demo === true || isDemoClub(card.club, settings)));

/** An event's page (parseEventPage's): its club, or the event's own contact address. */
export const isDemoEventPage = (page, settings = demoSettings()) =>
  Boolean(settings.on && page && (page.event?.is_demo === true || isDemoClub(page.club, settings) || isDemoEmail(page.event?.contact?.email)));

/** A club's page (parseClubPage's). */
export const isDemoClubPage = (data, settings = demoSettings()) => Boolean(data && isDemoClub(data.club, settings));

/** A club's post (its club ref inside). */
export const isDemoThread = (thread, settings = demoSettings()) => Boolean(thread && isDemoClub(thread.club, settings));

/** A list without its demo items; `is` is one of the above. */
export const withoutDemo = (items, is, settings = demoSettings()) => (settings.on ? (items || []).filter((x) => !is(x, settings)) : items || []);

/**
 * A sitemap row ({slug, updated_at, club?, is_demo?}) that is demo content:
 * the API's word, a listed club (a club's row by its slug, an event's by
 * its `club` when the API sends it), or an event among `eventSlugs` (the
 * listed clubs' events, src/server/demo.js).
 */
export function isDemoSitemapRow(kind, row, { settings = demoSettings(), eventSlugs = new Set() } = {}) {
  if (!settings.on || !row) return false;
  if (row.is_demo === true) return true;
  const slug = String(row.slug || "").toLowerCase();
  if (kind === "clubs") return settings.slugs.has(slug);
  return (typeof row.club === "string" && settings.slugs.has(row.club.toLowerCase())) || eventSlugs.has(row.slug);
}

/**
 * How many of a find page's results count for search engines: its total,
 * or 0 when every one it shows is demo content (a filter that finds only
 * the made-up clubs' events is a thin page, kept out of the index).
 */
export function realTotal(page, is, settings = demoSettings()) {
  if (!settings.on || !page?.items?.length) return page?.total ?? null;
  return withoutDemo(page.items, is, settings).length ? page.total : 0;
}

/** What a demo page adds to its metadata: kept out of search, its links still followed. */
export const DEMO_ROBOTS = Object.freeze({ index: false, follow: true });

/** A page's metadata, kept out of search when `demo` (the rest unchanged). */
export const unlessDemo = (metadata, demo) => (demo ? { ...metadata, robots: DEMO_ROBOTS } : metadata);
