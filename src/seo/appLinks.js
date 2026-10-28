/**
 * The two files that let the phone apps open the site's links (universal
 * links on iPhone, App Links on Android), served from /.well-known/ by the
 * route handlers next to them in src/app/.well-known/.
 *
 * Only myotherapp.in is claimed: www. and events. answer every path,
 * /.well-known/ included, with a 308 to the apex, and neither Apple nor
 * Google follows a redirect for these files. Links in emails and shares
 * already use the apex (SITE_URL).
 *
 * What the app opens itself (the app's router maps each one to its screen,
 * lib/app/router/web_links.dart in moa_mobileapp):
 *
 *   /events?…                       Find events, with the same filters
 *   /events/{slug or id}            the event's page
 *   /events/{slug}/register         registration
 *   /events/{slug}/compete          the team and submission
 *   /clubs?…, /clubs/{slug}         the clubs directory, a club's page
 *   /threads, /threads/{id}         every club's posts, a post
 *   /tickets/{id}                   the ticket (its QR works offline)
 *   /certificates/{id}              the certificate
 *   /topics, /topics/{slug}         the topics, a topic
 *   /feedback/{event}/{reg}?k=      the survey from the email
 *   /events/{slug}/live             the live room (native in the app)
 *   /play/{event}                   the quiz, as a player
 *   /claim/{token}                  a waiting list's offer: claim the place
 *                                   that opened up, or pass it on
 *                                   (moa_mobileapp#69; the app's Android
 *                                   intent filter lists /claim/ too)
 *   /requests/{token}               a request for a place, where the club
 *                                   confirms each one: where it stands,
 *                                   withdrawing it (moa_mobileapp's
 *                                   feat/registration-approval)
 *
 * What stays in the browser, and why:
 *   - the feeds (rss.xml) under /events, /clubs and /topics: a feed reader's
 *     link, not a page.
 *   - /api, /og, /media, /for-clubs, /pricing: web-only pages and the
 *     server's own addresses. They sit outside the claimed paths anyway;
 *     they are listed so a wider claim later can't take them.
 *   - /events/in and /clubs/in/…: the city pages ("Events in Kochi") are
 *     the site's own; the app has no screen for them (its router would
 *     read /events/in as an event called "in").
 *   - the home page, the policies, /about and /me: not claimed.
 *
 * The live room and the quiz were left to the browser while the app showed
 * them as this site's page; the app has them as screens of its own now
 * (moa_mobileapp#65), so a QR on the screen opens them there.
 *
 * Android's intent filters cannot leave a path out: its router sends
 * anything it can't show to the browser.
 */

/** The iOS app: Team ID and bundle id. */
export const IOS_APP_ID = "PX6QV826X4.app.myotherapp.in";

/** The Android app's package. */
export const ANDROID_PACKAGE = "app.myotherapp.in";

/** The paths the apps open. */
export const APP_PATHS = [
  "/events",
  "/events/*",
  "/clubs",
  "/clubs/*",
  "/threads",
  "/threads/*",
  "/tickets/*",
  "/certificates/*",
  "/topics",
  "/topics/*",
  "/feedback/*",
  "/play/*",
  "/claim/*",
  "/requests/*",
];

/** The paths that stay in the browser, checked first (the first match wins). */
export const BROWSER_PATHS = [
  ["/events/in", "The city pages are the site's own"],
  ["/events/in/*", "The city pages are the site's own"],
  ["/clubs/in", "The city pages are the site's own"],
  ["/clubs/in/*", "The city pages are the site's own"],
  ["/events/rss.xml", "A feed"],
  ["/clubs/*/rss.xml", "A feed"],
  ["/topics/*/rss.xml", "A feed"],
  ["/api/*", "The server's functions"],
  ["/og/*", "Share pictures"],
  ["/media/*", "Pictures"],
  ["/for-clubs", "For clubs"],
  ["/pricing", "Pricing"],
];

/** /.well-known/apple-app-site-association: the iOS app opens APP_PATHS, less BROWSER_PATHS. */
export function appleAppSiteAssociation() {
  return {
    applinks: {
      details: [
        {
          appIDs: [IOS_APP_ID],
          components: [
            ...BROWSER_PATHS.map(([path, comment]) => ({ "/": path, exclude: true, comment })),
            ...APP_PATHS.map((path) => ({ "/": path })),
          ],
        },
      ],
    },
  };
}

const HEX_PAIRS = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * The SHA-256 fingerprints in `value` (ANDROID_APP_SHA256: comma-separated),
 * as Google wants them: upper-case hex pairs joined by colons. Accepts them
 * with or without colons, in either case; anything that isn't a 32-byte
 * fingerprint is left out (a SHA-1 pasted by mistake would make the whole
 * file wrong for no one to notice).
 */
export function readFingerprints(value) {
  if (typeof value !== "string") return [];
  const out = [];
  for (const raw of value.split(",")) {
    const bare = raw.trim().toUpperCase().replace(/[^0-9A-F]/g, "");
    if (bare.length !== 64) continue;
    const pairs = bare.match(/../g).join(":");
    if (HEX_PAIRS.test(pairs) && !out.includes(pairs)) out.push(pairs);
  }
  return out;
}

/**
 * /.well-known/assetlinks.json: the Android app may open this site's links.
 * Signed by the keys in ANDROID_APP_SHA256 (the Play App Signing key's
 * SHA-256, from Play Console → Test and release → App integrity; add the
 * upload key's too to test a locally signed build). Unset, it is an empty
 * list: valid, and claiming nothing, so links stay in the browser.
 */
export function assetLinks(fingerprints = readFingerprints(process.env.ANDROID_APP_SHA256)) {
  if (!fingerprints.length) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/** Both files are JSON, answered as they are: no redirect, cached an hour. */
export function jsonFile(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
