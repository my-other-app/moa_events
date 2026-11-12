/**
 * robots.txt: everything is open to crawlers except a person's own pages,
 * the server's functions and the steps of the event flows (registration,
 * the live room, the competition), which have nothing to index and point
 * at the event's page anyway. The feeds and the share pictures are open.
 * The developer docs are private but for /developers itself: "/developers/"
 * keeps every page under it out, and leaves the bare /developers open.
 */
import { SITE_URL } from "@/config";

export const DISALLOW = [
  "/api/",
  "/me$",
  "/me/",
  "/register/",
  "/events/*/register",
  "/events/*/live",
  "/events/*/compete",
  "/*/live$",
  "/*/compete$",
  "/tickets/",
  "/certificates/",
  "/feedback/",
  "/play/",
  "/claim/",
  "/requests/",
  "/answers/",
  "/developers/",
];

export const ALLOW = ["/", "/events/rss.xml", "/clubs/*/rss.xml", "/media/", "/og/"];

export function robots() {
  return {
    rules: [{ userAgent: "*", allow: ALLOW, disallow: DISALLOW }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
