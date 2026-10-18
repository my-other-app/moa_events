// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  activeEventFilters,
  clubsHead,
  clubsIndexing,
  clubsPageState,
  eventsFeedQuery,
  eventsHead,
  eventsHeading,
  eventsIndexing,
  eventsPageState,
  paramsOf,
} from "./listings";
import { listingMetadata } from "./metadata";

const events = (qs) => eventsPageState(new URLSearchParams(qs));
const clubs = (qs) => clubsPageState(new URLSearchParams(qs));

describe("the find-events page's address", () => {
  it("is read into filters, a place and the calendar; without a place, no radius and no order by distance", () => {
    expect(events("type=online&near=18.52044,73.85674&radius_km=25&sort=distance")).toMatchObject({
      filters: { type: "online", near: "18.52,73.857", radius_km: 25, sort: "distance" },
      near: { lat: 18.52, lng: 73.857 },
      calendar: false,
      month: "",
    });
    expect(events("radius_km=25&sort=distance").filters).toMatchObject({ radius_km: null, sort: "", near: "" });
    expect(events("near=nowhere").near).toBeNull();
    expect(events("view=calendar&month=2026-11")).toMatchObject({ calendar: true, month: "2026-11" });
    expect(events("month=2026-11").month).toBe("");
  });

  it("is what Next hands a page, first values only", () => {
    expect(paramsOf({ q: "ai", type: ["online", "in_person"], x: undefined }).toString()).toBe("q=ai&type=online");
  });

  it("counts the filters for the Filters button (the words, the order and the place aren't filters)", () => {
    expect(activeEventFilters(events("q=ai&sort=popular&near=1,2&type=online&price=free").filters)).toBe(2);
    expect(activeEventFilters(events("when=today&type=online").filters, true)).toBe(1);
  });
});

describe("which find pages search engines keep", () => {
  it("keeps /events itself, whatever order it is in, and drops tracking from its canonical", () => {
    expect(eventsIndexing(events(""))).toEqual({ index: true, path: "/events" });
    expect(eventsIndexing(events("sort=popular&utm_source=x&ref=abc"))).toEqual({ index: true, path: "/events" });
  });

  it("keeps one browsing filter alone, at its own tidy address, when it has events", () => {
    expect(eventsIndexing(events("category=3&sort=popular"), { total: 4, categoryName: "Workshop" })).toEqual({ index: true, path: "/events?category=3" });
    expect(eventsIndexing(events("type=online"), { total: 4 })).toEqual({ index: true, path: "/events?type=online" });
    expect(eventsIndexing(events("price=free"))).toEqual({ index: true, path: "/events?price=free" });
    expect(eventsIndexing(events("when=this_week"))).toEqual({ index: true, path: "/events?when=this_week" });
  });

  it("drops everything else: two filters, words, days, a place, a radius, the calendar, an empty or unknown filter", () => {
    for (const qs of ["type=online&price=free", "q=robots", "from=2026-10-20", "near=18.52,73.86", "near=18.52,73.86&radius_km=25", "view=calendar", "category=3&when=today"]) {
      expect(eventsIndexing(events(qs), { total: 9, categoryName: "Workshop" })).toEqual({ index: false, path: null });
    }
    expect(eventsIndexing(events("type=online"), { total: 0 })).toEqual({ index: false, path: null });
    expect(eventsIndexing(events("category=99"), { total: 2, categoryName: null })).toEqual({ index: false, path: null });
  });

  it("does the same for clubs: the page, or one known interest alone", () => {
    expect(clubsIndexing(clubs("sort=newest"))).toEqual({ index: true, path: "/clubs" });
    expect(clubsIndexing(clubs("interest=4"), { total: 3, interestName: "Robotics" })).toEqual({ index: true, path: "/clubs?interest=4" });
    expect(clubsIndexing(clubs("interest=4"), { total: 3 })).toEqual({ index: false, path: null });
    expect(clubsIndexing(clubs("interest=4&q=drone"), { total: 3, interestName: "Robotics" })).toEqual({ index: false, path: null });
    expect(clubsIndexing(clubs("near=1,2"))).toEqual({ index: false, path: null });
  });

  it("says so in the head: a canonical for a kept page; noindex, follow and no canonical for the rest", () => {
    const kept = listingMetadata({ title: "Online events", description: "x", indexing: { index: true, path: "/events?type=online" } });
    expect(kept.alternates.canonical).toBe("https://myotherapp.in/events?type=online");
    expect(kept.robots).toBeUndefined();
    const dropped = listingMetadata({ title: "Events matching “x”", description: "x", indexing: { index: false, path: null } });
    expect(dropped.alternates.canonical).toBeUndefined();
    expect(dropped.robots).toEqual({ index: false, follow: true });
  });
});

describe("what a find page is called", () => {
  it("is named by the filter that says most", () => {
    expect(eventsHeading(events("q=robots&type=online"))).toBe("Events matching “robots”");
    expect(eventsHeading(events("type=online&near=1,2"))).toBe("Online events");
    expect(eventsHeading(events("near=1,2&category=3"), { city: "Pune", categoryName: "Workshop" })).toBe("Events near Pune");
    expect(eventsHeading(events("near=1,2"))).toBe("Events near you");
    expect(eventsHeading(events("category=3&price=free"), { categoryName: "Workshop" })).toBe("Workshop events");
    expect(eventsHeading(events("category=3"))).toBe("Upcoming events");
    expect(eventsHeading(events("type=in_person"))).toBe("In-person events");
    expect(eventsHeading(events("price=paid"))).toBe("Paid events");
    expect(eventsHeading(events("when=this_weekend"))).toBe("Events this weekend");
    expect(eventsHeading(events("from=2026-10-20"))).toBe("Find events");
    expect(eventsHeading(events("view=calendar"))).toBe("Find events");
    expect(eventsHeading(events(""))).toBe("Upcoming events");
  });

  it("keeps the page's own title for /events and /clubs, and calls a filtered page what its heading says", () => {
    expect(eventsHead(events("sort=popular"))).toEqual({ heading: "Upcoming events", title: "Find events", description: expect.stringMatching(/^Hackathons, workshops/) });
    expect(eventsHead(events("type=online"))).toEqual({ heading: "Online events", title: "Online events", description: expect.stringMatching(/^Online events: find what's on/) });
    // A category the API doesn't name reads as the page itself.
    expect(eventsHead(events("category=99")).title).toBe("Find events");
    expect(clubsHead(clubs(""))).toMatchObject({ heading: "Clubs on MyOtherApp", title: "Clubs" });
    expect(clubsHead(clubs("interest=4"), { interestName: "Robotics" })).toMatchObject({ heading: "Robotics clubs", title: "Robotics clubs" });
    expect(clubsHead(clubs("interest=4"))).toMatchObject({ title: "Clubs" });
    expect(clubsHead(clubs("q=drone&near=1,2"), { city: "Pune" }).heading).toBe("Clubs matching “drone”");
  });

  it("advertises the feed of the same list", () => {
    expect(eventsFeedQuery(events("type=online&sort=popular&view=calendar"))).toBe("type=online");
    expect(eventsFeedQuery(events("near=18.52,73.86&radius_km=25&q=ai"))).toBe("q=ai&near=18.52%2C73.86&radius_km=25");
    expect(eventsFeedQuery(events(""))).toBe("");
  });
});
