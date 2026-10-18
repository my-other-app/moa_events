// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEvent, parseEventDetail } from "@/api/parse";
import { parseXml } from "@/test/xml";
import { cdata, eventItem, feedCity, feedTitle, feedWhere, imageType, newestFirst, rssFeed } from "./rss";
import { validateRss } from "./validate";

const EV = "http://purl.org/rss/1.0/modules/event/";
const DC = "http://purl.org/dc/elements/1.1/";

const card = (over = {}) =>
  parseEvent({
    id: 68,
    slug: "hack-night-04",
    name: "Hack Night 04",
    poster: "https://b.s3.amazonaws.com/p/hack.medium.png?Signature=x&Expires=1",
    starts_at: "2026-10-18T12:30:00Z",
    ends_at: "2026-10-18T15:30:00Z",
    location_name: "Lab 3B, COEP",
    is_online: false,
    has_fee: true,
    fee: 250,
    category: { id: 9, name: "Hackathon" },
    club: { id: 3, name: "Circuit Society", slug: "circuit-society" },
    status: "upcoming",
    ...over,
  });

const feed = (items) =>
  rssFeed({
    title: "Upcoming events on MyOtherApp",
    description: "Everything coming up.",
    link: "https://myotherapp.in/events",
    self: "https://myotherapp.in/events/rss.xml?type=online&price=free",
    items,
    now: new Date("2026-10-18T07:00:00Z"),
  });

const child = (el, ns, name) => [...el.children].find((c) => c.namespaceURI === ns && c.localName === name)?.textContent;

describe("the events feed", () => {
  it("is well-formed RSS 2.0 that passes the feed rules, with its channel parts", () => {
    const xml = feed([{ card: card(), detail: null }]);
    expect(validateRss(xml, parseXml)).toEqual({ errors: [], warnings: [] });
    const doc = parseXml(xml);
    const channel = doc.getElementsByTagName("channel")[0];
    const text = (tag) => [...channel.children].find((c) => c.tagName === tag)?.textContent;
    expect(text("title")).toBe("Upcoming events on MyOtherApp");
    expect(text("lastBuildDate")).toBe("Sun, 18 Oct 2026 07:00:00 GMT");
    expect(text("ttl")).toBe("60");
    expect(text("language")).toBe("en-in");
    const self = [...channel.children].find((c) => c.localName === "link" && c.namespaceURI === "http://www.w3.org/2005/Atom");
    expect(self.getAttribute("href")).toBe("https://myotherapp.in/events/rss.xml?type=online&price=free");
    expect(self.getAttribute("rel")).toBe("self");
    expect(self.getAttribute("type")).toBe("application/rss+xml");
  });

  it("gives each event its permalink, a summary in CDATA, its dates, picture, club and the event module", () => {
    const detail = parseEventDetail({ id: 68, name: "Hack Night 04", about: "Twenty-four hours of building. Bring a laptop.", interests: ["Hardware", "Hackathon"] });
    const doc = parseXml(feed([{ card: card(), detail }]));
    const item = doc.getElementsByTagName("item")[0];
    const t = (tag) => [...item.children].find((c) => c.tagName === tag);
    expect(t("title").textContent).toBe("Hack Night 04");
    expect(t("link").textContent).toBe("https://myotherapp.in/events/hack-night-04");
    expect(t("guid").textContent).toBe("https://myotherapp.in/events/hack-night-04");
    expect(t("guid").getAttribute("isPermaLink")).toBe("true");
    // No publish time from the API: the event's start.
    expect(t("pubDate").textContent).toBe("Sun, 18 Oct 2026 12:30:00 GMT");
    expect([...item.getElementsByTagName("category")].map((c) => c.textContent)).toEqual(["Hackathon", "Hardware"]);
    const enclosure = t("enclosure");
    expect(enclosure.getAttribute("url")).toBe("https://myotherapp.in/media/events/hack-night-04/poster?size=medium");
    expect(enclosure.getAttribute("type")).toBe("image/png");
    expect(enclosure.getAttribute("length")).toBe("0");
    expect(child(item, DC, "creator")).toBe("Circuit Society");
    expect(child(item, EV, "startdate")).toBe("2026-10-18T18:00:00+05:30");
    expect(child(item, EV, "enddate")).toBe("2026-10-18T21:00:00+05:30");
    expect(child(item, EV, "location")).toBe("Lab 3B, COEP");
    expect(child(item, EV, "organizer")).toBe("Circuit Society");
    expect(child(item, EV, "type")).toBe("Hackathon");

    const html = t("description").textContent;
    expect(html).toContain("<strong>Sunday, 18 October, 6:00 PM – 9:00 PM IST</strong>");
    expect(html).toContain("Lab 3B, COEP<br>₹250 · by Circuit Society");
    expect(html).toContain("<p>Twenty-four hours of building. Bring a laptop.</p>");
    expect(html).toContain('<a href="https://myotherapp.in/events/hack-night-04">See Hack Night 04 on MyOtherApp</a>');
  });

  it("escapes &, < and quotes in titles and venues, and keeps HTML from breaking out of its CDATA", () => {
    const nasty = card({ name: `R&D <Night> "Live" 'n' ]]> more`, location_name: `Hall "A" & <B>`, club: { id: 3, name: "Fish & <Chips>", slug: "fc" } });
    const detail = parseEventDetail({ id: 68, name: "x", about: "Ends here ]]> <script>alert(1)</script>" });
    const xml = feed([{ card: nasty, detail }]);
    expect(validateRss(xml, parseXml).errors).toEqual([]);
    expect(xml).toContain("<title>R&amp;D &lt;Night&gt; &quot;Live&quot; &apos;n&apos; ]]&gt; more</title>");
    const item = parseXml(xml).getElementsByTagName("item")[0];
    expect([...item.children].find((c) => c.tagName === "title").textContent).toBe(`R&D <Night> "Live" 'n' ]]> more`);
    expect(child(item, EV, "location")).toBe(`Hall "A" & <B>`);
    expect(child(item, DC, "creator")).toBe("Fish & <Chips>");
    const html = [...item.children].find((c) => c.tagName === "description").textContent;
    // The club's text is HTML-escaped inside the summary: no tag of its own survives.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Ends here ]]&gt;");
    expect(cdata("a]]>b")).toBe("<![CDATA[a]]]]><![CDATA[>b]]>");
  });

  it("says an online event is online, and gives an event without a poster its drawn cover", () => {
    const doc = parseXml(feed([{ card: card({ is_online: true, location_name: null, poster: null }), detail: null }]));
    const item = doc.getElementsByTagName("item")[0];
    expect(child(item, EV, "location")).toBe("Online");
    const enclosure = [...item.children].find((c) => c.tagName === "enclosure");
    expect(enclosure.getAttribute("url")).toBe("https://myotherapp.in/media/events/hack-night-04/cover");
    expect(enclosure.getAttribute("type")).toBe("image/png");
  });

  it("puts the newest-published first: by publish time when the API gives it, else the newest id", () => {
    const ids = (list) => newestFirst(list).map((e) => e.id);
    expect(ids([card({ id: 5 }), card({ id: 9 }), card({ id: 7 })])).toEqual([9, 7, 5]);
    expect(ids([card({ id: 5, published_at: "2026-10-10T00:00:00Z" }), card({ id: 9, published_at: "2026-10-01T00:00:00Z" })])).toEqual([5, 9]);
    const xml = feed([{ card: card({ published_at: "2026-10-10T08:00:00Z" }), detail: null }]);
    expect(parseXml(xml).getElementsByTagName("pubDate")[0].textContent).toBe("Sat, 10 Oct 2026 08:00:00 GMT");
  });
});

describe("the feed's filters", () => {
  it("reads a place from lat/lng or near=, and nothing else", () => {
    expect(feedWhere(new URLSearchParams("lat=9.93&lng=76.26"))).toEqual({ lat: 9.93, lng: 76.26 });
    expect(feedWhere(new URLSearchParams("near=9.93,76.26"))).toEqual({ lat: 9.93, lng: 76.26 });
    expect(feedWhere(new URLSearchParams("near=nowhere"))).toBeNull();
    expect(feedWhere(new URLSearchParams("lat=99&lng=0"))).toBeNull();
    expect(feedCity(new URLSearchParams("city=Kochi"))).toBe("Kochi");
    expect(feedCity(new URLSearchParams("city=<script>"))).toBe("");
  });

  it("names the feed by what it follows", () => {
    expect(feedTitle()).toBe("Upcoming events on MyOtherApp");
    expect(feedTitle({ filters: { type: "online", price: "free" } })).toBe("Free online events on MyOtherApp");
    expect(feedTitle({ filters: {}, city: "Kochi", categoryName: "Workshop" })).toBe("Workshop events in Kochi on MyOtherApp");
    expect(feedTitle({ filters: { q: "robots" }, near: true })).toBe("Upcoming events near you matching “robots” on MyOtherApp");
  });

  it("knows a picture's type from its address", () => {
    expect(imageType("https://b/x.medium.png?sig=1")).toBe("image/png");
    expect(imageType("https://b/x.JPEG")).toBe("image/jpeg");
    expect(imageType("https://b/x.webp?a=b")).toBe("image/webp");
    expect(imageType("https://b/x")).toBe("image/jpeg");
  });

  it("writes an item for a card on its own, too", () => {
    expect(eventItem(card())).toContain("<ev:startdate>2026-10-18T18:00:00+05:30</ev:startdate>");
  });
});
