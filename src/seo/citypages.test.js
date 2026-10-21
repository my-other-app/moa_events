// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cityByAnySlug, cityBySlug } from "./cities";
import {
  citiesMetadata,
  citiesStructuredData,
  cityClubsMetadata,
  cityClubsStructuredData,
  cityEntries,
  cityEventsHead,
  cityEventsIntro,
  cityEventsMetadata,
  cityEventsStructuredData,
  cityFinderPath,
  cityGroups,
} from "./citypages";
import { demoSettings } from "./demo";
import { validateBreadcrumbs, validateItemList } from "./validate";

const kochi = cityBySlug("kochi");
const kannur = cityBySlug("kannur");
const real = (id, slug) => ({ id, slug, name: `Event ${id}`, club: { slug: "circuit-society" } });
const demo = (id, slug) => ({ id, slug, name: `Demo ${id}`, club: { slug: "borrow-checkers-kochi" } });

describe("a city's events page", () => {
  it("is called what people search for, with words of its own", () => {
    const head = cityEventsHead(kochi);
    expect(head.heading).toBe("Events in Kochi: hackathons, workshops and meetups");
    expect(head.title).toBe(head.heading);
    expect(head.description).toBe("Upcoming hackathons, workshops, meetups and club events in Kochi (Ernakulam, Cochin), Kerala. See what's on and register on MyOtherApp.");
    expect(head.description.length).toBeLessThanOrEqual(160);
    const intro = cityEventsIntro(kochi, { count: 4, clubs: 3 });
    expect(intro).toMatch(/^Kerala's busiest startup and tech city/);
    expect(intro).toMatch(/within 25 km of Kochi\. 4 upcoming in-person events from 3 clubs in and around Kochi, soonest first\.$/);
    expect(cityEventsIntro(kochi, { count: 60, more: true })).toMatch(/60\+ upcoming in-person events/);
    expect(cityEventsIntro(cityBySlug("pune"), { count: 0 })).toMatch(/^Hackathons, .*Nothing is listed in Pune right now/);
    // Every city's own line is different.
    const intros = ["kochi", "thiruvananthapuram", "kozhikode", "thrissur", "kannur", "kottayam"].map((s) => cityEventsIntro(cityBySlug(s), { count: 1 }));
    expect(new Set(intros).size).toBe(6);
  });

  it("is indexed, at its own canonical, only with a real event in it", () => {
    const kept = cityEventsMetadata(kochi, { indexable: true });
    expect(kept.title).toBe("Events in Kochi: hackathons, workshops and meetups");
    expect(kept.alternates.canonical).toBe("https://myotherapp.in/events/in/kochi");
    expect(kept.openGraph.locale).toBe("en_IN");
    expect(kept.robots).toBeUndefined();
    expect(cityEventsMetadata(kochi, { indexable: false }).robots).toEqual({ index: false, follow: true });
  });

  it("is a CollectionPage about the city, an ItemList of its real events, and its trail", () => {
    const [page, list, crumbs] = cityEventsStructuredData(kochi, [real(1, "rust-night"), demo(73, "meetup-29"), real(2, "design-crit")], { settings: demoSettings({}) });
    expect(page).toMatchObject({
      "@type": "CollectionPage",
      "@id": "https://myotherapp.in/events/in/kochi",
      inLanguage: "en-IN",
      mainEntity: { "@id": "https://myotherapp.in/events/in/kochi#events" },
      about: {
        "@type": "City",
        name: "Kochi",
        alternateName: ["Ernakulam", "Cochin", "Kakkanad", "Kalamassery", "Edappally", "Vyttila", "Aluva", "Fort Kochi"],
        address: { addressLocality: "Kochi", addressRegion: "Kerala", addressCountry: "IN" },
        containedInPlace: { "@type": "State", name: "Kerala" },
      },
    });
    expect(validateItemList(list)).toEqual({ errors: [], warnings: [] });
    expect(list.itemListElement.map((i) => i.url)).toEqual(["https://myotherapp.in/events/rust-night", "https://myotherapp.in/events/design-crit"]);
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Home", "Events", "Events in Kochi"]);
  });

  it("has no ItemList when every event is a demo one (and lists them with the switch off)", () => {
    const lds = cityEventsStructuredData(kochi, [demo(73, "meetup-29")], { settings: demoSettings({}) });
    expect(lds.map((l) => l["@type"])).toEqual(["CollectionPage", "BreadcrumbList"]);
    expect(lds[0]).not.toHaveProperty("mainEntity");
    const off = cityEventsStructuredData(kochi, [demo(73, "meetup-29")], { settings: demoSettings({ DEMO_NOINDEX: "off" }) });
    expect(off.map((l) => l["@type"])).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);
  });

  it("points 'See them all' at the find page for the same place, at a radius it offers", () => {
    expect(cityFinderPath(kochi)).toBe("/events?near=9.9816,76.2999&radius_km=25");
    expect(cityFinderPath(kannur)).toBe("/events?near=11.8745,75.3704&radius_km=50");
  });
});

describe("a city's clubs page", () => {
  it("is 'Clubs in Kochi', indexed with a real club, with an ItemList of the real ones", () => {
    const meta = cityClubsMetadata(kochi, { indexable: true });
    expect(meta.title).toBe("Clubs in Kochi: student and community clubs");
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/clubs/in/kochi");
    expect(cityClubsMetadata(kochi, { indexable: false }).robots).toEqual({ index: false, follow: true });
    const [, list] = cityClubsStructuredData(kochi, [{ slug: "circuit-society", name: "Circuit Society" }, { slug: "neural-tide", name: "Neural Tide" }], { settings: demoSettings({}) });
    expect(list.itemListElement.map((i) => i.name)).toEqual(["Circuit Society"]);
  });
});

describe("the cities together", () => {
  const summaries = [
    { city: kochi, events: 4, realEvents: 2, clubs: 3, realClubs: 1 },
    { city: cityBySlug("thiruvananthapuram"), events: 3, realEvents: 0, clubs: 2, realClubs: 0 },
    { city: kannur, events: 0, realEvents: 0, clubs: 0, realClubs: 0 },
    { city: cityBySlug("bengaluru"), events: 1, realEvents: 1, clubs: 0, realClubs: 0 },
  ];

  it("links every city with upcoming events, Kerala's first, and leaves out the empty ones", () => {
    expect(cityGroups(summaries).map(([name, rows]) => [name, rows.map((r) => r.city.slug)])).toEqual([
      ["Kerala", ["kochi", "thiruvananthapuram"]],
      ["Across India", ["bengaluru"]],
    ]);
    expect(cityGroups([{ city: kannur, events: 0, realEvents: 0 }])).toEqual([]);
  });

  it("keeps only the city pages with something real in the sitemap, the hub with them", () => {
    expect(cityEntries(summaries).map((e) => e.loc)).toEqual([
      "https://myotherapp.in/events/in",
      "https://myotherapp.in/events/in/kochi",
      "https://myotherapp.in/clubs/in/kochi",
      "https://myotherapp.in/events/in/bengaluru",
    ]);
    // Only demo content anywhere: nothing.
    expect(cityEntries([{ city: kochi, events: 4, realEvents: 0, clubs: 2, realClubs: 0 }])).toEqual([]);
  });

  it("is a hub indexed while any city is, its ItemList the cities kept", () => {
    expect(citiesMetadata({ indexable: true }).alternates.canonical).toBe("https://myotherapp.in/events/in");
    expect(citiesMetadata({ indexable: false }).robots).toEqual({ index: false, follow: true });
    const [, list] = citiesStructuredData(summaries);
    expect(list.itemListElement.map((i) => [i.name, i.url])).toEqual([
      ["Events in Kochi", "https://myotherapp.in/events/in/kochi"],
      ["Events in Bengaluru", "https://myotherapp.in/events/in/bengaluru"],
    ]);
  });

  it("finds a city by any name people write it by", () => {
    expect(cityByAnySlug("kochi")).toBe(kochi);
    for (const s of ["cochin", "ernakulam", "KOCHI", "fort-kochi"]) expect(cityByAnySlug(s)?.slug).toBe("kochi");
    expect(cityByAnySlug("trivandrum")?.slug).toBe("thiruvananthapuram");
    expect(cityByAnySlug("calicut")?.slug).toBe("kozhikode");
    expect(cityByAnySlug("bangalore")?.slug).toBe("bengaluru");
    expect(cityByAnySlug("navi-mumbai")?.slug).toBe("mumbai");
    expect(cityByAnySlug("atlantis")).toBeNull();
    expect(cityByAnySlug("")).toBeNull();
  });
});
