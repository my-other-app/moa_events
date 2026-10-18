// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ANYWHERE,
  calendarQuery,
  clubsQuery,
  eventsQuery,
  findTopic,
  parseClub,
  parseClubPage,
  parseEvent,
  parseEventPage,
  parseEventsPage,
  parseTopic,
  parseTopics,
  readClubFilters,
  readEventFilters,
  topicColor,
  topicParam,
} from "@/api/parse";
import { fullEvent } from "@/test/eventFixture";
import { parseXml, texts } from "@/test/xml";
import { activeClubFilters, activeEventFilters, clubsHead, clubsIndexing, clubsPageState, eventsFeedQuery, eventsHead, eventsIndexing, eventsPageState, topicChoice } from "./listings";
import { topicMetadata, topicOgVersion, topicsMetadata } from "./metadata";
import { eventItem, feedTitle } from "./rss";
import { indexEntries, parseSitemapName, topicEntries, urlsetXml } from "./sitemap";
import { clubStructuredData, eventStructuredData, topicStructuredData, topicsStructuredData } from "./structured";
import { validateBreadcrumbs, validateEvent, validateItemList, validateOrganization } from "./validate";

/*
 * Topics in the pure parts: reading the API's topics (and refusing what a
 * page shouldn't show), the find pages' filters and what search engines
 * keep, the structured data, the feeds' categories and the sitemap.
 */
const DEV = {
  id: 1,
  slug: "development",
  name: "Development",
  icon: "💻",
  icon_type: "emoji",
  color: "#2563EB",
  description: "Build things.",
  upcoming_events: 12,
  clubs: 30,
  interests: [
    { id: 3, slug: "web-development", name: "Web Development", upcoming_events: 4 },
    { id: 9, name: "Cybersecurity" },
  ],
};
const ARTS = { id: 4, slug: "arts", name: "Arts", color: "#EA580C", interests: [{ id: 20, name: "Music" }] };
const DEV_REF = { id: 1, slug: "development", name: "Development", color: "#2563EB" };

describe("reading topics", () => {
  it("reads a topic with its counts and interests; counts are null when the API didn't count", () => {
    expect(parseTopic(DEV)).toEqual({
      id: 1,
      slug: "development",
      name: "Development",
      icon: "💻",
      color: "#2563EB",
      description: "Build things.",
      upcoming_events: 12,
      clubs: 30,
      interests: [
        { id: 3, slug: "web-development", name: "Web Development", icon: null, upcoming_events: 4 },
        { id: 9, slug: null, name: "Cybersecurity", icon: null, upcoming_events: null },
      ],
    });
    expect(parseTopic(ARTS)).toMatchObject({ upcoming_events: null, clubs: null, icon: null, description: null });
  });

  it("has no topic without a slug (today's single \"arts\" category), and keeps only safe colours and icons", () => {
    expect(parseTopics([{ id: 1, name: "arts", interests: [] }])).toEqual([]);
    expect(parseTopics({ items: [DEV, DEV, ARTS] }).map((t) => t.slug)).toEqual(["development", "arts"]);
    expect(parseTopics(null)).toEqual([]);
    expect(parseTopic({ ...DEV, slug: "bad slug" })).toBeNull();
    for (const bad of ["red", "#12345", "url(x)", "#2563EB;background:url(x)", 5]) expect(topicColor(bad)).toBeNull();
    expect(topicColor(" #abc ")).toBe("#abc");
    expect(parseTopic({ ...DEV, icon: "https://x/y.png", icon_type: "url" }).icon).toBeNull();
    expect(parseTopic({ ...DEV, icon: "<b>", icon_type: "emoji" }).icon).toBeNull();
    // Today's rows were saved with Swagger's placeholder.
    expect(parseTopic({ ...DEV, icon: "string", icon_type: "emoji" }).icon).toBeNull();
    expect(parseTopic({ ...DEV, icon: "👩‍💻" }).icon).toBe("👩‍💻");
  });

  it("finds a topic by slug or id", () => {
    const topics = parseTopics([DEV, ARTS]);
    expect(findTopic(topics, "Development").slug).toBe("development");
    expect(findTopic(topics, "4").slug).toBe("arts");
    expect(findTopic(topics, "knitting")).toBeNull();
    expect(findTopic(null, "arts")).toBeNull();
  });

  it("reads the topics on cards, pages and the events list's facets ([] from an older API)", () => {
    expect(parseEvent({ id: 9, topics: [DEV_REF, { name: "No slug" }] }).topics).toEqual([DEV_REF]);
    expect(parseEvent({ id: 9 }).topics).toEqual([]);
    expect(parseClub({ id: 2, slug: "c", topics: [DEV_REF] }).topics).toEqual([DEV_REF]);
    expect(parseEventPage({ event: { id: 1, name: "x", topics: [DEV_REF] } }).event.topics).toEqual([DEV_REF]);
    expect(parseEventsPage({ items: [], topics: [{ ...DEV_REF, upcoming: "12" }] }).topics).toEqual([{ ...DEV_REF, upcoming: 12 }]);
    expect(parseEventsPage({ items: [] }).topics).toEqual([]);
  });
});

describe("the topic filter in the address and the API's query", () => {
  it("reads ?topic= (a slug or an id, tidied) and ?interest=, and sends both", () => {
    expect(topicParam(" Deep-Tech ")).toBe("deep-tech");
    expect(topicParam("x y")).toBe("");
    const f = readEventFilters(new URLSearchParams("topic=Development&interest=3"));
    expect(f).toMatchObject({ topic: "development", interest: "3" });
    expect(eventsQuery(f, ANYWHERE)).toEqual({ topic: "development", interest: "3", radius_km: 0, offset: 0, limit: 12 });
    expect(calendarQuery(f, ANYWHERE, "2026-11")).toEqual({ month: "2026-11", topic: "development", interest: "3", radius_km: 0 });
    const c = readClubFilters(new URLSearchParams("topic=arts&interest=bad!"));
    expect(c).toMatchObject({ topic: "arts", interest: "" });
    expect(clubsQuery(c, ANYWHERE)).toEqual({ topic: "arts", radius_km: 0, offset: 0, limit: 12 });
  });

  it("counts them as filters", () => {
    expect(activeEventFilters({ topic: "arts", interest: "3" })).toBe(2);
    expect(activeEventFilters({ topic: "arts" }, true)).toBe(1);
    expect(activeClubFilters({ topic: "arts" })).toBe(1);
  });

  it("puts them in the list's feed", () => {
    expect(eventsFeedQuery(eventsPageState(new URLSearchParams("topic=arts&interest=20&sort=popular")))).toBe("topic=arts&interest=20");
  });
});

describe("topicChoice: what the find pages know about topics", () => {
  const tree = { topics: parseTopics([DEV, ARTS]) };

  it("offers nothing while there are no topics", () => {
    expect(topicChoice({ topic: "arts" }, {})).toMatchObject({ options: [], current: null, topicName: null, topicSlug: null });
  });

  it("offers the list's facet (with counts), else the topics", () => {
    const facet = parseEventsPage({ topics: [{ ...DEV_REF, upcoming: 12 }] }).topics;
    expect(topicChoice({}, { facet }).options).toEqual([{ slug: "development", name: "Development", count: 12 }]);
    expect(topicChoice({}, { tree, count: "clubs" }).options).toEqual([
      { slug: "development", name: "Development", count: 30 },
      { slug: "arts", name: "Arts", count: null },
    ]);
  });

  it("knows the picked topic by slug or id, and an interest's topic (the interest wins)", () => {
    expect(topicChoice({ topic: "1" }, { tree })).toMatchObject({ current: { slug: "development" }, topicName: "Development", topicSlug: "development", interest: null });
    expect(topicChoice({ topic: "arts", interest: "3" }, { tree })).toMatchObject({ current: { slug: "development" }, interestName: "Web Development" });
    // Named from the facet when the topics weren't read; a picked topic is always among the options.
    const facet = [{ ...DEV_REF, upcoming: 0 }];
    expect(topicChoice({ topic: "development" }, { facet })).toMatchObject({ current: null, topicName: "Development", topicSlug: "development" });
    expect(topicChoice({ topic: "arts" }, { facet: [], tree }).options.map((o) => o.slug)).toEqual(["development", "arts"]);
  });
});

describe("what search engines keep, by topic", () => {
  const ev = (qs) => eventsPageState(new URLSearchParams(qs));
  const cl = (qs) => clubsPageState(new URLSearchParams(qs));

  it("keeps a known topic alone on /events at the topic's page, and nothing else with a topic", () => {
    expect(eventsIndexing(ev("topic=1"), { total: 3, topicSlug: "development" })).toEqual({ index: true, path: "/topics/development" });
    expect(eventsIndexing(ev("topic=development"), { total: 0, topicSlug: "development" }).index).toBe(false);
    expect(eventsIndexing(ev("topic=development"), { total: 3 }).index).toBe(false);
    expect(eventsIndexing(ev("topic=development&type=online"), { total: 3, topicSlug: "development" }).index).toBe(false);
    expect(eventsIndexing(ev("interest=3"), { total: 3 }).index).toBe(false);
  });

  it("keeps /clubs?topic= alone at its own address", () => {
    expect(clubsIndexing(cl("topic=Development"), { total: 2, topicSlug: "development" })).toEqual({ index: true, path: "/clubs?topic=development" });
    expect(clubsIndexing(cl("topic=development&q=x"), { total: 2, topicSlug: "development" }).index).toBe(false);
  });

  it("names the page by the interest, else the topic", () => {
    expect(eventsHead(ev("topic=development"), { topicName: "Development" })).toMatchObject({ heading: "Development events", title: "Development events" });
    expect(eventsHead(ev("topic=development&interest=3"), { topicName: "Development", interestName: "Web Development" }).heading).toBe("Web Development events");
    expect(eventsHead(ev("topic=development")).title).toBe("Find events");
    expect(clubsHead(cl("topic=development"), { topicName: "Development" }).heading).toBe("Development clubs");
  });
});

describe("structured data with topics", () => {
  const withTopics = parseEventPage(fullEvent({ event: { ...fullEvent().event, topics: [DEV_REF, { id: 2, slug: "deep-tech", name: "Deep Tech", color: "#7C3AED" }] } }));

  it("says what an event is about (its topics' pages), and goes Home › Topic › Event", () => {
    const [ld, crumbs] = eventStructuredData(withTopics);
    expect(validateEvent(ld).errors).toEqual([]);
    expect(ld.about).toEqual([
      { "@type": "Thing", name: "Development", url: "https://myotherapp.in/topics/development" },
      { "@type": "Thing", name: "Deep Tech", url: "https://myotherapp.in/topics/deep-tech" },
    ]);
    expect(ld.keywords).toBe("Development, Deep Tech, Hardware, IoT");
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(crumbs.itemListElement.map((i) => [i.name, i.item])).toEqual([
      ["Home", "https://myotherapp.in/"],
      ["Development", "https://myotherapp.in/topics/development"],
      ["Hack Night 04", "https://myotherapp.in/events/hack-night-04"],
    ]);
  });

  it("is what it was without topics", () => {
    const [ld, crumbs] = eventStructuredData(parseEventPage(fullEvent()));
    expect(ld).not.toHaveProperty("about");
    expect(ld.keywords).toBe("Hardware, IoT");
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Home", "Events", "Hack Night 04"]);
  });

  it("lists a club's topics first in what it knows about, only when it has them", () => {
    const page = (topics) => parseClubPage({ club: { id: 3, slug: "circuit-society", name: "Circuit Society", interests: ["Robotics"], topics }, upcoming: [] });
    const [org] = clubStructuredData(page([DEV_REF]));
    expect(validateOrganization(org).errors).toEqual([]);
    expect(org.knowsAbout).toEqual(["Development", "Robotics"]);
    expect(clubStructuredData(page(undefined))[0].knowsAbout).toEqual(["Robotics"]);
  });

  it("is a CollectionPage and an ItemList for /topics, and adds a BreadcrumbList for a topic's page", () => {
    const topics = parseTopics([DEV, ARTS]);
    const [page, list] = topicsStructuredData(topics);
    expect(page).toMatchObject({ "@context": "https://schema.org", "@type": "CollectionPage", isPartOf: { "@id": "https://myotherapp.in/#website" } });
    expect(validateItemList(list)).toEqual({ errors: [], warnings: [] });
    const cards = [parseEvent({ id: 1, slug: "a", name: "A" }), parseEvent({ id: 2, slug: "b", name: "B" })];
    const one = topicStructuredData(topics[0], cards, { interest: topics[0].interests[0] });
    expect(one.map((x) => x["@type"])).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);
    expect(one[1].name).toBe("Web Development events");
    expect(validateBreadcrumbs(one[2]).errors).toEqual([]);
    // No events: no list, and the page doesn't point at one.
    const empty = topicStructuredData(topics[1], []);
    expect(empty.map((x) => x["@type"])).toEqual(["CollectionPage", "BreadcrumbList"]);
    expect(empty[0]).not.toHaveProperty("mainEntity");
  });
});

describe("a topic's head", () => {
  const [dev, arts] = parseTopics([DEV, ARTS]);

  it("words a topic without a description from its interests, and /topics from the topics' names", () => {
    expect(topicMetadata(arts).description).toBe("Upcoming Arts events (Music and more), and the clubs that run them, on MyOtherApp.");
    expect(topicsMetadata([dev, arts]).alternates.canonical).toBe("https://myotherapp.in/topics");
  });

  it("changes its picture's ?v= when what the picture shows does", () => {
    expect(topicOgVersion(dev)).toBe(topicOgVersion({ ...dev }));
    expect(topicOgVersion(dev)).not.toBe(topicOgVersion({ ...dev, upcoming_events: 13 }));
    expect(topicOgVersion(dev)).not.toBe(topicOgVersion({ ...dev, color: "#000000" }));
  });
});

describe("topics in the feeds and the sitemap", () => {
  it("adds an event's topics to its <category> list, each once", () => {
    const card = parseEvent({ id: 1, slug: "a", name: "A", starts_at: "2026-10-30T12:30:00Z", category: { id: 7, name: "Workshop" }, topics: [DEV_REF] });
    const xml = `<rss xmlns:dc="d" xmlns:ev="e"><channel>${eventItem(card, { detail: { interests: ["Development", "Web Development"] } })}</channel></rss>`;
    expect(texts(parseXml(xml), "category")).toEqual(["Workshop", "Development", "Web Development"]);
  });

  it("names a feed by its topic", () => {
    expect(feedTitle({ filters: { price: "free" }, topicName: "Design" })).toBe("Free Design events on MyOtherApp");
  });

  it("lists /topics and every topic in topics.xml, listed in the index only when there are topics", () => {
    expect(parseSitemapName("topics.xml")).toEqual({ kind: "topics", page: 1 });
    const rows = topicEntries([{ slug: "development" }, { slug: "development" }, { slug: "bad slug" }, { slug: "arts" }]);
    expect(rows.map((r) => r.loc)).toEqual(["https://myotherapp.in/topics", "https://myotherapp.in/topics/development", "https://myotherapp.in/topics/arts"]);
    expect(topicEntries([])).toEqual([]);
    parseXml(urlsetXml(rows));
    expect(indexEntries(null, { topics: true }).map((e) => e.loc)).toEqual(["https://myotherapp.in/sitemaps/pages.xml", "https://myotherapp.in/sitemaps/topics.xml"]);
    expect(indexEntries(null).map((e) => e.loc)).toEqual(["https://myotherapp.in/sitemaps/pages.xml"]);
  });
});
