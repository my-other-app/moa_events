// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeFetch, outcome } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { parseXml, texts } from "@/test/xml";
import { validateBreadcrumbs, validateItemList, validateRss } from "@/seo/validate";

/*
 * Topics on the server, against a fake API in three states:
 *   "live"  the contract: /interests/topics (with counts), /topics/{slug},
 *           /interests/list with slugs, the discover lists with topics
 *   "list"  /interests/list has slugs, but /interests/topics isn't there yet (404)
 *   "prod"  today's production: /interests/topics is 405 (another route has
 *           /interests/{id}), /interests/topics/{slug} 404, and the list is one
 *           category, "arts", with no slug and the icon "string": no topics anywhere
 */
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

const DEV = {
  id: 1,
  slug: "development",
  name: "Development",
  icon: "💻",
  icon_type: "emoji",
  color: "#2563EB",
  description: "Build things for the web, phones and the cloud.",
  sort_order: 1,
  upcoming_events: 12,
  clubs: 30,
  interests: [
    { id: 3, slug: "web-development", name: "Web Development", upcoming_events: 4 },
    { id: 9, slug: "cybersecurity", name: "Cybersecurity", upcoming_events: 2 },
  ],
};
const ARTS = { id: 4, slug: "arts", name: "Arts", icon: "🎨", icon_type: "emoji", color: "#EA580C", description: null, upcoming_events: 0, clubs: 5, interests: [{ id: 20, slug: "music", name: "Music", upcoming_events: 0 }] };
const TOPICS = [DEV, ARTS];
const LISTED = TOPICS.map(({ upcoming_events, clubs, ...t }) => ({ ...t, interests: t.interests.map(({ upcoming_events: _, ...i }) => ({ ...i, category_id: t.id })) })); // eslint-disable-line no-unused-vars
const PROD_LIST = [{ id: 1, name: "arts", icon: "string", icon_type: "emoji", interests: [{ id: 3, name: "Web Development", icon: "string", icon_type: "emoji" }] }];
const DEV_REF = { id: 1, slug: "development", name: "Development", color: "#2563EB" };

const S3 = "https://b.s3.amazonaws.com/p.png?Signature=x&Expires=1";
const card = (id, over = {}) => ({ id, slug: `event-${id}`, name: `Event ${id}`, poster: S3, starts_at: "2026-10-30T12:30:00Z", status: "upcoming", club: { id: 5, name: "Circuit Society", slug: "circuit-society" }, ...over });
const missing = { status: 404, body: { message: "Not Found", error_code: "NOT_FOUND", errors: {} } };

let mode;
let fetch;
const api = (url) => {
  const p = url.pathname;
  if (p === "/api/v1/interests/topics") return mode === "live" ? { body: TOPICS } : mode === "prod" ? { status: 405, body: { detail: "Method Not Allowed" } } : missing;
  const one = /^\/api\/v1\/interests\/topics\/([^/]+)$/.exec(p);
  if (one) {
    if (mode !== "live") return missing;
    const t = TOPICS.find((x) => x.slug === one[1]);
    return t ? { body: t } : { status: 404, body: { message: "No such topic", error_code: "TOPIC_NOT_FOUND", errors: {} } };
  }
  if (p === "/api/v1/interests/list") return { body: mode === "prod" ? PROD_LIST : LISTED };
  if (p === "/api/v1/discover/events") {
    if (url.searchParams.get("sort") === "newest" && mode === "prod") return { status: 422, body: {} };
    return {
      body: {
        items: [card(1, { topics: mode === "prod" ? undefined : [DEV_REF], summary: "Bring a laptop." }), card(2, { summary: "Snacks." })],
        total: 30,
        where: { source: "none" },
        categories: [{ id: 7, name: "Workshop", upcoming: 9 }],
        ...(mode === "prod" ? {} : { topics: [{ ...DEV_REF, upcoming: 12 }, { id: 4, slug: "arts", name: "Arts", color: "#EA580C", upcoming: 0 }] }),
      },
    };
  }
  if (p === "/api/v1/discover/clubs") {
    return { body: { items: [{ id: 5, slug: "circuit-society", name: "Circuit Society", logo: S3, followers: 40 }], total: 1, where: { source: "none" }, interests: [{ id: 3, name: "Web Development", clubs: 4 }] } };
  }
  return missing;
};

// The pages' modules, loaded once up front (slow on a busy machine; the tests then time what they do).
beforeAll(async () => {
  await Promise.all([import("../topics/page.jsx"), import("../topics/[slug]/page.jsx"), import("../events/page.jsx"), import("../clubs/page.jsx"), import("../og/topics/[slug]/route.jsx")]);
}, 60000);

beforeEach(async () => {
  mode = "live";
  fetch = fakeFetch(api);
  vi.stubGlobal("fetch", fetch);
  (await import("@/server/topics")).forgetTopicsAbsence();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sp = (qs = "") => Promise.resolve(Object.fromEntries(new URLSearchParams(qs)));
const params = (o) => Promise.resolve(o);
const paths = () => fetch.calls.map((c) => new URL(c.url).pathname);
const lastQuery = (path) => Object.fromEntries(new URL(fetch.calls.filter((c) => new URL(c.url).pathname === path).at(-1).url).searchParams);
const typesOf = (ld) => ld.map((x) => x["@type"]);

/* ---------- /topics ---------- */

describe("/topics", () => {
  const route = () => import("../topics/page.jsx");

  it("is every topic as a card, regenerated at most every five minutes, with CollectionPage and ItemList", async () => {
    const r = await route();
    expect(r.revalidate).toBe(300);
    const out = html(await r.default(), "/topics");
    expect(out).toContain("<h1>Topics</h1>");
    for (const words of ["Development", "Build things for the web", "12 upcoming events · 30 clubs", "Web Development · Cybersecurity", 'href="/topics/development"', 'href="/topics/arts"', "--tp:#2563EB"]) {
      expect(out).toContain(words);
    }
    expect(fetch.calls[0].init.next).toEqual({ revalidate: 300, tags: ["topics"] });
    const ld = jsonLdOf(out);
    expect(typesOf(ld)).toEqual(["CollectionPage", "ItemList"]);
    const [page, list] = ld;
    expect(page).toMatchObject({ "@id": "https://myotherapp.in/topics", url: "https://myotherapp.in/topics", name: "Topics", mainEntity: { "@id": "https://myotherapp.in/topics#topics" } });
    expect(validateItemList(list)).toEqual({ errors: [], warnings: [] });
    expect(list.itemListElement.map((i) => i.url)).toEqual(["https://myotherapp.in/topics/development", "https://myotherapp.in/topics/arts"]);
  });

  it("has a canonical, Open Graph and a Twitter card", async () => {
    const meta = await (await route()).generateMetadata();
    expect(meta.title).toBe("Topics");
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/topics");
    expect(meta.description).toMatch(/^Browse events and clubs by topic: Development, Arts\./);
    expect(meta.openGraph).toMatchObject({ url: "https://myotherapp.in/topics", title: "Topics · MyOtherApp", siteName: "MyOtherApp", locale: "en_IN" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: "Topics · MyOtherApp" });
    expect(meta.robots).toBeUndefined();
  });

  it("renders from /interests/list when /interests/topics isn't there yet (slugs, no counts)", async () => {
    mode = "list";
    const out = html(await (await route()).default(), "/topics");
    expect(paths()).toEqual(["/api/v1/interests/topics", "/api/v1/interests/list"]);
    expect(out).toContain('href="/topics/development"');
    expect(out).not.toMatch(/upcoming event|\d+ clubs/);
  });

  it("is the 404 page while the API has no topics (today's: one category, no slugs), or none at all", async () => {
    mode = "prod";
    const r = await route();
    expect(await outcome(() => r.default())).toEqual({ notFound: true });
    expect((await r.generateMetadata()).robots).toEqual({ index: false, follow: true });
    vi.stubGlobal("fetch", fakeFetch(() => missing));
    expect(await outcome(() => r.default())).toEqual({ notFound: true });
  });

  it("lets an API failure reach the error page (ISR keeps the last good copy)", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 500, body: {} })));
    await expect((await route()).default()).rejects.toMatchObject({ name: "ApiError", status: 500 });
  });

  it("asks an API without /interests/topics once, not on every render (only 200s are cached)", async () => {
    mode = "prod";
    const r = await route();
    for (let i = 0; i < 3; i += 1) expect(await outcome(() => r.default())).toEqual({ notFound: true });
    expect(paths().filter((p) => p === "/api/v1/interests/topics")).toHaveLength(1);
    expect(paths().filter((p) => p === "/api/v1/interests/list")).toHaveLength(3);
  });
});

/* ---------- /topics/{slug} ---------- */

describe("/topics/{slug}", () => {
  const route = () => import("../topics/[slug]/page.jsx");
  const render = async (slug, qs = "") => html(await (await route()).default({ params: params({ slug }), searchParams: sp(qs) }), `/topics/${slug}${qs ? `?${qs}` : ""}`);

  it("is the topic, its interests as links, its events and clubs, read for nobody and everywhere", async () => {
    const out = await render("development");
    expect(out).toContain("<h1>Development</h1>");
    for (const words of [
      "Build things for the web",
      "12 upcoming events · 30 clubs",
      'href="/topics/development?interest=3"',
      'href="/topics/development?interest=9"',
      "Upcoming Development events",
      "Event 1",
      "Event 2",
      'href="/clubs?topic=development"',
      "Development clubs",
      "Circuit Society",
      'href="/topics/arts"',
      'href="/topics/development/rss.xml"',
      'href="/topics"',
    ]) {
      expect(out).toContain(words);
    }
    expect(out).not.toMatch(/Signature=|Expires=|km away/);
    expect(lastQuery("/api/v1/discover/events")).toEqual({ topic: "development", radius_km: "0", offset: "0", limit: "12" });
    expect(lastQuery("/api/v1/discover/clubs")).toEqual({ topic: "development", radius_km: "0", offset: "0", limit: "8" });
    // Read for nobody: no visitor's address, shared by everyone.
    for (const c of fetch.calls) expect(c.init.headers).toEqual({ Accept: "application/json" });
  });

  it("has CollectionPage, ItemList and BreadcrumbList (Home › Topics › Topic)", async () => {
    const ld = jsonLdOf(await render("development"));
    expect(typesOf(ld)).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);
    const [page, list, crumbs] = ld;
    expect(page).toMatchObject({
      url: "https://myotherapp.in/topics/development",
      about: { "@type": "Thing", name: "Development" },
      mainEntity: { "@id": "https://myotherapp.in/topics/development#events" },
    });
    expect(page.image).toMatch(/^https:\/\/myotherapp\.in\/og\/topics\/development\?v=/);
    expect(validateItemList(list)).toEqual({ errors: [], warnings: [] });
    expect(list.itemListElement.map((i) => i.url)).toEqual(["https://myotherapp.in/events/event-1", "https://myotherapp.in/events/event-2"]);
    expect(validateBreadcrumbs(crumbs)).toEqual({ errors: [], warnings: [] });
    expect(crumbs.itemListElement.map((i) => [i.name, i.item])).toEqual([
      ["Home", "https://myotherapp.in/"],
      ["Topics", "https://myotherapp.in/topics"],
      ["Development", "https://myotherapp.in/topics/development"],
    ]);
  });

  it("has its canonical, share picture (made like the event and club ones) and feed in the head", async () => {
    const meta = await (await route()).generateMetadata({ params: params({ slug: "development" }), searchParams: sp("utm_source=x") });
    expect(meta.title).toBe("Development events and clubs");
    expect(meta.description).toBe("Build things for the web, phones and the cloud.");
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/topics/development");
    expect(meta.alternates.types["application/rss+xml"][0]).toEqual({ url: "https://myotherapp.in/topics/development/rss.xml", title: "Development events on MyOtherApp" });
    expect(meta.openGraph.images[0]).toMatchObject({ width: 1200, height: 630, alt: "Development on MyOtherApp" });
    expect(meta.openGraph.images[0].url).toMatch(/^https:\/\/myotherapp\.in\/og\/topics\/development\?v=[a-z0-9]+$/);
    expect(meta.twitter.images[0]).toBe(meta.openGraph.images[0].url);
    expect(meta.robots).toBeUndefined();
  });

  it("filters by one of its interests (?interest=), crawlable, with the unfiltered page as canonical", async () => {
    const out = await render("development", "interest=3");
    expect(lastQuery("/api/v1/discover/events")).toMatchObject({ topic: "development", interest: "3" });
    expect(lastQuery("/api/v1/discover/clubs")).toMatchObject({ topic: "development", interest: "3" });
    expect(out).toContain("Upcoming Web Development events");
    expect(out).toMatch(/aria-current="true"[^>]*href="\/topics\/development"|href="\/topics\/development"[^>]*aria-current="true"/);
    expect(out).toContain('href="/clubs?interest=3"');
    const meta = await (await route()).generateMetadata({ params: params({ slug: "development" }), searchParams: sp("interest=3") });
    expect(meta.title).toBe("Web Development events and clubs");
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/topics/development");
    expect(meta.alternates.types["application/rss+xml"][0].url).toBe("https://myotherapp.in/topics/development/rss.xml?interest=3");
    expect(meta.robots).toBeUndefined();
    // The JSON-LD still names the canonical address.
    expect(jsonLdOf(out)[0].url).toBe("https://myotherapp.in/topics/development");
  });

  it("ignores an interest that isn't the topic's own", async () => {
    await render("development", "interest=20");
    expect(lastQuery("/api/v1/discover/events")).not.toHaveProperty("interest");
  });

  it("is a 404 for a topic that doesn't exist, and while the API has no topics", async () => {
    const r = await route();
    expect(await outcome(() => r.default({ params: params({ slug: "knitting" }), searchParams: sp() }))).toEqual({ notFound: true });
    expect((await r.generateMetadata({ params: params({ slug: "knitting" }), searchParams: sp() })).robots).toEqual({ index: false, follow: true });
    expect(await outcome(() => r.default({ params: params({ slug: "bad slug!" }), searchParams: sp() }))).toEqual({ notFound: true });
    mode = "prod";
    expect(await outcome(() => r.default({ params: params({ slug: "arts" }), searchParams: sp() }))).toEqual({ notFound: true });
    expect(paths()).not.toContain("/api/v1/discover/events");
  });

  it("is still the topic's page when only the list has it (no /interests/topics/{slug} yet)", async () => {
    mode = "list";
    const out = await render("development");
    expect(out).toContain("<h1>Development</h1>");
    expect(out).not.toContain("upcoming events ·");
  });

  it("moves its id, or another spelling of its slug, to the slug (308), keeping the interest", async () => {
    const r = await route();
    expect(await outcome(() => r.default({ params: params({ slug: "1" }), searchParams: sp("interest=3") }))).toEqual({ redirect: { url: "/topics/development?interest=3", status: 308 } });
    expect(await outcome(() => r.default({ params: params({ slug: "Development" }), searchParams: sp() }))).toEqual({ redirect: { url: "/topics/development", status: 308 } });
  });

  it("lets an API failure reach the error page", async () => {
    vi.stubGlobal("fetch", fakeFetch((url) => (url.pathname === "/api/v1/discover/events" ? { status: 500, body: {} } : api(url))));
    await expect((await route()).default({ params: params({ slug: "development" }), searchParams: sp() })).rejects.toMatchObject({ name: "ApiError", status: 500 });
  });
});

/* ---------- /topics/{slug}/rss.xml ---------- */

describe("/topics/{slug}/rss.xml", () => {
  const feed = async (slug, qs = "") =>
    (await import("../topics/[slug]/rss.xml/route.js")).GET(new NextRequest(`https://myotherapp.in/topics/${slug}/rss.xml${qs}`), { params: params({ slug }) });

  it("is the topic's upcoming events, newest first, in the same RSS as the other feeds", async () => {
    const res = await feed("development");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=600, s-maxage=600, stale-while-revalidate=3600");
    const xml = await res.text();
    expect(validateRss(xml, parseXml)).toEqual({ errors: [], warnings: [] });
    const doc = parseXml(xml);
    expect(texts(doc, "title")[0]).toBe("Upcoming Development events on MyOtherApp");
    expect(texts(doc, "link")[0]).toBe("https://myotherapp.in/topics/development");
    expect(doc.getElementsByTagName("atom:link")[0].getAttribute("href")).toBe("https://myotherapp.in/topics/development/rss.xml");
    expect(texts(doc, "category")).toContain("Development");
    expect(lastQuery("/api/v1/discover/events")).toEqual({ topic: "development", radius_km: "0", sort: "newest", offset: "0", limit: "60" });
  });

  it("narrows to one of its interests", async () => {
    const xml = await (await feed("development", "?interest=9")).text();
    expect(lastQuery("/api/v1/discover/events")).toMatchObject({ topic: "development", interest: "9" });
    const doc = parseXml(xml);
    expect(texts(doc, "title")[0]).toBe("Upcoming Cybersecurity events on MyOtherApp");
    expect(doc.getElementsByTagName("atom:link")[0].getAttribute("href")).toBe("https://myotherapp.in/topics/development/rss.xml?interest=9");
  });

  it("is a 404 for an unknown topic, and while the API has no topics", async () => {
    expect((await feed("knitting")).status).toBe(404);
    mode = "prod";
    expect((await feed("arts")).status).toBe(404);
  });

  it("says try again (503) when the API fails", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 500, body: {} })));
    const res = await feed("development");
    expect(res.status).toBe(503);
  });
});

describe("/events/rss.xml's second page", () => {
  const feed = async () => (await import("../events/rss.xml/route.js")).GET(new NextRequest("https://myotherapp.in/events/rss.xml"));
  const full = (from) => Array.from({ length: 60 }, (_, i) => card(from + i));
  const listing = (next) =>
    fakeFetch((url) => {
      if (url.pathname !== "/api/v1/discover/events") return missing;
      if (url.searchParams.get("sort") === "newest") return { status: 422, body: {} };
      const second = url.searchParams.has("after") || url.searchParams.get("offset") === "60";
      return { body: { items: second ? [card(999)] : full(1), total: 200, ...next } };
    });
  const listReads = (f) => f.calls.map((c) => new URL(c.url)).filter((u) => u.pathname === "/api/v1/discover/events" && u.searchParams.get("sort") !== "newest");

  it("is asked for after the first page's cursor, with no offset", async () => {
    const f = listing({ next_cursor: "c60" });
    vi.stubGlobal("fetch", f);
    expect((await feed()).status).toBe(200);
    const [, second] = listReads(f);
    expect(second.searchParams.get("after")).toBe("c60");
    expect(second.searchParams.has("offset")).toBe(false);
  });

  it("is asked for by offset from an API without cursors, and not at all after a null cursor", async () => {
    let f = listing({});
    vi.stubGlobal("fetch", f);
    await feed();
    expect(listReads(f)[1].searchParams.get("offset")).toBe("60");
    f = listing({ next_cursor: null });
    vi.stubGlobal("fetch", f);
    await feed();
    expect(listReads(f)).toHaveLength(1);
  });

  it("keeps the 503 when the API fails", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 500, body: {} })));
    const res = await feed();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("120");
  });
});

/* ---------- the sitemap ---------- */

describe("the topics in the sitemap", () => {
  const index = async () => (await import("../sitemap.xml/route.js")).GET();
  const page = async (name) => (await import("../sitemaps/[name]/route.js")).GET(new Request(`https://myotherapp.in/sitemaps/${name}`), { params: params({ name }) });

  it("lists /topics and every topic's page, in their own sitemap in the index", async () => {
    const locs = texts(parseXml(await (await index()).text()), "loc");
    expect(locs.slice(0, 2)).toEqual(["https://myotherapp.in/sitemaps/pages.xml", "https://myotherapp.in/sitemaps/topics.xml"]);
    const res = await page("topics.xml");
    expect(res.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    const doc = parseXml(await res.text());
    expect(texts(doc, "loc")).toEqual(["https://myotherapp.in/topics", "https://myotherapp.in/topics/development", "https://myotherapp.in/topics/arts"]);
    expect(texts(doc, "changefreq")).toEqual(["daily", "daily", "daily"]);
  });

  it("leaves them out while the API has no topics", async () => {
    mode = "prod";
    expect(texts(parseXml(await (await index()).text()), "loc")).not.toContain("https://myotherapp.in/sitemaps/topics.xml");
    expect((await page("topics.xml")).status).toBe(404);
  });
});

/* ---------- the share picture ---------- */

describe("/og/topics/{slug}", () => {
  const og = async (slug) => (await import("../og/topics/[slug]/route.jsx")).GET(new Request(`https://myotherapp.in/og/topics/${slug}`), { params: params({ slug }) });

  it("is a 404 for an unknown topic and a 502 when the API fails, as for events and clubs", async () => {
    const res = await og("knitting");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 500, body: {} })));
    expect((await og("development")).status).toBe(502);
  });

  it("draws the topic as a 1200×630 PNG, kept for a day at the edge", async () => {
    const res = await og("development");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
    const png = new Uint8Array(await res.arrayBuffer());
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
    const view = new DataView(png.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
  }, 30000);
});

/* ---------- /api/revalidate ---------- */

describe("/api/revalidate", () => {
  it("reads the topics again when the API says they changed", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "s3cret");
    const { POST } = await import("../api/revalidate/route.js");
    const { revalidateTag } = await import("next/cache");
    const res = await POST(new Request("https://myotherapp.in/api/revalidate", { method: "POST", headers: { authorization: "Bearer s3cret" }, body: JSON.stringify({ topics: true }) }));
    expect(await res.json()).toEqual({ revalidated: { events: [], clubs: [], sitemap: false, topics: true } });
    expect(revalidateTag).toHaveBeenCalledWith("topics", "max");
  });
});

/* ---------- the footer's link ---------- */

describe("whether the footer links to /topics", () => {
  const has = async () => (await import("@/server/topics")).hasTopics();

  it("is yes once the API has topics, and no while it has none, fails, or doesn't answer", async () => {
    expect(await has()).toBe(true);
    mode = "list";
    expect(await has()).toBe(true);
    mode = "prod";
    expect(await has()).toBe(false);
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 503, body: {} })));
    expect(await has()).toBe(false);
    vi.stubGlobal("fetch", fakeFetch(() => new TypeError("fetch failed")));
    expect(await has()).toBe(false);
  });
});

/* ---------- the find pages' topic filter ---------- */

describe("/events and /clubs, by topic", () => {
  const events = () => import("../events/page.jsx");
  const clubs = () => import("../clubs/page.jsx");
  const page = async (r, qs, path) => html(await (await r()).default({ searchParams: sp(qs) }), `${path}${qs ? `?${qs}` : ""}`);
  const meta = async (r, qs) => (await r()).generateMetadata({ searchParams: sp(qs) });

  it("offers the list's topics in a Topic filter, and reads the topics only once one is picked", async () => {
    const out = await page(events, "", "/events");
    expect(out).toContain(">Topic</label>");
    expect(out).toContain('<option value="development">Development</option>');
    expect(paths()).not.toContain("/api/v1/interests/topics");
  });

  it("lists a topic's events, with its interests as links, and points search engines to the topic's page", async () => {
    const out = await page(events, "topic=development", "/events");
    expect(lastQuery("/api/v1/discover/events")).toMatchObject({ topic: "development" });
    expect(out).toContain("<h1>Development events</h1>");
    expect(out).toContain("All Development");
    expect(out).toContain('href="/events?topic=development&amp;interest=3"');
    const m = await meta(events, "topic=development");
    expect(m.title).toBe("Development events");
    expect(m.alternates.canonical).toBe("https://myotherapp.in/topics/development");
    expect(m.robots).toBeUndefined();
    expect(m.alternates.types["application/rss+xml"][0]).toEqual({ url: "https://myotherapp.in/events/rss.xml?topic=development", title: "Development events on MyOtherApp" });
  });

  it("names a picked interest, and doesn't keep the mix in search results", async () => {
    const out = await page(events, "topic=development&interest=3", "/events");
    expect(lastQuery("/api/v1/discover/events")).toMatchObject({ topic: "development", interest: "3" });
    expect(out).toContain("<h1>Web Development events</h1>");
    const m = await meta(events, "topic=development&interest=3");
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates.canonical).toBeUndefined();
  });

  it("filters clubs by topic, its interests as the chips, kept at its own canonical", async () => {
    const out = await page(clubs, "topic=development", "/clubs");
    expect(lastQuery("/api/v1/discover/clubs")).toMatchObject({ topic: "development" });
    expect(out).toContain("<h1>Development clubs</h1>");
    expect(out).toMatch(/<option value="development"( selected="")?>Development<\/option>/);
    expect(out).toContain("All Development");
    expect(out).toContain('href="/clubs?topic=development&amp;interest=9"');
    expect(out).not.toContain(">Music<");
    const m = await meta(clubs, "topic=development");
    expect(m.alternates.canonical).toBe("https://myotherapp.in/clubs?topic=development");
    expect(m.robots).toBeUndefined();
  });

  it("is as before while the API has no topics: no filter, no chips, nothing named or kept by topic", async () => {
    mode = "prod";
    for (const [r, path] of [
      [events, "/events"],
      [clubs, "/clubs"],
    ]) {
      const out = await page(r, "", path);
      expect(out).not.toMatch(/Any topic|>Topic</);
      const picked = await page(r, "topic=development", path);
      expect(picked).not.toMatch(/Any topic|All Development|<h1>Development/);
      expect(picked).toMatch(/<h1>(Upcoming events|Clubs on MyOtherApp)<\/h1>/);
      expect((await meta(r, "topic=development")).robots).toEqual({ index: false, follow: true });
    }
    expect((await meta(events, "")).alternates.canonical).toBe("https://myotherapp.in/events");
  });
});
