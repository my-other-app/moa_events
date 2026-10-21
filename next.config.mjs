/**
 * The public site at https://myotherapp.in, on Next.js (App Router).
 *
 * Routing lives in src/app. What is configured here:
 *   - link-preview bots asking for a page that is still drawn in the browser
 *     get the small server-made page from /api/share instead (see BOT_PAGES);
 *     server-rendered pages need no such help and are not listed;
 *   - /me → /me/tickets, and /events/{id} handed to the old-address page;
 *   - a city's other names to its page (/events/in/cochin → /events/in/kochi);
 *   - metadata always in <head>, never streamed into <body> (canonical tags
 *     only count in the head);
 *   - the find pages (/events, /clubs) and a topic's page (/topics/{slug})
 *     kept a minute at Vercel's edge: they are rendered per request, but
 *     their HTML depends on the address alone;
 *   - the OG fonts traced into the functions that read them.
 */
import { BOT_PAGES, BOT_UA } from "./src/seo/bots.js";
import { cityRedirects } from "./src/seo/cities.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ];
  },
  async redirects() {
    return [{ source: "/me", destination: "/me/tickets", permanent: false }, ...cityRedirects()];
  },
  async rewrites() {
    return {
      beforeFiles: [
        ...BOT_PAGES.map(({ source, path }) => ({
          source,
          has: [{ type: "header", key: "user-agent", value: BOT_UA }],
          destination: `/api/share${path}`,
        })),
        // /events/{id}: an id is never the canonical address. The old-address
        // page (/{id}) answers it with a 308 to /events/{slug}, query kept.
        { source: "/events/:id(\\d+)", destination: "/:id" },
      ],
    };
  },
};

export default nextConfig;
