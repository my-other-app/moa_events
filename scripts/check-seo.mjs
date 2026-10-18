#!/usr/bin/env node
/**
 * Checks a running site the way a crawler reads it, with no browser:
 *
 *   node scripts/check-seo.mjs [base] [event-slug] [club-slug]
 *   node scripts/check-seo.mjs http://localhost:3000 hack-night-04 circuit-society
 *
 * Reads the event and club pages' raw HTML (their words, head and JSON-LD,
 * checked against schema.org's Event and Organization as Google reads
 * them), the sitemap index and a sitemap, robots.txt, the old addresses'
 * 308s, a 404, the share pictures and both RSS feeds (checked against the
 * RSS 2.0 rules). Prints what it found; exits 1 if anything failed.
 * The validators are src/seo/validate.js, the same the tests use.
 */
import { JSDOM } from "jsdom";
import { validateBreadcrumbs, validateEvent, validateOrganization, validateRss } from "../src/seo/validate.js";

const [base = "http://localhost:3000", eventSlug, clubSlug] = process.argv.slice(2);
const { DOMParser } = new JSDOM("").window;
const parseXml = (text) => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error(err.textContent);
  return doc;
};
const parseHtml = (text) => new JSDOM(text).window.document;

let failed = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "  ok  " : "  FAIL"} ${label}${extra ? `  ${extra}` : ""}`);
  if (!cond) failed += 1;
};
const report = (label, { errors, warnings }) => {
  ok(errors.length === 0, `${label}: ${errors.length} errors, ${warnings.length} warnings`, errors.join("; "));
  if (warnings.length) console.log(`        warnings: ${warnings.join("; ")}`);
};
const get = (path, init = {}) => fetch(new URL(path, base), { redirect: "manual", ...init });
const ldOf = (doc) => [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));

async function firstSlugs() {
  const index = parseXml(await (await get("/sitemap.xml")).text());
  const locs = [...index.getElementsByTagName("loc")].map((l) => l.textContent);
  const pick = async (kind) => {
    const loc = locs.find((l) => l.includes(`/sitemaps/${kind}-`));
    if (!loc) return null;
    const doc = parseXml(await (await get(new URL(loc).pathname)).text());
    const first = [...doc.getElementsByTagName("loc")][0]?.textContent;
    return first ? decodeURIComponent(first.split("/").pop()) : null;
  };
  return { event: eventSlug || (await pick("events")), club: clubSlug || (await pick("clubs")) };
}

async function checkEvent(slug) {
  console.log(`\nThe event page /events/${slug}`);
  const res = await get(`/events/${slug}`);
  const html = await res.text();
  ok(res.status === 200, `200 OK`, `${res.status}, ${html.length} bytes, cache-control: ${res.headers.get("cache-control")}`);
  const doc = parseHtml(html);
  const title = doc.querySelector("title")?.textContent || "";
  const h1 = doc.querySelector("h1")?.textContent || "";
  ok(Boolean(h1) && title.startsWith(h1) && title.endsWith(" · MyOtherApp"), "<title> and <h1> name the event", `"${title}"`);
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  ok(canonical === `https://myotherapp.in/events/${slug}`, "canonical is /events/{slug} on myotherapp.in", canonical);
  ok(Boolean(doc.querySelector(".ep-fact-main")?.textContent), "the date is in the HTML", doc.querySelector(".ep-fact-main")?.textContent);
  ok(Boolean(doc.querySelectorAll(".ep-fact-main")[1]?.textContent), "the venue is in the HTML", doc.querySelectorAll(".ep-fact-main")[1]?.textContent);
  const og = (p) => doc.querySelector(`meta[property="og:${p}"]`)?.getAttribute("content");
  ok(og("url") === canonical && og("site_name") === "MyOtherApp" && og("locale") === "en_IN", "Open Graph url, site_name, locale");
  ok(/\/og\/events\//.test(og("image") || "") && og("image:width") === "1200" && og("image:height") === "630", "og:image is the 1200x630 share picture", og("image"));
  ok(doc.querySelector('meta[name="twitter:card"]')?.getAttribute("content") === "summary_large_image", "Twitter card");
  ok(!/X-Amz-Signature|Signature=|Expires=\d/.test(html), "no presigned (expiring) S3 link anywhere in the HTML");
  const lds = ldOf(doc);
  const event = lds.find((l) => l["@type"] === "Event");
  const crumbs = lds.find((l) => l["@type"] === "BreadcrumbList");
  ok(Boolean(event), "an Event in JSON-LD");
  if (event) {
    report("Event JSON-LD", validateEvent(event));
    const about = (doc.querySelector("#about")?.textContent || "").replace(/\s+/g, " ");
    if (about) ok(about.includes(event.description.replace(/\s+/g, " ").replace(/…$/, "").slice(0, 60)), "the description is in the HTML", `"${event.description.slice(0, 60)}…"`);
    else console.log("        (no description of its own: the page shows its facts)");
  }
  if (crumbs) report("BreadcrumbList", validateBreadcrumbs(crumbs));
  else ok(false, "a BreadcrumbList in JSON-LD");
  const scripts = [...doc.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"));
  console.log(`        scripts: ${scripts.length}`);
  return { event, html };
}

async function checkClub(slug) {
  console.log(`\nThe club page /clubs/${slug}`);
  const res = await get(`/clubs/${slug}`);
  const html = await res.text();
  ok(res.status === 200, "200 OK", `${res.status}, ${html.length} bytes`);
  const doc = parseHtml(html);
  ok(Boolean(doc.querySelector("h1")?.textContent), "the club's name is the <h1>", doc.querySelector("h1")?.textContent);
  ok(doc.querySelector('link[rel="canonical"]')?.getAttribute("href") === `https://myotherapp.in/clubs/${slug}`, "canonical");
  ok(doc.querySelector('link[rel="alternate"][type="application/rss+xml"]')?.getAttribute("href") === `https://myotherapp.in/clubs/${slug}/rss.xml`, "its feed is advertised");
  ok(!/Signature=|Expires=\d/.test(html), "no presigned (expiring) S3 link anywhere in the HTML");
  const lds = ldOf(doc);
  const org = lds.find((l) => l["@type"] === "Organization");
  if (org) report("Organization JSON-LD", validateOrganization(org));
  else ok(false, "an Organization in JSON-LD");
  const crumbs = lds.find((l) => l["@type"] === "BreadcrumbList");
  if (crumbs) report("BreadcrumbList", validateBreadcrumbs(crumbs));
  return org;
}

async function checkFeed(path) {
  console.log(`\nThe feed ${path}`);
  const res = await get(path);
  const text = await res.text();
  ok(res.status === 200 && res.headers.get("content-type") === "application/rss+xml; charset=utf-8", "200, application/rss+xml", `${res.status} ${res.headers.get("content-type")} ${res.headers.get("cache-control")}`);
  report("RSS 2.0", validateRss(text, parseXml));
  const items = parseXml(text).getElementsByTagName("item").length;
  console.log(`        items: ${items}`);
  return text;
}

const { event: slug, club } = await firstSlugs();
console.log(`Checking ${base} with event ${slug} and club ${club}`);

if (slug) {
  const { event } = await checkEvent(slug);
  const og = await get(`/og/events/${slug}`);
  const bytes = (await og.arrayBuffer()).byteLength;
  ok(og.status === 200 && /^image\/(png|jpeg)$/.test(og.headers.get("content-type")), "the event's share picture renders", `${og.headers.get("content-type")}, ${bytes} bytes`);
  const poster = await get(`/media/events/${slug}/poster`);
  ok(poster.status === 307, "its stable poster address redirects", `${poster.status} → ${(poster.headers.get("location") || "").slice(0, 70)}…`);
  if (event) {
    const id = String(event.url).split("/").pop();
    for (const [from, to] of [
      [`/${id}?ref=abc12345`, `/events/${id}?ref=abc12345`],
      [`/register/${id}`, `/events/${id}/register`],
      [`/${id}/live`, `/events/${id}/live`],
      [`/${id}/compete`, `/events/${id}/compete`],
    ]) {
      const r = await get(from);
      ok(r.status === 308 && new URL(r.headers.get("location"), base).pathname + new URL(r.headers.get("location"), base).search === to, `${from} → 308 ${to}`, `${r.status} ${r.headers.get("location")}`);
    }
  }
}
if (club) {
  await checkClub(club);
  const og = await get(`/og/clubs/${club}`);
  ok(og.status === 200, "the club's share picture renders", `${og.headers.get("content-type")}, ${(await og.arrayBuffer()).byteLength} bytes`);
  await checkFeed(`/clubs/${club}/rss.xml`);
  ok((await get(`/clubs/no-such-club-zzz/rss.xml`)).status === 404, "an unknown club's feed is a 404");
}
await checkFeed("/events/rss.xml");
await checkFeed("/events/rss.xml?type=online&price=free");

console.log("\nThe rest");
const missing = await get("/events/no-such-event-zzz");
ok(missing.status === 404, "a missing event is a real 404", String(missing.status));
ok((await get("/no-such-event-zzz")).status === 404, "a missing old address is a real 404");
const index = await get("/sitemap.xml");
const indexDoc = parseXml(await index.text());
ok(indexDoc.documentElement.tagName === "sitemapindex", "sitemap.xml is a sitemap index", [...indexDoc.getElementsByTagName("loc")].map((l) => new URL(l.textContent).pathname).join(" "));
const robots = await (await get("/robots.txt")).text();
ok(/Sitemap: https:\/\/myotherapp\.in\/sitemap\.xml/.test(robots) && /Disallow: \/api\//.test(robots), "robots.txt names the sitemap and keeps out /api/");

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
