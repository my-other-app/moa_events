/**
 * Link-preview bots (WhatsApp, Telegram, Slack, X, LinkedIn, Facebook,
 * Discord) and search engines. Every page is rendered on the server, so they
 * read the real <head>; this only tells them apart where the browser would
 * otherwise do something a bot doesn't need (the live room's stream never
 * opens for one).
 */
const BOT_UA =
  ".*(?:facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|LinkedInBot|TelegramBot|Discordbot|Googlebot|bingbot|Applebot|Embedly|Pinterest|redditbot|SkypeUriPreview|Iframely).*";

const BOT = new RegExp(`^${BOT_UA}$`);

/** True for a link-preview bot's or a search engine's user agent. */
export const isBot = (ua) => BOT.test(String(ua || ""));
