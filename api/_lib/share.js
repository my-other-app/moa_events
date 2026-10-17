/**
 * The page a link-preview bot gets: WhatsApp, Telegram, Slack, X, LinkedIn,
 * Facebook, Discord and search engines read the tags in the HTML they are
 * sent and run no scripts, so the single-page app shows them nothing. For an
 * event or a club this builds a small page with its title, description,
 * picture and canonical address, and a link to the real page.
 */
import { CACHE, CACHE_SHORT, DEFAULT_IMAGE, SITE_NAME, SITE_URL, escapeHtml, fetchJson } from "./site.js";
import { formatPrice, formatWhen, imageUrl } from "../../src/utils/format.js";
import { eventJsonLd, jsonForScript } from "../../src/utils/eventld.js";
import { LEGAL, inline, updatedLabel } from "../../src/content/legal.js";
import { ABOUT } from "../../src/content/about.js";
import { FOR_CLUBS, PRICING_PAGE, clubFaq } from "../../src/content/forclubs.js";
import { parsePlans, planSummary, plansJsonLd, yearlyOffer } from "../../src/utils/pricing.js";

const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
/** First words of the site's own addresses, never an event's old /{ref}. */
const RESERVED = new Set([
  "events",
  "clubs",
  "threads",
  "about",
  "privacy",
  "terms",
  "for-clubs",
  "pricing",
  "play",
  "feedback",
  "tickets",
  "certificates",
  "register",
  "api",
  "assets",
]);
/** The site's own one-word pages, which no old event address can take. */
const OWN_PAGES = new Set(["about", "privacy", "terms", "for-clubs", "pricing"]);
/** The pages that show the clubs' plans, read from the API when a crawler asks. */
const PLAN_PAGES = new Set(["for-clubs", "pricing"]);

const PAGES = {
  home: { path: "/", title: `${SITE_NAME} · Events and clubs near you`, description: "Find events and clubs near you on MyOtherApp — hackathons, workshops, meetups and more, from the clubs that run them." },
  events: { path: "/events", title: `Find events · ${SITE_NAME}`, description: "Hackathons, workshops, meetups and more near you, from the clubs on MyOtherApp." },
  clubs: { path: "/clubs", title: `Clubs · ${SITE_NAME}`, description: "Find clubs near you on MyOtherApp and see what they're running next." },
  threads: { path: "/threads", title: `Threads · ${SITE_NAME}`, description: "What the clubs on MyOtherApp are posting." },
  about: { path: ABOUT.path, title: ABOUT.title, description: ABOUT.description },
  "for-clubs": { path: FOR_CLUBS.path, title: FOR_CLUBS.title, description: FOR_CLUBS.description },
  pricing: { path: PRICING_PAGE.path, title: PRICING_PAGE.title, description: PRICING_PAGE.description },
  privacy: { path: LEGAL.privacy.path, title: `${LEGAL.privacy.title} · ${SITE_NAME}`, description: LEGAL.privacy.description },
  terms: { path: LEGAL.terms.path, title: `${LEGAL.terms.title} · ${SITE_NAME}`, description: LEGAL.terms.description },
};

/**
 * What an address shows: {kind: "event", ref} for /events/{slug}[/…] and the
 * old /{ref}, /{ref}/live, /{ref}/compete, /register/{ref}; {kind: "club", slug};
 * {kind: "page", key} for the fixed pages; null for anything else.
 */
export function routeFor(raw) {
  let path = String(raw || "/").split(/[?#]/)[0];
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  const parts = path.split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (!a) return { kind: "page", key: "home" };
  if (a === "events") {
    if (!b) return parts.length === 1 ? { kind: "page", key: "events" } : null;
    return REF.test(b) && parts.length <= 3 && (!c || /^(register|live|compete)$/.test(c)) ? { kind: "event", ref: b } : null;
  }
  if (a === "clubs") {
    if (!b) return { kind: "page", key: "clubs" };
    return REF.test(b) && parts.length === 2 ? { kind: "club", slug: b } : null;
  }
  if (a === "threads") return parts.length === 1 ? { kind: "page", key: "threads" } : null;
  if (OWN_PAGES.has(a)) return parts.length === 1 ? { kind: "page", key: a } : null;
  if (a === "register") return b && REF.test(b) && parts.length === 2 ? { kind: "event", ref: b } : null;
  if (RESERVED.has(a) || !REF.test(a)) return null;
  if (parts.length === 1 || (parts.length === 2 && (b === "live" || b === "compete"))) return { kind: "event", ref: a };
  return null;
}

/** One line of plain text, cut at a word near `max`. */
export function clip(text, max = 200) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, "")}…`;
}

const absolute = (url) => (typeof url === "string" && /^https?:\/\//i.test(url) ? url : null);

/** The whole document. Every value is escaped; the JSON-LD is made safe for a <script>. */
export function buildShareHtml({ title, pageTitle, description, image, imageAlt, url, type = "website", lines = [], body = "", bodyHtml = "", linkText = "Open on MyOtherApp", jsonLd = null }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const u = escapeHtml(url);
  const img = escapeHtml(image || DEFAULT_IMAGE);
  const paragraphs = String(body || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle || title)}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="en_IN">
<meta property="og:type" content="${escapeHtml(type)}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
<meta property="og:image" content="${img}">
<meta property="og:image:alt" content="${escapeHtml(imageAlt || title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
${jsonLd ? `<script type="application/ld+json">${jsonForScript(jsonLd)}</script>\n` : ""}</head>
<body>
<main>
<h1>${t}</h1>
${lines
  .filter(Boolean)
  .map((l) => `<p>${escapeHtml(l)}</p>`)
  .join("\n")}
${bodyHtml || paragraphs || `<p>${d}</p>`}
<p><a href="${u}">${escapeHtml(linkText)}</a></p>
</main>
</body>
</html>
`;
}

/* The site's own pages carry their words, so a crawler reads what a person does. Every piece is escaped here. */
const inlineHtml = (text) =>
  inline(text)
    .map((p) => {
      if (p.strong !== undefined) return `<strong>${escapeHtml(p.strong)}</strong>`;
      if (p.link !== undefined) return `<a href="${escapeHtml(p.href.startsWith("/") ? `${SITE_URL}${p.href}` : p.href)}">${escapeHtml(p.link)}</a>`;
      return escapeHtml(p.text);
    })
    .join("");
const blockHtml = ([kind, body]) => {
  if (kind === "h3") return `<h3>${escapeHtml(body)}</h3>`;
  if (kind === "ul" || kind === "ol") return `<${kind}>${body.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${kind}>`;
  return `<p>${inlineHtml(body)}</p>`;
};

function ownPageHtml(key) {
  const doc = LEGAL[key];
  if (doc) {
    return [
      `<p>Last updated ${escapeHtml(updatedLabel(doc.updated))}</p>`,
      ...doc.intro.map(blockHtml),
      ...doc.sections.map((s) => [`<h2 id="${escapeHtml(s.id)}">${escapeHtml(s.heading)}</h2>`, ...s.blocks.map(blockHtml)].join("\n")),
    ].join("\n");
  }
  if (key === "about") {
    const list = (title, items) => `<h2>${escapeHtml(title)}</h2>\n<ul>${items.map((f) => `<li><strong>${escapeHtml(f.title)}</strong>: ${escapeHtml(f.text)}</li>`).join("")}</ul>`;
    return [`<p>${escapeHtml(ABOUT.lede)}</p>`, list("For students", ABOUT.students), list("For clubs", ABOUT.clubs), list("How it works", ABOUT.steps)].join("\n");
  }
  return "";
}

/**
 * For clubs and Pricing, in words a crawler reads: what clubs get (on
 * /for-clubs), every plan with its prices when the API gave them, and the
 * questions. Every piece is escaped here.
 */
function clubsPageHtml(key, data) {
  const parts = [];
  const items = (rows) => rows.map((r) => `<li><strong>${escapeHtml(r.title)}</strong>: ${escapeHtml(r.text)}</li>`).join("");
  if (key === "for-clubs") {
    parts.push(`<p>${escapeHtml(FOR_CLUBS.lede)}</p>`);
    for (const phase of FOR_CLUBS.phases) parts.push(`<h2>${escapeHtml(`${phase.when}: ${phase.title}`)}</h2>\n<ul>${items(phase.features)}</ul>`);
    parts.push(`<h2>How it works</h2>\n<ol>${items(FOR_CLUBS.steps)}</ol>`);
  }
  if (data) {
    const offer = yearlyOffer(data.yearlyMonthsFree);
    parts.push("<h2>Pricing</h2>");
    if (offer) parts.push(`<p>Pay yearly and get ${escapeHtml(offer)}.</p>`);
    parts.push(`<ul>${data.plans.map((p) => `<li><strong>${escapeHtml(p.name)}</strong>: ${escapeHtml(planSummary(p, data.currency))}</li>`).join("")}</ul>`);
  }
  parts.push("<h2>Questions</h2>");
  for (const q of clubFaq({ yearlyMonthsFree: data?.yearlyMonthsFree ?? null })) {
    parts.push(`<h3>${escapeHtml(q.q)}</h3>`, ...q.a.map((t) => `<p>${inlineHtml(t)}</p>`));
  }
  return parts.join("\n");
}

/** /for-clubs and /pricing: the page's own words, with the plans and their structured data when the API answers. */
async function plansDocument(key, fetchDoc) {
  let data = null;
  try {
    data = parsePlans((await fetchDoc("/api/v1/plans")).data);
  } catch {
    data = null;
  }
  const page = PAGES[key];
  const url = `${SITE_URL}${page.path}`;
  return {
    status: 200,
    cache: data ? CACHE : CACHE_SHORT,
    html: buildShareHtml({
      title: page.title,
      description: page.description,
      url,
      image: DEFAULT_IMAGE,
      bodyHtml: clubsPageHtml(key, data),
      linkText: key === "pricing" ? "See the plans on MyOtherApp" : "MyOtherApp for clubs",
      jsonLd: data ? plansJsonLd(data, { url, siteUrl: SITE_URL, description: page.description }) : null,
    }),
  };
}

const generic = (key = "home", status = 200, cache = CACHE) => {
  const page = PAGES[key] || PAGES.home;
  return {
    status,
    cache,
    html: buildShareHtml({
      title: page.title,
      description: page.description,
      url: `${SITE_URL}${page.path}`,
      image: DEFAULT_IMAGE,
      bodyHtml: status === 200 ? ownPageHtml(key) : "",
      linkText: "Open MyOtherApp",
    }),
  };
};

function eventDocument(d) {
  const event = d?.event;
  if (!event || !event.name) return null;
  const club = d.club && d.club.name ? d.club : null;
  const ref = event.slug || event.id;
  const url = `${SITE_URL}/events/${encodeURIComponent(ref)}`;
  const when = formatWhen(event.starts_at);
  const where = event.is_online ? "Online" : event.location_name || null;
  const price = formatPrice(event.has_fee, event.fee);
  const facts = [when ? `${when} IST` : null, where, price].filter(Boolean).join(" · ");
  const about = clip(event.about, 160);
  const poster = absolute(imageUrl(event.poster, "medium")) || absolute(imageUrl(event.poster_thumb, "medium"));
  return {
    title: event.name,
    pageTitle: `${event.name} · ${SITE_NAME}`,
    description: clip([facts, about || (club ? `Hosted by ${club.name} on ${SITE_NAME}.` : null)].filter(Boolean).join(". "), 220),
    image: poster || DEFAULT_IMAGE,
    imageAlt: poster ? `Poster for ${event.name}` : SITE_NAME,
    url,
    type: "website",
    lines: [facts, club ? `Hosted by ${club.name}` : null],
    body: typeof event.about === "string" ? event.about.slice(0, 5000) : "",
    linkText: event.registration_open ? `Register for ${event.name} on MyOtherApp` : `See ${event.name} on MyOtherApp`,
    jsonLd: eventJsonLd({
      event,
      club,
      speakers: Array.isArray(d.speakers) ? d.speakers : [],
      image: poster,
      url,
      clubUrl: club?.slug ? `${SITE_URL}/clubs/${encodeURIComponent(club.slug)}` : null,
      description: clip(event.about, 500) || null,
    }),
  };
}

function clubDocument(d, slug) {
  const club = d?.club;
  if (!club || !club.name) return null;
  const image = absolute(imageUrl(club.cover, "original")) || absolute(imageUrl(club.logo, "medium"));
  const url = `${SITE_URL}/clubs/${encodeURIComponent(club.slug || slug)}`;
  return {
    title: club.name,
    pageTitle: `${club.name} · ${SITE_NAME}`,
    description: clip(club.tagline || club.about || `Events and posts from ${club.name} on ${SITE_NAME}.`, 220),
    image: image || DEFAULT_IMAGE,
    imageAlt: image ? club.name : SITE_NAME,
    url,
    type: "profile",
    lines: [club.tagline, club.location_name].filter(Boolean),
    body: typeof club.about === "string" ? club.about.slice(0, 5000) : "",
    linkText: `See ${club.name} on MyOtherApp`,
  };
}

/** The preview page for an address: {status, cache, html}. Never throws; falls back to the site's own tags. */
export async function shareDocument(path, { fetch: fetchDoc = fetchJson } = {}) {
  const route = routeFor(path);
  if (!route) return generic("home");
  if (route.kind === "page") return PLAN_PAGES.has(route.key) ? plansDocument(route.key, fetchDoc) : generic(route.key);
  try {
    const apiPath = route.kind === "event" ? `/api/v1/discover/events/${encodeURIComponent(route.ref)}` : `/api/v1/discover/clubs/${encodeURIComponent(route.slug)}`;
    const { status, data } = await fetchDoc(apiPath);
    const doc = data ? (route.kind === "event" ? eventDocument(data) : clubDocument(data, route.slug)) : null;
    if (doc) return { status: 200, cache: CACHE, html: buildShareHtml(doc) };
    return status === 404 ? generic("home", 404, CACHE_SHORT) : generic("home", 200, CACHE_SHORT);
  } catch {
    return generic("home", 200, CACHE_SHORT);
  }
}
