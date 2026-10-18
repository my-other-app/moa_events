// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeFetch } from "@/test/next";
import { parseXml } from "@/test/xml";
import { validateRss } from "@/seo/validate";

/*
 * /events/rss.xml and /clubs/{slug}/rss.xml against a fake API: the filters
 * reach the API, the feed is valid RSS, an unknown club is a 404.
 */
const card = (id, over = {}) => ({
  id,
  slug: `event-${id}`,
  name: `Event ${id}`,
  starts_at: "2026-10-30T12:30:00Z",
  location_name: id % 2 ? "Kochi, Kerala" : "Pune",
  is_online: false,
  has_fee: false,
  category: { id: 3, name: "Workshop" },
  club: { id: 3, name: "Circuit Society", slug: "circuit-society" },
  status: "upcoming",
  ...over,
});

let fetch;
beforeEach(() => {
  fetch = fakeFetch((url) => {
    if (url.pathname === "/api/v1/discover/events") {
      return { body: { items: [card(5), card(9), card(7), card(4, { status: "ended" })], total: 4, offset: 0, limit: 60, categories: [{ id: 3, name: "Workshop", upcoming: 3 }] } };
    }
    if (url.pathname.startsWith("/api/v1/discover/events/")) {
      const slug = url.pathname.split("/").pop();
      return { body: { event: { id: Number(slug.split("-")[1]), slug, name: slug, about: `All about ${slug}.` }, club: null } };
    }
    if (url.pathname === "/api/v1/discover/clubs/circuit-society") {
      return { body: { club: { id: 3, slug: "circuit-society", name: "Circuit Society", tagline: "We build things" }, upcoming: [card(9, { club: null })] } };
    }
    if (url.pathname === "/api/v1/discover/clubs/circuit-society/events") return { body: { items: [card(11, { club: null }), card(9, { club: null })], total: 2 } };
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => vi.unstubAllGlobals());

const events = async (query = "") => (await import("../events/rss.xml/route.js")).GET(new NextRequest(`https://myotherapp.in/events/rss.xml${query}`));
const clubFeed = async (slug) =>
  (await import("../clubs/[slug]/rss.xml/route.js")).GET(new NextRequest(`https://myotherapp.in/clubs/${slug}/rss.xml`), { params: Promise.resolve({ slug }) });
const listQuery = () => new URL(fetch.calls.find((c) => new URL(c.url).pathname === "/api/v1/discover/events").url).searchParams;
const titles = (doc) => [...doc.getElementsByTagName("item")].map((i) => i.getElementsByTagName("title")[0].textContent);

describe("/events/rss.xml", () => {
  it("is a valid RSS feed of upcoming events, newest first, cached for ten minutes", async () => {
    const res = await events();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("public, max-age=600, s-maxage=600, stale-while-revalidate=3600");
    const xml = await res.text();
    expect(validateRss(xml, parseXml)).toEqual({ errors: [], warnings: [] });
    const doc = parseXml(xml);
    // Ended events are left out; the rest newest first.
    expect(titles(doc)).toEqual(["Event 9", "Event 7", "Event 5"]);
    // Each with its page's words.
    expect(doc.getElementsByTagName("description")[1].textContent).toContain("All about event-9.");
    // Read from the server: never placed by the server's own address.
    expect(listQuery().get("radius_km")).toBe("0");
    expect(listQuery().get("limit")).toBe("60");
  });

  it("passes the list's filters through to the API, and names itself by them", async () => {
    const res = await events("?category=3&type=in_person&price=free&q=robots&when=this_week&bogus=1&sort=popular");
    const q = listQuery();
    expect(Object.fromEntries(q)).toMatchObject({ category: "3", type: "in_person", price: "free", q: "robots", when: "this_week", radius_km: "0", offset: "0" });
    expect(q.has("bogus")).toBe(false);
    expect(q.has("sort")).toBe(false);
    const doc = parseXml(await res.text());
    const channel = doc.getElementsByTagName("channel")[0];
    expect(channel.getElementsByTagName("title")[0].textContent).toBe("Free in-person Workshop events matching “robots” on MyOtherApp");
    expect(channel.getElementsByTagName("link")[0].textContent).toBe("https://myotherapp.in/events?q=robots&when=this_week&type=in_person&price=free&category=3");
    const self = [...channel.children].find((c) => c.localName === "link" && c.namespaceURI === "http://www.w3.org/2005/Atom");
    expect(self.getAttribute("href")).toBe("https://myotherapp.in/events/rss.xml?category=3&type=in_person&price=free&q=robots&when=this_week&bogus=1&sort=popular");
  });

  it("follows a place: near=lat,lng goes to the API as a point, and a city is searched for", async () => {
    await events("?near=9.93,76.26&radius_km=25");
    expect(Object.fromEntries(listQuery())).toMatchObject({ lat: "9.93", lng: "76.26", radius_km: "25" });
    fetch.calls.length = 0;
    const res = await events("?city=Kochi");
    expect(listQuery().get("q")).toBe("Kochi");
    expect(parseXml(await res.text()).getElementsByTagName("channel")[0].getElementsByTagName("title")[0].textContent).toBe("Upcoming events in Kochi on MyOtherApp");
    // Words and a city: the words go to the API, the city is matched on the venue.
    fetch.calls.length = 0;
    const both = parseXml(await (await events("?city=Kochi&q=robots")).text());
    expect(listQuery().get("q")).toBe("robots");
    expect(titles(both)).toEqual(["Event 9", "Event 7", "Event 5"].filter((t) => Number(t.split(" ")[1]) % 2));
  });

  it("says so (503, not kept) when the API is down", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => new TypeError("fetch failed")));
    const res = await events();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/clubs/{slug}/rss.xml", () => {
  it("is the club's upcoming events, each once, under the club's name", async () => {
    const res = await clubFeed("circuit-society");
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(validateRss(xml, parseXml).errors).toEqual([]);
    const doc = parseXml(xml);
    expect(titles(doc)).toEqual(["Event 11", "Event 9"]);
    const channel = doc.getElementsByTagName("channel")[0];
    expect(channel.getElementsByTagName("title")[0].textContent).toBe("Upcoming events from Circuit Society on MyOtherApp");
    expect(channel.getElementsByTagName("link")[0].textContent).toBe("https://myotherapp.in/clubs/circuit-society");
    expect([...doc.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "creator")].map((c) => c.textContent)).toEqual(["Circuit Society", "Circuit Society"]);
  });

  it("is a 404 for a club that doesn't exist", async () => {
    const res = await clubFeed("nobody");
    expect(res.status).toBe(404);
  });
});
