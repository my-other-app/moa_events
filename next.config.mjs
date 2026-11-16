/**
 * The public site at https://myotherapp.in, on Next.js (App Router).
 *
 * Routing lives in src/app. What is configured here:
 *   - /me → /me/tickets, and /events/{id} handed to the old-address page;
 *   - a city's other names to its page (/events/in/cochin → /events/in/kochi);
 *   - metadata always in <head>, never streamed into <body> (canonical tags
 *     only count in the head);
 *   - the find pages (/events, /clubs) and a topic's page (/topics/{slug})
 *     kept a minute at the edge (Vercel's, or Cloudflare's where a Cache
 *     Rule lets it): they are rendered per request, but their HTML depends
 *     on the address alone;
 *   - on every address, no framing, no sniffing, the origin alone in a
 *     Referer, and the script policy (SITE_HEADERS): sent as a report only
 *     unless the build sets CSP_ENFORCE=on;
 *   - the certificate check (/verify) never framed by another site, and the
 *     addresses that are themselves a credential -- a check's result
 *     (/verify/{number}), a ticket (/tickets/{id}), a guest's certificate
 *     (/certificates/{id}), a survey link (/feedback/...), a missing-answers
 *     link (/answers/...), a claim or a request link, a person's QR code
 *     (/p/{code}) -- never framed, stored, indexed or referred on;
 *   - the OG fonts traced into the functions that read them;
 *   - Sentry's build settings, only when it is on (withSentry, below).
 */
import { cityRedirects } from "./src/seo/cities.js";
import { sentryDsn, sentryEnvironment, sentryRelease } from "./src/sentry/env.js";

/** Where the site itself takes the reports (src/app/api/csp-report): kept as one log line each, whether or not Sentry is on. */
export const CSP_REPORT_PATH = "/api/csp-report";

/**
 * Sentry's security endpoint for the site's project, when Sentry is on
 * (https://<key>@<host>/<project> → https://<host>/api/<project>/security/?sentry_key=<key>).
 */
export function cspReportUri(dsn = sentryDsn()) {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!u.username || !/^\d+$/.test(project)) return null;
    return `${u.protocol}//${u.host}/api/${project}/security/?sentry_key=${u.username}`;
  } catch {
    return null;
  }
}

/** Where a report of something the policy would block goes: the site's own log, and Sentry when it is on. */
export function cspReportTargets(dsn = sentryDsn()) {
  return [CSP_REPORT_PATH, cspReportUri(dsn)].filter(Boolean);
}

/**
 * The script and connection policy. Sent as Content-Security-Policy-Report-Only
 * (the browser enforces nothing and reports what it would have blocked) until
 * the build sets CSP_ENFORCE=on, after the reports have been watched for a
 * while; then it is enforced, and still reported. 'unsafe-inline' scripts
 * stay while pages are kept (ISR) with no per-request nonce; the host lists
 * still keep a script from loading from, or sending to, anywhere else.
 * Razorpay's checkout, Google's sign-in and the venue's Google map are the
 * third parties. `reportUri`: one address, a list, or none.
 */
export function reportOnlyPolicy({ apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL, dev = process.env.NODE_ENV === "development", reportUri = cspReportTargets() } = {}) {
  const api = (apiOrigin || "https://api.myotherapp.in").trim().replace(/\/+$/, "");
  const media = "https://media.myotherapp.in https://*.amazonaws.com";
  const parts = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com https://accounts.google.com/gsi/client`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    `img-src 'self' data: blob: ${media} https://*.googleusercontent.com`,
    "font-src 'self' data:",
    `connect-src 'self' ${api} ${media} https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io https://api.razorpay.com https://lumberjack.razorpay.com https://accounts.google.com/gsi/`,
    "frame-src https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com https://www.google.com https://maps.google.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.razorpay.com",
  ];
  const targets = (Array.isArray(reportUri) ? reportUri : [reportUri]).filter(Boolean);
  if (targets.length) parts.push(`report-uri ${targets.join(" ")}`);
  return parts.join("; ");
}

/** CSP_ENFORCE=on (read when the site is built): the script policy is enforced, no longer only reported. Off by default. */
export function cspEnforced(env = process.env) {
  return /^(on|1|true|yes)$/i.test(String(env.CSP_ENFORCE ?? "").trim());
}

/**
 * The Content-Security-Policy an address sends: no framing by any site and,
 * once enforced, the script policy as well. Every block below that sets the
 * header uses this, so a stricter path never drops the script policy.
 */
export function enforcedPolicy(enforce = cspEnforced()) {
  return enforce ? `${reportOnlyPolicy()}; frame-ancestors 'none'` : "frame-ancestors 'none'";
}

/**
 * The certificate check is what a fake site would most like to show inside
 * its own page: no frame anywhere (both headers, for old browsers and new),
 * and no address passed on to a link followed from it. A result is never
 * kept by a browser or a cache (a revocation must show at once) nor indexed.
 */
export const VERIFY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: enforcedPolicy() },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];
/**
 * An address that is itself a credential: a check's result, a ticket (its
 * id is the door's QR), a guest's certificate, a survey link (the
 * registration and its key), a missing-answers link (the person and its
 * key). Never framed, kept by a browser or a cache,
 * indexed, nor named to another site in a Referer -- not even the origin.
 */
export const PRIVATE_LINK_HEADERS = [
  ...VERIFY_HEADERS,
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Vercel-CDN-Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
export const VERIFY_RESULT_HEADERS = PRIVATE_LINK_HEADERS;

/**
 * A waiting list's claim link (/claim/{token}), a request's status link
 * (/requests/{token}) and a support survey's (/help/survey/{token}): the token is the offer's (the request's) only credential. Never kept by a browser or a cache, framed or indexed,
 * and never passed on in a Referer: other sites (Razorpay's checkout among
 * them) are told only the site's origin, never the address.
 */
export const CLAIM_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: enforcedPolicy() },
  { key: "Referrer-Policy", value: "strict-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Vercel-CDN-Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/**
 * Every page and file, listed first so the stricter blocks after it win
 * (when two blocks set one header, Next keeps the later): no framing by
 * any site (the register and pay page, "My tickets" with its cancel
 * button), no sniffing a file into a script, the origin alone told to
 * other sites, no camera or microphone, and the script policy: as a
 * report, or enforced with CSP_ENFORCE=on. Nothing frames the site: the
 * dashboards' screens are on their own hosts.
 */
export function siteHeaders(enforce = cspEnforced()) {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: enforcedPolicy(enforce) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()" },
    ...(enforce ? [] : [{ key: "Content-Security-Policy-Report-Only", value: reportOnlyPolicy() }]),
  ];
}
export const SITE_HEADERS = siteHeaders();

/**
 * The find pages kept a minute at the edge, then served stale for five
 * while they are made again. Each header is read by one edge alone, and
 * outranks the "private, no-store" Next gives a dynamic page, which the
 * browser still gets:
 *   Vercel-CDN-Cache-Control       Vercel's (previews);
 *   Cloudflare-CDN-Cache-Control   Cloudflare's, in front of the box, but
 *                                  only where a Cache Rule makes the page
 *                                  eligible: Cloudflare keeps no HTML by
 *                                  default (README, "Edge cache").
 */
export const EDGE_CACHE = "max-age=60, stale-while-revalidate=300";
export const EDGE_HEADERS = [
  { key: "Vercel-CDN-Cache-Control", value: EDGE_CACHE },
  { key: "Cloudflare-CDN-Cache-Control", value: EDGE_CACHE },
];
/**
 * A client navigation (an RSC request) answers the same address with
 * something else, and Cloudflare keys its cache by the address alone (it
 * ignores Vary): only a full page load is ever marked for an edge to keep.
 */
export const PAGE_LOADS_ONLY = [
  { type: "header", key: "rsc" },
  { type: "header", key: "next-router-prefetch" },
  { type: "header", key: "next-router-state-tree" },
  { type: "query", key: "_rsc" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted (the Oracle box: Dockerfile here, moa_backend ops/server):
  // the image build sets NEXT_OUTPUT=standalone, for a server.js carrying
  // only the files it needs. A Vercel build leaves it unset and is unchanged.
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
  poweredByHeader: false,
  reactStrictMode: true,
  // Every crawler and preview bot gets <title>, canonical and Open Graph in the <head>.
  htmlLimitedBots: /.*/,
  images: {
    // Posters, logos and photos are presigned S3 links (they expire); pages
    // point at /media/... instead, which looks the current one up.
    remotePatterns: [
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "https", hostname: "*.s3.*.amazonaws.com" },
    ],
  },
  outputFileTracingIncludes: {
    "/og/**": ["./src/og/fonts/**"],
    "/media/**": ["./src/og/fonts/**"],
  },
  async headers() {
    return [
      // First: every later block that sets the same header wins over it.
      { source: "/:path*", headers: SITE_HEADERS },
      { source: "/events", missing: PAGE_LOADS_ONLY, headers: EDGE_HEADERS },
      { source: "/clubs", missing: PAGE_LOADS_ONLY, headers: EDGE_HEADERS },
      { source: "/topics/:slug", missing: PAGE_LOADS_ONLY, headers: EDGE_HEADERS },
      { source: "/verify", headers: VERIFY_HEADERS },
      { source: "/verify/:code", headers: VERIFY_RESULT_HEADERS },
      // A ticket: its id is what the door scans.
      { source: "/tickets/:ticketid", headers: PRIVATE_LINK_HEADERS },
      // A guest's certificate, by the id in the link the API hands out.
      { source: "/certificates/:id", headers: PRIVATE_LINK_HEADERS },
      // The survey after an event: the registration and the link's key.
      { source: "/feedback/:eventId/:registrationId", headers: PRIVATE_LINK_HEADERS },
      // The details a club asks for after sign-up: who they are for, and the link's key.
      { source: "/answers/:eventId/:ref", headers: PRIVATE_LINK_HEADERS },
      // A waiting list's offer: its address is the claim's credential.
      { source: "/claim/:token", headers: CLAIM_HEADERS },
      // A request for a place (registration approval): its address is the request's only credential too.
      { source: "/requests/:token", headers: CLAIM_HEADERS },
      // A speaker's invite to claim their profile: the link's token is the invite's credential.
      { source: "/speakers/claim/:token", headers: CLAIM_HEADERS },
      // "Did we solve it?" from a support email: the link's token is its only credential.
      { source: "/help/survey/:token", headers: CLAIM_HEADERS },
      // A person's QR code: looked up afresh on every scan (a replaced code stops at once), never indexed.
      { source: "/p/:code", headers: PRIVATE_LINK_HEADERS },
      // The recap's link into the app's Network tab: a page about the app, never indexed or kept.
      { source: "/network", headers: PRIVATE_LINK_HEADERS },
    ];
  },
  async redirects() {
    return [{ source: "/me", destination: "/me/tickets", permanent: false }, ...cityRedirects()];
  },
  async rewrites() {
    return {
      beforeFiles: [
        // /events/{id}: an id is never the canonical address. The old-address
        // page (/{id}) answers it with a 308 to /events/{slug}, query kept.
        { source: "/events/:id(\\d+)", destination: "/:id" },
      ],
    };
  },
};

/**
 * Without NEXT_PUBLIC_SENTRY_DSN, Sentry (src/sentry) is off and the build is
 * exactly as it would be without it. With the DSN, the release (the commit)
 * and the environment (Vercel's production / preview) are written into the
 * bundles from the build's own variables. When SENTRY_AUTH_TOKEN,
 * SENTRY_ORG and SENTRY_PROJECT are set as well, the source maps (browser
 * and server) are uploaded to Sentry for that release and then deleted from
 * the build, so they are never served. A failed upload is logged and the
 * build goes on.
 */
async function withSentry(config) {
  if (!sentryDsn()) return config;
  const release = sentryRelease();
  const withEnv = {
    ...config,
    env: { ...config.env, NEXT_PUBLIC_SENTRY_ENVIRONMENT: sentryEnvironment(), ...(release ? { NEXT_PUBLIC_SENTRY_RELEASE: release } : {}) },
  };
  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) return withEnv;
  const { withSentryConfig } = await import("@sentry/nextjs/config");
  return withSentryConfig(withEnv, {
    org: SENTRY_ORG,
    project: SENTRY_PROJECT,
    authToken: SENTRY_AUTH_TOKEN,
    ...(release ? { release: { name: release } } : {}),
    sourcemaps: { deleteSourcemapsAfterUpload: true },
    telemetry: false,
  });
}

export default await withSentry(nextConfig);
