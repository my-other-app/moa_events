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
 * RSS 2.0 rules). Then the rest of the public site: the home page, the find
 * pages (their first results in the HTML, ItemList, which filtered
 * addresses are kept and which say noindex), the posts (a post's
 * DiscussionForumPosting), the static pages (the plans' structured data),
 * /api/near as Vercel would ask it, and that bots get the real pages.
 * Then search for India: lang en-IN, the city pages (/events/in/…), the
 * demo clubs kept out of search (noindex, follow; out of the sitemaps),
 * the manifest and the icons.
 * Prints what it found; exits 1 if anything failed.
 * The validators are src/seo/validate.js, the same the tests use.
 */
import { JSDOM } from "jsdom";
import {
  validateBreadcrumbs,
  validateDiscussionPosting,
  validateEvent,
  validateItemList,
  validateOrganization,
  validateRss,
  validateSoftwareApplication,
} from "../src/seo/validate.js";

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
  ok(doc.documentElement.getAttribute("lang") === "en-IN", '<html lang="en-IN">', doc.documentElement.getAttribute("lang"));
  const robots = doc.querySelector('meta[name="robots"]')?.getAttribute("content");
  console.log(`        robots: ${robots || "index, follow"}${robots ? " (a demo club's event, src/seo/demo.js)" : ""}`);
  ok(/\/og\/events\//.test(og("image") || "") && og("image:width") === "1200" && og("image:height") === "630", "og:image is the 1200x630 share picture", og("image"));
  ok(doc.querySelector('meta[name="twitter:card"]')?.getAttribute("content") === "summary_large_image", "Twitter card");
  ok(!/X-Amz-Signature|Signature=|Expires=\d/.test(html), "no presigned (expiring) S3 link anywhere in the HTML");
  const lds = ldOf(doc);
  const event = lds.find((l) => l["@type"] === "Event");
  const crumbs = lds.find((l) => l["@type"] === "BreadcrumbList");
  ok(Boolean(event), "an Event in JSON-LD");
  if (event) {
    report("Event JSON-LD", validateEvent(event));
    const ratios = (event.image || []).map((u) => new URL(u).searchParams.get("ratio")).filter(Boolean);
    ok(JSON.stringify(ratios) === JSON.stringify(["16x9", "4x3", "1x1"]), "its pictures at 16:9, 4:3 and 1:1", ratios.join(" "));
    ok(/\+05:30$/.test(event.startDate) && (!event.offers || event.offers.priceCurrency === "INR"), "India time and rupees", `${event.startDate} ${event.offers?.priceCurrency || ""}`);
    for (const ratio of ratios) {
      const pic = await get(new URL(event.image.find((u) => u.includes(`ratio=${ratio}`))).pathname + new URL(event.image.find((u) => u.includes(`ratio=${ratio}`))).search);
      ok(pic.status === 200 && /^image\//.test(pic.headers.get("content-type") || ""), `the ${ratio} picture renders`, `${pic.status} ${pic.headers.get("content-type")} ${(await pic.arrayBuffer()).byteLength} bytes`);
    }
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

/* ---------- the rest of the public site (step 2) ---------- */

const SITE = "https://myotherapp.in";
const PRESIGNED = /X-Amz-Signature|Signature=|Expires=\d/;
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

/** A page's raw HTML and what a crawler reads off it. */
async function page(path, { status = 200, ua } = {}) {
  const res = await get(path, ua ? { headers: { "user-agent": ua } } : {});
  const html = await res.text();
  const doc = parseHtml(html);
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || null;
  const robots = doc.querySelector('meta[name="robots"]')?.getAttribute("content") || null;
  const h1 = (doc.querySelector("h1")?.textContent || "").trim();
  ok(res.status === status, `${path} answers ${status}`, `${res.status}, ${(html.length / 1024).toFixed(1)} KB, cache-control: ${res.headers.get("cache-control")}`);
  return { res, html, doc, canonical, robots, h1, lds: ldOf(doc) };
}

const listUrls = (list) => (list?.itemListElement || []).map((i) => i.url);

async function checkHome() {
  console.log("\nThe home page /");
  const p = await page("/");
  ok(p.canonical === SITE || p.canonical === `${SITE}/`, "canonical is the site itself", p.canonical);
  ok(p.h1.startsWith("Find your people."), "the hero's <h1> is in the HTML", p.h1);
  ok(/Browse by category|This week|Popular|From the clubs|It's quiet out here/.test(p.doc.querySelector("main")?.textContent || ""), "what's on is in the HTML (sections or the empty word)");
  ok(Boolean(p.doc.querySelector('[aria-label="Finding events near you"]')), "near you is left to the browser (a placeholder in the HTML)");
  ok(!PRESIGNED.test(p.html), "no presigned (expiring) S3 link anywhere in the HTML");
  const org = p.lds.find((l) => l["@type"] === "Organization");
  if (org) report("Organization JSON-LD", validateOrganization(org));
  else ok(false, "an Organization in JSON-LD");
  ok(Boolean(p.lds.find((l) => l["@type"] === "WebSite")?.potentialAction), "a WebSite with its search box in JSON-LD");
  ok(p.doc.querySelector('link[rel="alternate"][type="application/rss+xml"]')?.getAttribute("href") === `${SITE}/events/rss.xml`, "the events feed is advertised");
  const near = await get("/api/near", { headers: { "x-vercel-ip-latitude": "9.9312", "x-vercel-ip-longitude": "76.2673", "x-vercel-ip-city": "Kochi" } });
  const body = await near.json().catch(() => null);
  ok(near.status === 200 && body?.where?.lat === 9.9312, "/api/near places a visitor by Vercel's geo headers", `${near.status} ${JSON.stringify(body?.where)}; ${body?.near?.length} near, ${body?.clubs?.length} clubs`);
  ok(/s-maxage=60/.test(near.headers.get("cache-control") || "") && /X-Vercel-IP-Latitude/.test(near.headers.get("vary") || ""), "…kept at the edge a minute, per place", `${near.headers.get("cache-control")} | vary: ${near.headers.get("vary")}`);
  ok(!PRESIGNED.test(JSON.stringify(body)), "…with stable picture links");
  const shared = await get("/api/near?lat=10.0159&lng=76.3419");
  ok(shared.headers.get("cache-control") === "private, max-age=60", "…and a shared point's answer stays the visitor's", shared.headers.get("cache-control"));
}

async function checkList(kind) {
  const base = `/${kind}`;
  console.log(`\nThe find page ${base}`);
  const p = await page(base);
  ok(p.canonical === `${SITE}${base}`, "canonical is the page itself", p.canonical);
  ok(!p.robots, "indexable", p.robots || "");
  ok(Boolean(p.h1), "its <h1>", p.h1);
  // Vercel's edge keeps the page a minute: next start shows the header; Vercel consumes it.
  const edge = p.res.headers.get("vercel-cdn-cache-control");
  if (edge !== null) ok(edge === "max-age=60, stale-while-revalidate=300", "kept a minute at Vercel's edge", edge);
  else console.log("        (Vercel-CDN-Cache-Control consumed by Vercel's edge)");
  const list = p.lds.find((l) => l["@type"] === "ItemList");
  if (list) {
    report("ItemList JSON-LD", validateItemList(list));
    const last = (u) => decodeURIComponent(String(u).split("/").pop());
    const cards = [...p.doc.querySelectorAll(kind === "events" ? ".dc-evcard-link" : ".dc-ccard-name a")].map((a) => last(a.getAttribute("href")));
    // The demo clubs' results are left out of it (src/seo/demo.js): the rest, in the same order.
    const listed = listUrls(list).map(last);
    ok(listed.length > 0 && JSON.stringify(cards.filter((c) => listed.includes(c))) === JSON.stringify(listed), "the ItemList is the (real) results in the HTML, in order", `${listed.length} of ${cards.length} in the HTML`);
  } else console.log("        (no ItemList: every result shown is a demo club's)");
  ok(!PRESIGNED.test(p.html), "no presigned (expiring) S3 link anywhere in the HTML");
  ok(!/km away/.test(p.html), "a list about no place shows no distances");
  // One browsing filter alone is kept, at its own address; a mix is not.
  const chip = p.doc.querySelector(kind === "events" ? '[aria-label="Categories"] a[href*="category="]' : '[aria-label="Interests"] a[href*="interest="]');
  if (chip) {
    const href = chip.getAttribute("href");
    const one = await page(href);
    const onlyDemo = one.robots === "noindex, follow" && !one.lds.some((l) => l["@type"] === "ItemList");
    ok((one.canonical === `${SITE}${href}` && !one.robots) || onlyDemo, `${href} is kept, at its own canonical (noindex when it shows only demo clubs')`, `${one.canonical} | ${one.robots || "index"} | <h1> ${one.h1}`);
  } else console.log("        (no chips to try a single filter with)");
  const mixed = await page(kind === "events" ? "/events?type=online&price=free&utm_source=check" : "/clubs?q=a&sort=newest");
  ok(mixed.robots === "noindex, follow" && !mixed.canonical, "a mix of filters is noindex, follow, with no canonical", `${mixed.robots} | ${mixed.canonical}`);
  if (kind === "events") {
    const sorted = await page("/events?sort=popular&ref=check");
    ok(sorted.canonical === `${SITE}/events` && !sorted.robots, "an order alone is the page itself (canonical /events)", sorted.canonical);
    const cal = await page("/events?view=calendar");
    ok(cal.robots === "noindex, follow", "the calendar is noindex, follow", cal.robots);
    const near = await page("/events?near=9.931,76.267");
    ok(near.robots === "noindex, follow" && /^Events near/.test(near.h1), "a place in the address: near it, noindex", near.h1);
  }
  const bot = await page(base, { ua: GOOGLEBOT });
  ok(bot.h1 === p.h1 && Boolean(bot.doc.querySelector("main")), "Googlebot gets the real page, not a preview", bot.h1);
}

async function checkThreads() {
  console.log("\nThe posts /threads");
  const p = await page("/threads");
  ok(p.canonical === `${SITE}/threads`, "canonical", p.canonical);
  ok(p.lds.some((l) => l["@type"] === "CollectionPage"), "a CollectionPage in JSON-LD (with an ItemList of the real posts, when there are any)", p.lds.map((l) => l["@type"]).join(" "));
  ok(!PRESIGNED.test(p.html), "no presigned (expiring) S3 link anywhere in the HTML");
  const first = p.doc.querySelector('a[href^="/threads/"]')?.getAttribute("href");
  ok(Boolean(first) || Boolean(p.doc.querySelector(".dc-state")), "the first posts are in the HTML", first || "no posts yet");
  if (first) {
    console.log(`\nThe post ${first}`);
    const post = await page(first);
    ok(post.canonical === `${SITE}${first}`, "canonical is the post's own address", post.canonical);
    ok(Boolean(post.doc.querySelector(".dc-tcard--full .dc-tcard-club")?.textContent), "the post and its club are in the HTML", post.doc.querySelector(".dc-tcard--full .dc-tcard-club")?.textContent);
    ok(/Comments/.test(post.doc.querySelector("#dc-comments-title")?.textContent || ""), "its comments are in the HTML", post.doc.querySelector("#dc-comments-title")?.textContent);
    ok(!PRESIGNED.test(post.html), "no presigned (expiring) S3 link anywhere in the HTML");
    const ld = post.lds.find((l) => l["@type"] === "DiscussionForumPosting");
    if (ld) report("DiscussionForumPosting JSON-LD", validateDiscussionPosting(ld));
    else ok(false, "a DiscussionForumPosting in JSON-LD");
    const crumbs = post.lds.find((l) => l["@type"] === "BreadcrumbList");
    if (crumbs) report("BreadcrumbList", validateBreadcrumbs(crumbs));
  }
  await page("/threads/no-such-post-zzz", { status: 404 });
}

async function checkStatic() {
  console.log("\nThe static pages");
  for (const [path, h1] of [
    ["/about", /Where student clubs run their events/],
    ["/privacy", /Privacy/],
    ["/terms", /Terms/],
    ["/for-clubs", /from one place/],
    ["/pricing", /Plans for/],
  ]) {
    const p = await page(path);
    ok(p.canonical === `${SITE}${path}` && !p.robots, `${path}: canonical, indexable`, p.canonical);
    ok(h1.test(p.h1), `${path}: its <h1> and words are in the HTML`, `${p.h1} (${(p.doc.querySelector("main")?.textContent || "").length} characters of text)`);
    if (path === "/pricing" || path === "/for-clubs") {
      const app = p.lds.find((l) => l["@type"] === "SoftwareApplication");
      if (app) report(`${path}: the plans as a SoftwareApplication`, validateSoftwareApplication(app));
      else ok(false, `${path}: the plans' structured data`);
      if (path === "/pricing") ok(Boolean(p.doc.querySelector("#compare table")), "the comparison table is in the HTML", `${p.doc.querySelectorAll("#compare tbody tr").length} rows`);
    }
  }
}

async function checkIndia() {
  console.log("\nSearch in India: the city pages, the demo clubs, the manifest and icons");
  const hub = await page("/events/in");
  ok(hub.h1 === "Events by city" && hub.canonical === `${SITE}/events/in`, "/events/in: its <h1> and canonical", `${hub.h1} | ${hub.robots || "index"}`);
  const cities = [...hub.doc.querySelectorAll('a[href^="/events/in/"]')].map((a) => a.getAttribute("href"));
  ok(cities.length > 0, "…links the cities with upcoming events", cities.join(" "));
  for (const path of cities.slice(0, 3)) {
    const c = await page(path);
    ok(/^Events in .+: hackathons, workshops and meetups$/.test(c.h1) && c.canonical === `${SITE}${path}`, `${path}: its <h1>, canonical`, `${c.h1} | ${c.robots || "index"}`);
    ok(c.doc.documentElement.getAttribute("lang") === "en-IN", `${path}: lang en-IN`);
    const types = c.lds.map((l) => l["@type"]);
    ok(types.includes("CollectionPage") && types.includes("BreadcrumbList"), `${path}: CollectionPage and BreadcrumbList`, types.join(" "));
    const list = c.lds.find((l) => l["@type"] === "ItemList");
    if (list) report(`${path}: ItemList`, validateItemList(list));
    ok(Boolean(list) === !c.robots, `${path}: indexed exactly when it lists a real event`, `${c.robots || "index"}, ${list ? list.itemListElement.length : 0} in the ItemList`);
    const crumbs = c.lds.find((l) => l["@type"] === "BreadcrumbList");
    if (crumbs) report(`${path}: BreadcrumbList`, validateBreadcrumbs(crumbs));
    ok(Boolean(c.doc.querySelector('nav[aria-label="Breadcrumb"]')), `${path}: visible breadcrumbs`);
  }
  const alias = await get("/events/in/cochin");
  ok(alias.status === 308 && new URL(alias.headers.get("location"), base).pathname === "/events/in/kochi", "/events/in/cochin → 308 /events/in/kochi", `${alias.status} ${alias.headers.get("location")}`);
  ok((await get("/events/in/atlantis")).status === 404, "an unknown city is a 404");
  const sitemap = parseXml(await (await get("/sitemaps/cities.xml")).text());
  console.log(`        cities.xml: ${texts(sitemap, "loc").map((l) => new URL(l).pathname).join(" ") || "(empty: no city page has a real event)"}`);
  const manifest = await get("/manifest.webmanifest");
  const m = await manifest.json().catch(() => null);
  ok(manifest.status === 200 && m?.lang === "en-IN" && m.icons?.length >= 3, "/manifest.webmanifest", `${manifest.status} ${m?.name}`);
  for (const icon of ["/favicon.ico", "/icon-192.png", "/apple-touch-icon.png", ...(m?.icons || []).map((i) => i.src)]) {
    const r = await get(icon);
    ok(r.status === 200 && /^image\//.test(r.headers.get("content-type") || ""), `${icon} is an image`, `${r.status} ${r.headers.get("content-type")} ${(await r.arrayBuffer()).byteLength} bytes`);
  }
}

const texts = (doc, tag) => [...doc.getElementsByTagName(tag)].map((el) => el.textContent);

await checkHome();
await checkIndia();
await checkList("events");
await checkList("clubs");
await checkThreads();
await checkStatic();

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
