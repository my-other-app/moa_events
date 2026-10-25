/**
 * The public site at https://myotherapp.in, on Next.js (App Router).
 *
 * Routing lives in src/app. What is configured here:
 *   - /me → /me/tickets, and /events/{id} handed to the old-address page;
 *   - a city's other names to its page (/events/in/cochin → /events/in/kochi);
 *   - metadata always in <head>, never streamed into <body> (canonical tags
 *     only count in the head);
 *   - the find pages (/events, /clubs) and a topic's page (/topics/{slug})
 *     kept a minute at Vercel's edge: they are rendered per request, but
 *     their HTML depends on the address alone;
 *   - the certificate check (/verify) never framed by another site, and its
 *     results (/verify/{number}) and a guest's certificate
 *     (/certificates/{ticket id}) never stored, indexed or referred on (the
 *     code is in the address);
 *   - the OG fonts traced into the functions that read them;
 *   - Sentry's build settings, only when it is on (withSentry, below).
 */
import { cityRedirects } from "./src/seo/cities.js";
import { sentryDsn, sentryEnvironment, sentryRelease } from "./src/sentry/env.js";

/**
 * The certificate check is what a fake site would most like to show inside
 * its own page: no frame anywhere (both headers, for old browsers and new),
 * and no address passed on to a link followed from it. A result is never
 * kept by a browser or a cache (a revocation must show at once) nor indexed.
 */
export const VERIFY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];
export const VERIFY_RESULT_HEADERS = [
  ...VERIFY_HEADERS,
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Vercel-CDN-Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

/**
 * A waiting list's claim link (/claim/{token}): the token is the offer's
 * only credential. Never kept by a browser or a cache, framed or indexed,
 * and never passed on in a Referer: other sites (Razorpay's checkout among
 * them) are told only the site's origin, never the address.
 */
export const CLAIM_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Vercel-CDN-Cache-Control", value: "no-store" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
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
    // Vercel-CDN-Cache-Control is Vercel's alone and outranks the
    // "private, no-store" Next gives a dynamic page; the browser still gets
    // that. Client navigations (RSC requests) are told apart by Next's Vary.
    const edge = [{ key: "Vercel-CDN-Cache-Control", value: "max-age=60, stale-while-revalidate=300" }];
    return [
      { source: "/events", headers: edge },
      { source: "/clubs", headers: edge },
      { source: "/topics/:slug", headers: edge },
      { source: "/verify", headers: VERIFY_HEADERS },
      { source: "/verify/:code", headers: VERIFY_RESULT_HEADERS },
      // A guest's certificate: its address holds the ticket's code.
      { source: "/certificates/:ticketid", headers: VERIFY_RESULT_HEADERS },
      // A waiting list's offer: its address is the claim's credential.
      { source: "/claim/:token", headers: CLAIM_HEADERS },
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
