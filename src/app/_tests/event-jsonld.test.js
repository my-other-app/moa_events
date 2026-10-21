// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { fullEvent, sparseEvent } from "@/test/eventFixture";
import { validateBreadcrumbs, validateEvent } from "@/seo/validate";

/*
 * An event page's JSON-LD as a crawler reads it: the route rendered to
 * HTML, every <script type="application/ld+json"> parsed, and the Event
 * checked field by field against Google's event rich result
 * (https://developers.google.com/search/docs/appearance/structured-data/event):
 * required name, startDate, location; recommended description, endDate,
 * eventStatus, eventAttendanceMode, image (16:9, 4:3, 1:1), offers,
 * organizer, performer. Times in India time, prices in rupees.
 */
const SCHEMA = "https://schema.org/";
const IST = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/;
const KOCHI = { location_name: "Thuruthu Coworks, 2nd floor, Panampilly Nagar, Kochi 682036", lat: 9.9627, lng: 76.2955, location_link: "https://maps.app.goo.gl/x" };

const pages = {
  "kochi-meetup": fullEvent({ event: { ...fullEvent().event, slug: "kochi-meetup", ...KOCHI } }),
  "online-talk": fullEvent({ event: { ...fullEvent().event, id: 124, slug: "online-talk", is_online: true, location_name: "Online", lat: null, lng: null, has_fee: false, fee: null } }),
  "last-year": fullEvent({
    event: { ...fullEvent().event, id: 125, slug: "last-year", ...KOCHI, status: "ended", registration_open: false, starts_at: "2025-11-01T18:30:00+05:30", ends_at: "2025-11-01T21:30:00+05:30" },
  }),
  "quiet-evening": sparseEvent(),
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    fakeFetch((url) => {
      const slug = url.pathname.replace("/api/v1/discover/events/", "");
      return pages[slug] ? { body: pages[slug] } : { status: 404, body: {} };
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

async function ldOf(slug) {
  const route = await import("../events/[slug]/page.jsx");
  const out = html(await route.default({ params: Promise.resolve({ slug }) }), `/events/${slug}`);
  // Every block parses as JSON on its own.
  const blocks = [...out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const b of blocks) expect(() => JSON.parse(b)).not.toThrow();
  const all = jsonLdOf(out);
  return { event: all.find((l) => l["@type"] === "Event"), crumbs: all.find((l) => l["@type"] === "BreadcrumbList") };
}

describe("an event page's Event JSON-LD", () => {
  it("has every field Google requires and recommends, in India time and rupees", async () => {
    const { event, crumbs } = await ldOf("kochi-meetup");
    expect(validateEvent(event)).toEqual({ errors: [], warnings: [] });
    expect(event["@context"]).toBe("https://schema.org");
    expect(event.name).toBe("Hack Night 04");
    expect(event.startDate).toMatch(IST);
    expect(event.endDate).toMatch(IST);
    expect(Date.parse(event.endDate)).toBeGreaterThan(Date.parse(event.startDate));
    expect(event.eventStatus).toBe(`${SCHEMA}EventScheduled`);
    expect(event.eventAttendanceMode).toBe(`${SCHEMA}OfflineEventAttendanceMode`);
    expect(event.description.length).toBeGreaterThan(10);
    // The venue: its words, its city, state and PIN code, in India, and its point.
    expect(event.location).toMatchObject({
      "@type": "Place",
      name: KOCHI.location_name,
      address: { "@type": "PostalAddress", streetAddress: KOCHI.location_name, addressLocality: "Kochi", addressRegion: "Kerala", postalCode: "682036", addressCountry: "IN" },
      geo: { "@type": "GeoCoordinates", latitude: 9.9627, longitude: 76.2955 },
    });
    // Pictures: the poster and the same at 16:9, 4:3 and 1:1, all absolute.
    expect(event.image).toHaveLength(4);
    expect(event.image.slice(1).map((u) => new URL(u).searchParams.get("ratio"))).toEqual(["16x9", "4x3", "1x1"]);
    for (const u of event.image) expect(u).toMatch(/^https:\/\/myotherapp\.in\//);
    // The ticket: price, rupees, availability, its page, from when.
    expect(event.offers).toEqual({
      "@type": "Offer",
      price: 250,
      priceCurrency: "INR",
      availability: `${SCHEMA}InStock`,
      validFrom: "2026-09-20T10:00:00+05:30",
      url: "https://myotherapp.in/events/kochi-meetup",
    });
    expect(event.organizer).toMatchObject({ "@type": "Organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" });
    expect(event.performer.map((p) => [p["@type"], p.name])).toEqual([
      ["Person", "Ananya Iyer"],
      ["Person", "Rahul Menon"],
    ]);
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
  });

  it("puts an online event at a VirtualLocation (its own page), free", async () => {
    const { event } = await ldOf("online-talk");
    expect(validateEvent(event).errors).toEqual([]);
    expect(event.eventAttendanceMode).toBe(`${SCHEMA}OnlineEventAttendanceMode`);
    expect(event.location).toEqual({ "@type": "VirtualLocation", url: "https://myotherapp.in/events/online-talk" });
    expect(event.offers).toMatchObject({ price: 0, priceCurrency: "INR" });
    expect(event.isAccessibleForFree).toBe(true);
  });

  it("keeps a past event, as it happened: scheduled, its own dates, no longer on sale", async () => {
    const { event } = await ldOf("last-year");
    expect(validateEvent(event).errors).toEqual([]);
    expect(event.eventStatus).toBe(`${SCHEMA}EventScheduled`);
    expect(event.startDate).toBe("2025-11-01T18:30:00+05:30");
    expect(event.endDate).toBe("2025-11-01T21:30:00+05:30");
    expect(event.offers.availability).toBe(`${SCHEMA}SoldOut`);
  });

  it("stays valid for an event with almost nothing filled in", async () => {
    const { event } = await ldOf("quiet-evening");
    expect(validateEvent(event).errors).toEqual([]);
    expect(event.image[0]).toBe("https://myotherapp.in/media/events/quiet-evening/cover");
  });
});
