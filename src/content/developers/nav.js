/**
 * The developer docs' pages (https://myotherapp.in/developers/...), in the
 * order the left-hand menu lists them and "Next" walks them. Plain data:
 * the sitemap reads the addresses from here, the pages their names.
 */

export const DOCS_ROOT = "/developers";
/** When the docs (and v1) were published, and when they last changed. */
export const DOCS_PUBLISHED = "2026-11-12";
export const DOCS_UPDATED = "2026-11-12";

export const DOCS_GROUPS = [
  {
    name: "Start here",
    pages: [
      { slug: "", title: "Overview", heading: "The MyOtherApp Integrations API", description: "Connect a club's own systems, or your platform, to MyOtherApp both ways: events, registrations, check-ins, certificates and webhooks, over a documented, versioned API." },
      { slug: "getting-access", title: "Getting access", description: "How a club or a platform gets access to the MyOtherApp Integrations API: nothing is on by default, and the MyOtherApp team turns it on for each club and partner app." },
      { slug: "quick-start", title: "Quick start", description: "Your first calls to the MyOtherApp Integrations API with curl: who am I, create and publish an event, register someone, check them in, and receive a webhook." },
    ],
  },
  {
    name: "Basics",
    pages: [
      { slug: "authentication", title: "Authentication", description: "Calling the MyOtherApp Integrations API with a club API key, or as a partner app with OAuth 2.0: the authorisation and token addresses, PKCE, refresh tokens and revoking." },
      { slug: "scopes", title: "Scopes", description: "Every scope of the MyOtherApp Integrations API, what it allows, and which endpoints need it. Least privilege, with attendees' contact details kept apart." },
      { slug: "reference", title: "API reference", description: "Every endpoint of the MyOtherApp Integrations API v1: method, path, scopes, parameters, request and response examples, and errors. Made from the OpenAPI document." },
    ],
  },
  {
    name: "Guides",
    pages: [
      { slug: "webhooks", title: "Webhooks", description: "MyOtherApp webhooks: the event types, the payload, verifying the MOA-Signature header in Node, Python and PHP, retries, replay, ordering and de-duplication." },
      { slug: "sync", title: "Syncing both ways", heading: "Syncing both ways", description: "Keep your system and MyOtherApp in step both ways: external ids, updated_since, ETags with If-Match, and the no-echo rule that stops loops." },
      { slug: "idempotency", title: "Idempotency", description: "Retry safely with the Idempotency-Key header: how long keys are kept, what a replay returns, and when you get IDEMPOTENCY_MISMATCH." },
      { slug: "errors", title: "Errors", description: "The MyOtherApp Integrations API's error shape and every error code: what it means, its HTTP status, and what to do about it." },
      { slug: "rate-limits", title: "Rate limits", description: "How many requests a minute the MyOtherApp Integrations API takes, the X-RateLimit headers, and what to do with a 429 and Retry-After." },
      { slug: "test-mode", title: "Test mode", description: "Build against MyOtherApp without touching real people: test keys see only test objects, send no emails or messages, and take no payments." },
      { slug: "money-and-personal-data", title: "Money and personal data", description: "The rules on money and on people's details in the MyOtherApp Integrations API: no payments move through it, and attendees' contact details need the club's say-so." },
    ],
  },
  {
    name: "Changes",
    pages: [{ slug: "changelog", title: "Changelog", description: "What changed in the MyOtherApp Integrations API, by date, and how versions work: v1 changes only by adding things." }],
  },
];

/** Every page in order, each with its address. */
export const DOCS_PAGES = DOCS_GROUPS.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.name, path: p.slug ? `${DOCS_ROOT}/${p.slug}` : DOCS_ROOT })));

/** The pages under /developers/{slug} (all but the overview). */
export const DOCS_SLUGS = DOCS_PAGES.filter((p) => p.slug).map((p) => p.slug);

export const docsPage = (slug) => DOCS_PAGES.find((p) => p.slug === (slug || "")) || null;

/** The page before and after one, for "Previous" and "Next". */
export function neighbours(slug) {
  const i = DOCS_PAGES.findIndex((p) => p.slug === (slug || ""));
  return { previous: i > 0 ? DOCS_PAGES[i - 1] : null, next: i >= 0 && i < DOCS_PAGES.length - 1 ? DOCS_PAGES[i + 1] : null };
}

/** The downloads: the OpenAPI document and the Postman collection made from it, served by the site. */
export const DOWNLOADS = {
  openapi: { path: `${DOCS_ROOT}/openapi.json`, filename: "myotherapp-integrations-v1.openapi.json" },
  postman: { path: `${DOCS_ROOT}/postman_collection.json`, filename: "myotherapp-integrations-v1.postman_collection.json" },
};
