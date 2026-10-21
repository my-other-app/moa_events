// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, outcome } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { parseXml, texts } from "@/test/xml";
import { validateBreadcrumbs, validateItemList } from "@/seo/validate";

/*
 * The city pages on the server (/events/in, /events/in/{city},
 * /clubs/in/{city}), the cities sitemap and "Browse by city" on /events,
 * against a fake API that answers a radius read like the real one: every
 * in-person event inside the radius (and those without a point).
 */
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const S3 = "https://b.s3.amazonaws.com/p.png?Signature=x&Expires=1";
const club = (slug, name) => ({ id: slug, slug, name, logo: S3 });
const REAL = club("rustaceans-kochi", "Rustaceans Kochi");
const DEMO = club("borrow-checkers-kochi", "Borrow Checkers Kochi");
const ev = (id, over) => ({ id, slug: `event-${id}`, name: `Event ${id}`, poster: S3, starts_at: "2026-11-01T13:00:00Z", status: "upcoming", is_online: false, has_fee: false, club: REAL, ...over });

const EVENTS = [
  ev(1, { name: "Rust Night", location_name: "Thuruthu Coworks, Panampilly Nagar, Kochi 682036", lat: 9.9627, lng: 76.2955 }),
  ev(2, { name: "Demo Meetup", location_name: "Nilavelicham Studio, Fort Kochi, Kochi 682001", lat: 10.0016, lng: 76.2957, club: DEMO }),
  // Inside Kochi's radius, but its words say Thrissur: not on Kochi's page.
  ev(3, { name: "Pooram Jam", location_name: "Ollur, Thrissur", lat: 10.15, lng: 76.27 }),
  ev(6, { name: "Thrissur Fest", location_name: "College Auditorium, Ollur, Thrissur", lat: 10.4749, lng: 76.2395 }),
  // No point, its words name Kochi.
  ev(4, { name: "Ernakulam Book Swap", location_name: "Public Library, Ernakulam", lat: null, lng: null }),
  ev(5, { name: "Kozhikode Run", location_name: "Kozhikode Beach, Kozhikode 673032", lat: 11.2574, lng: 75.7674 }),
];
const CLUBS = [
  { ...REAL, followers: 30, location_name: "Panampilly Nagar, Kochi", lat: 9.96, lng: 76.29 },
  { ...DEMO, followers: 800, location_name: "Panampilly Nagar, Kochi", lat: 9.96, lng: 76.29 },
  { ...club("thrissur-sound", "Thrissur Sound"), followers: 10, location_name: "Ollur, Thrissur", lat: 10.47, lng: 76.24 },
];

const km = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const within = (url, rows) => {
  const here = { lat: Number(url.searchParams.get("lat")), lng: Number(url.searchParams.get("lng")) };
  const radius = Number(url.searchParams.get("radius_km"));
  return rows
    .filter((r) => r.lat === null || km(here, r) <= radius)
    .map((r) => ({ ...r, distance_km: r.lat === null ? null : Math.round(km(here, r) * 10) / 10 }));
};

let fetch;
beforeEach(() => {
  fetch = fakeFetch((url) => {
    if (url.pathname === "/api/v1/discover/events") {
      const items = url.searchParams.has("lat") ? within(url, EVENTS) : EVENTS;
      return { body: { items, total: items.length, categories: [] } };
    }
    if (url.pathname === "/api/v1/discover/clubs") {
      const items = url.searchParams.has("lat") ? within(url, CLUBS) : CLUBS;
      return { body: { items, total: items.length, interests: [] } };
    }
    if (url.pathname === "/api/v1/interests/topics") return { body: [{ id: 4, slug: "development", name: "Development", color: "#2563EB", interests: [] }] };
    if (url.pathname === "/api/v1/discover/sitemap/index") return { status: 404, body: {} };
    if (url.pathname === "/api/v1/discover/sitemap") return { body: { events: [], clubs: [] } };
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const params = (o) => Promise.resolve(o);
const cityRoute = () => import("../events/in/[city]/page.jsx");

describe("/events/in/{city}", () => {
  it("lists the city's events in the HTML, under its own <h1>, regenerated every five minutes", async () => {
    const route = await cityRoute();
    expect(route.revalidate).toBe(300);
    expect(route.generateStaticParams()).toEqual([]);
    const out = html(await route.default({ params: params({ city: "kochi" }) }), "/events/in/kochi");
    expect(out).toContain("<h1>Events in Kochi: hackathons, workshops and meetups</h1>");
    for (const name of ["Rust Night", "Demo Meetup", "Ernakulam Book Swap"]) expect(out).toContain(name);
    for (const name of ["Pooram Jam", "Kozhikode Run", "Thrissur Fest"]) expect(out).not.toContain(name);
    // Its intro, its clubs, the topics and the other cities, all plain links.
    expect(out).toMatch(/3 upcoming in-person events from 2 clubs in and around Kochi/);
    expect(out).toContain('href="/clubs/in/kochi"');
    expect(out).toContain('href="/topics/development"');
    expect(out).toContain('href="/events/in/thrissur"');
    expect(out).toContain('href="/events?near=9.9816,76.2999&amp;radius_km=25"');
    expect(out).toContain('aria-label="Breadcrumb"');
    // A city page is about the city, not the reader: no distances; no expiring links.
    expect(out).not.toMatch(/km away/);
    expect(out).not.toMatch(/Signature=|Expires=/);
    // The read: in person, inside Kochi's radius, soonest first.
    const read = fetch.calls.map((c) => new URL(c.url)).find((u) => u.pathname === "/api/v1/discover/events" && u.searchParams.get("lat") === "9.9816");
    expect(Object.fromEntries(read.searchParams)).toEqual({ lat: "9.9816", lng: "76.2999", radius_km: "25", type: "in_person", sort: "date", offset: "0", limit: "60" });
  });

  it("is a CollectionPage with an ItemList of its real events (the demo one left out) and its breadcrumbs", async () => {
    const route = await cityRoute();
    const lds = jsonLdOf(html(await route.default({ params: params({ city: "kochi" }) })));
    expect(lds.map((l) => l["@type"])).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);
    expect(validateItemList(lds[1])).toEqual({ errors: [], warnings: [] });
    expect(lds[1].itemListElement.map((i) => i.name)).toEqual(["Rust Night", "Ernakulam Book Swap"]);
    expect(validateBreadcrumbs(lds[2]).errors).toEqual([]);
  });

  it("is indexed with a real event, and noindex, follow when it has only demo ones or none", async () => {
    const route = await cityRoute();
    const kochi = await route.generateMetadata({ params: params({ city: "kochi" }) });
    expect(kochi.alternates.canonical).toBe("https://myotherapp.in/events/in/kochi");
    expect(kochi.robots).toBeUndefined();
    expect((await route.generateMetadata({ params: params({ city: "kannur" }) })).robots).toEqual({ index: false, follow: true });
    EVENTS.push(ev(9, { name: "Only demo", location_name: "Kannur 670001", lat: 11.87, lng: 75.37, club: DEMO }));
    try {
      expect((await route.generateMetadata({ params: params({ city: "kannur" }) })).robots).toEqual({ index: false, follow: true });
      // The switch off: a demo event counts like any other.
      vi.stubEnv("DEMO_NOINDEX", "off");
      expect((await route.generateMetadata({ params: params({ city: "kannur" }) })).robots).toBeUndefined();
    } finally {
      EVENTS.pop();
    }
  });

  it("moves another name for the city to its own address (308), and 404s a city it doesn't know", async () => {
    const route = await cityRoute();
    expect(await outcome(() => route.default({ params: params({ city: "cochin" }) }))).toEqual({ redirect: { url: "/events/in/kochi", status: 308 } });
    expect(await outcome(() => route.default({ params: params({ city: "trivandrum" }) }))).toEqual({ redirect: { url: "/events/in/thiruvananthapuram", status: 308 } });
    expect(await outcome(() => route.default({ params: params({ city: "atlantis" }) }))).toEqual({ notFound: true });
    expect((await route.generateMetadata({ params: params({ city: "atlantis" }) })).robots).toEqual({ index: false, follow: true });
  });
});

describe("/clubs/in/{city}", () => {
  it("lists the city's clubs, its real ones in the ItemList, indexed with one", async () => {
    const route = await import("../clubs/in/[city]/page.jsx");
    const out = html(await route.default({ params: params({ city: "kochi" }) }), "/clubs/in/kochi");
    expect(out).toContain("<h1>Clubs in Kochi</h1>");
    expect(out).toContain("Rustaceans Kochi");
    expect(out).toContain("Borrow Checkers Kochi");
    expect(out).not.toContain("Thrissur Sound");
    const list = jsonLdOf(out).find((l) => l["@type"] === "ItemList");
    expect(list.itemListElement.map((i) => i.name)).toEqual(["Rustaceans Kochi"]);
    expect((await route.generateMetadata({ params: params({ city: "kochi" }) })).robots).toBeUndefined();
    expect(await outcome(() => route.default({ params: params({ city: "ernakulam" }) }))).toEqual({ redirect: { url: "/clubs/in/kochi", status: 308 } });
  });

  it("sends /clubs/in to the cities, once", async () => {
    const route = await import("../clubs/in/page.jsx");
    expect(await outcome(() => route.default())).toEqual({ redirect: { url: "/events/in", status: 308 } });
  });
});

describe("/events/in, the cities", () => {
  it("links every city with upcoming events, Kerala's first, indexed while any is real", async () => {
    const route = await import("../events/in/page.jsx");
    const out = html(await route.default(), "/events/in");
    expect(out).toContain("<h1>Events by city</h1>");
    for (const city of ["kochi", "thrissur", "kozhikode"]) expect(out).toContain(`href="/events/in/${city}"`);
    expect(out).not.toContain('href="/events/in/kannur"');
    expect(out.indexOf(">Kerala<")).toBeGreaterThan(-1);
    const list = jsonLdOf(out).find((l) => l["@type"] === "ItemList");
    expect(list.itemListElement.map((i) => i.name)).toEqual(["Events in Kochi", "Events in Kozhikode", "Events in Thrissur"]);
    expect((await route.generateMetadata()).robots).toBeUndefined();
  });
});

describe("the cities sitemap", () => {
  it("lists the hub and the city pages with something real in them, and the index lists it", async () => {
    const { GET } = await import("../sitemaps/[name]/route.js");
    const res = await GET(new Request("https://myotherapp.in/sitemaps/cities.xml"), { params: params({ name: "cities.xml" }) });
    expect(texts(parseXml(await res.text()), "loc")).toEqual([
      "https://myotherapp.in/events/in",
      "https://myotherapp.in/events/in/kochi",
      "https://myotherapp.in/clubs/in/kochi",
      "https://myotherapp.in/events/in/kozhikode",
      "https://myotherapp.in/events/in/thrissur",
      "https://myotherapp.in/clubs/in/thrissur",
    ]);
    const index = await (await import("../sitemap.xml/route.js")).GET();
    expect(texts(parseXml(await index.text()), "loc")).toContain("https://myotherapp.in/sitemaps/cities.xml");
  });
});

describe("/events, browse by city", () => {
  it("links the cities with upcoming events, in plain links", async () => {
    const route = await import("../events/page.jsx");
    const out = html(await route.default({ searchParams: params({}) }), "/events");
    expect(out).toContain("Browse by city");
    expect(out).toContain('href="/events/in/kochi"');
    expect(out).toContain('href="/events/in"');
  });
});
