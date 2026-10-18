// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { validateItemList } from "@/seo/validate";

/*
 * /events and /clubs on the server: rendered per request for their
 * address, the first page read for the visitor (their address goes to the
 * API with the site's token), the head saying which addresses search
 * engines keep. The API is a fake; the request's headers are next/headers'.
 */
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const S3 = "https://b.s3.amazonaws.com/p.png?Signature=x&Expires=1";
const card = (id, over = {}) => ({ id, slug: `event-${id}`, name: `Event ${id}`, poster: S3, starts_at: "2026-10-30T12:30:00Z", status: "upcoming", ...over });
let fetch;
beforeEach(() => {
  requestHeaders = new Headers({ "x-forwarded-for": "49.37.10.2", "x-vercel-ip-latitude": "9.93", "x-vercel-ip-longitude": "76.27" });
  fetch = fakeFetch((url) => {
    const near = url.searchParams.has("lat");
    if (url.pathname === "/api/v1/discover/events") {
      return {
        body: {
          items: [card(1, { distance_km: near ? 2.4 : 13000 }), card(2)],
          total: 30,
          where: near ? { city: "Kochi", lat: 9.93, lng: 76.27, source: "browser" } : { city: "Thiruvananthapuram", lat: 8.5, lng: 76.9, source: "ip" },
          categories: [{ id: 4, name: "Tech", upcoming: 12 }],
        },
      };
    }
    if (url.pathname === "/api/v1/discover/clubs") {
      return { body: { items: [{ id: 5, slug: "circuit-society", name: "Circuit Society", logo: S3, followers: 40, distance_km: near ? 1 : 900 }], total: 1, where: { source: "ip" }, interests: [{ id: 12, name: "Robotics", clubs: 4 }] } };
    }
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sp = (qs) => Promise.resolve(Object.fromEntries(new URLSearchParams(qs)));
const queryOf = (i = -1) => Object.fromEntries(new URL(fetch.calls.at(i).url).searchParams);
const eventsRoute = () => import("../events/page.jsx");
const clubsRoute = () => import("../clubs/page.jsx");

describe("/events", () => {
  it("renders the first page for its address: everything (radius 0), no distances, no expiring links, an ItemList", async () => {
    const route = await eventsRoute();
    const out = html(await route.default({ searchParams: sp("type=online&sort=popular") }), "/events?type=online&sort=popular");
    expect(queryOf()).toEqual({ type: "online", radius_km: "0", sort: "popular", offset: "0", limit: "12" });
    expect(fetch.calls[0].init.next).toEqual({ revalidate: 60, tags: ["lists"] });
    for (const words of ["<h1>Online events</h1>", "Event 1", "Event 2", ">30</strong>", "Tech"]) expect(out).toContain(words);
    expect(out).not.toMatch(/km away|Signature=|Expires=/);
    const [list] = jsonLdOf(out);
    expect(validateItemList(list)).toEqual({ errors: [], warnings: [] });
    expect(list).toMatchObject({ name: "Online events", url: "https://myotherapp.in/events?type=online", numberOfItems: 2 });
    expect(list.itemListElement[0]).toEqual({ "@type": "ListItem", position: 1, url: "https://myotherapp.in/events/event-1", name: "Event 1" });
  });

  it("sends the visitor's address with the site's token, and never without it", async () => {
    const route = await eventsRoute();
    await route.default({ searchParams: sp("") });
    expect(fetch.calls[0].init.headers).toEqual({ Accept: "application/json" });
    vi.stubEnv("API_SITE_TOKEN", "s3cret");
    await route.default({ searchParams: sp("q=robots") });
    expect(fetch.calls.at(-1).init.headers).toEqual({ Accept: "application/json", "X-Site-Token": "s3cret", "X-Visitor-IP": "49.37.10.2" });
    // Still everywhere: the list is about its address, not about who asks.
    expect(queryOf()).toMatchObject({ q: "robots", radius_km: "0" });
  });

  it("follows a place in the address: near it, with distances and the API's name for it", async () => {
    const route = await eventsRoute();
    const out = html(await route.default({ searchParams: sp("near=9.93,76.27&radius_km=25&sort=distance") }));
    expect(queryOf()).toEqual({ lat: "9.93", lng: "76.27", radius_km: "25", sort: "distance", offset: "0", limit: "12" });
    expect(out).toContain("<h1>Events near Kochi</h1>");
    expect(out).toContain("2.4 km away");
  });

  it("reads only the categories for the calendar, whose month the browser reads", async () => {
    const route = await eventsRoute();
    const out = html(await route.default({ searchParams: sp("view=calendar&month=2026-11&when=today&type=online") }));
    expect(queryOf()).toEqual({ type: "online", radius_km: "0", offset: "0", limit: "1" });
    expect(jsonLdOf(out)).toEqual([]);
    expect(out).toContain("Finding this month");
  });

  it("tells search engines what to keep: /events, one known filter alone; noindex, follow for the rest", async () => {
    const route = await eventsRoute();
    const meta = async (qs) => route.generateMetadata({ searchParams: sp(qs) });
    let m = await meta("");
    expect(m.title).toBe("Find events");
    expect(m.alternates.canonical).toBe("https://myotherapp.in/events");
    expect(m.alternates.types["application/rss+xml"][0].url).toBe("https://myotherapp.in/events/rss.xml");
    expect(m.robots).toBeUndefined();
    m = await meta("category=4&utm_source=x");
    expect(m.title).toBe("Tech events");
    expect(m.alternates.canonical).toBe("https://myotherapp.in/events?category=4");
    expect(m.alternates.types["application/rss+xml"][0]).toEqual({ url: "https://myotherapp.in/events/rss.xml?category=4", title: "Tech events on MyOtherApp" });
    m = await meta("type=online&price=free");
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates.canonical).toBeUndefined();
    m = await meta("q=robots");
    expect(m).toMatchObject({ title: "Events matching “robots”", robots: { index: false, follow: true } });
    // One read for the head and the page.
    fetch.calls.length = 0;
    await meta("price=free");
    await route.default({ searchParams: sp("price=free") });
    expect(fetch.calls.length).toBeLessThanOrEqual(2);
  });

  it("lets an API failure reach the error page", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 500, body: {} })));
    const route = await eventsRoute();
    await expect(route.default({ searchParams: sp("") })).rejects.toMatchObject({ name: "ApiError", status: 500 });
  });
});

describe("/clubs", () => {
  it("renders the first clubs for its address, everywhere, with an ItemList and the head", async () => {
    const route = await clubsRoute();
    const out = html(await route.default({ searchParams: sp("interest=12") }), "/clubs?interest=12");
    expect(queryOf()).toEqual({ interest: "12", radius_km: "0", offset: "0", limit: "12" });
    expect(out).toContain("<h1>Robotics clubs</h1>");
    expect(out).toContain("Circuit Society");
    expect(out).not.toMatch(/km away|Signature=/);
    const [list] = jsonLdOf(out);
    expect(validateItemList(list).errors).toEqual([]);
    expect(list.itemListElement.map((i) => i.url)).toEqual(["https://myotherapp.in/clubs/circuit-society"]);
    const meta = await route.generateMetadata({ searchParams: sp("interest=12") });
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/clubs?interest=12");
    const searched = await route.generateMetadata({ searchParams: sp("q=drone") });
    expect(searched.robots).toEqual({ index: false, follow: true });
    expect((await route.generateMetadata({ searchParams: sp("") })).title).toBe("Clubs");
  });
});
