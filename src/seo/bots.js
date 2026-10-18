/**
 * Link-preview bots (WhatsApp, Telegram, Slack, X, LinkedIn, Facebook,
 * Discord) and search engines read the HTML they are sent. A page that is
 * still drawn in the browser (a client page, see docs/NEXT_MIGRATION.md)
 * sends them almost nothing, so for those pages next.config.mjs rewrites a
 * bot's request to /api/share, which answers with the page's title,
 * description, picture and words.
 *
 * Server-rendered pages (/events/{slug}, /clubs/{slug}) are NOT listed:
 * bots get the real page. The old addresses (/{id}, /{ref}/live,
 * /register/{ref}) are not listed either: they answer with a 308 to the
 * event's page, which bots follow.
 *
 * When a page is ported to server rendering, delete its line here.
 */
export const BOT_UA =
  ".*(?:facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|LinkedInBot|TelegramBot|Discordbot|Googlebot|bingbot|Applebot|Embedly|Pinterest|redditbot|SkypeUriPreview|Iframely).*";

/** [source pattern for next.config rewrites, the path /api/share is asked about]. */
export const BOT_PAGES = [
  { source: "/events", path: "/events" },
  { source: "/clubs", path: "/clubs" },
  { source: "/threads", path: "/threads" },
  { source: "/about", path: "/about" },
  { source: "/privacy", path: "/privacy" },
  { source: "/terms", path: "/terms" },
  { source: "/for-clubs", path: "/for-clubs" },
  { source: "/pricing", path: "/pricing" },
  { source: "/events/:slug/:sub(register|live|compete)", path: "/events/:slug/:sub" },
];

const BOT = new RegExp(`^${BOT_UA}$`);

/** True for a user agent the rewrites above treat as a bot (the same match Next makes). */
export const isBot = (ua) => BOT.test(String(ua || ""));
