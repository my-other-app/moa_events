// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseClubPage, parseEventPage } from "@/api/parse";
import { fullEvent, sparseEvent } from "@/test/eventFixture";
import { availability, siteJsonLd } from "./jsonld";
import { clubStructuredData, eventStructuredData } from "./structured";
import { validateBreadcrumbs, validateEvent, validateOrganization } from "./validate";

const event = (over = {}, page = {}) => parseEventPage(fullEvent({ ...page, event: { ...fullEvent().event, ...over } }));

describe("an event's structured data", () => {
  it("is a complete schema.org Event: Google's required fields, its recommended ones, nothing empty", () => {
    const [ld, crumbs] = eventStructuredData(event());
    const check = validateEvent(ld);
    expect(check.errors).toEqual([]);
    // Every recommended field is there too, but the venue's postal parts the API doesn't have.
    expect(check.warnings.filter((w) => !/address\.(addressLocality|addressRegion|postalCode)/.test(w))).toEqual([]);
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Hack Night 04",
      description: expect.stringMatching(/^Twenty-four hours of building\./),
      startDate: "2026-10-18T18:00:00+05:30",
      endDate: "2026-10-18T21:00:00+05:30",
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: {
        "@type": "Place",
        name: "Lab 3B, COEP",
        address: { "@type": "PostalAddress", streetAddress: "Lab 3B, COEP", addressCountry: "IN" },
        geo: { "@type": "GeoCoordinates", latitude: 18.5293, longitude: 73.8565 },
        hasMap: "https://maps.app.goo.gl/abc",
      },
      url: "https://myotherapp.in/events/hack-night-04",
      organizer: { "@type": "Organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" },
      offers: {
        "@type": "Offer",
        price: 250,
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        validFrom: "2026-09-20T10:00:00+05:30",
        url: "https://myotherapp.in/events/hack-night-04",
      },
      maximumAttendeeCapacity: 120,
      remainingAttendeeCapacity: 18,
      keywords: "Hardware, IoT",
    });
    // Speakers as people, with what the page says of them.
    expect(ld.performer).toEqual([
      { "@type": "Person", name: "Ananya Iyer", jobTitle: "Firmware lead", description: "Ships scooter firmware.", sameAs: ["https://www.linkedin.com/in/ananya"] },
      { "@type": "Person", name: "Rahul Menon" },
    ]);
    // Pictures on the site's stable addresses: the poster, then the share picture. Never a presigned link.
    expect(ld.image).toEqual(["https://myotherapp.in/media/events/hack-night-04/poster", expect.stringMatching(/^https:\/\/myotherapp\.in\/og\/events\/hack-night-04\?v=/)]);
    expect(JSON.stringify(ld)).not.toContain("cdn.example");

    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(crumbs.itemListElement.map((i) => [i.position, i.name, i.item])).toEqual([
      [1, "Home", "https://myotherapp.in/"],
      [2, "Events", "https://myotherapp.in/events"],
      [3, "Hack Night 04", "https://myotherapp.in/events/hack-night-04"],
    ]);
  });

  it("says online events are online, at the event's own page, and mixed ones both", () => {
    const [online] = eventStructuredData(event({ is_online: true, location_name: "Online", lat: null, lng: null }));
    expect(validateEvent(online).errors).toEqual([]);
    expect(online.eventAttendanceMode).toBe("https://schema.org/OnlineEventAttendanceMode");
    expect(online.location).toEqual({ "@type": "VirtualLocation", url: "https://myotherapp.in/events/hack-night-04" });

    const [mixed] = eventStructuredData(event({ is_online: true }));
    expect(validateEvent(mixed).errors).toEqual([]);
    expect(mixed.eventAttendanceMode).toBe("https://schema.org/MixedEventAttendanceMode");
    expect(mixed.location.map((l) => l["@type"])).toEqual(["Place", "VirtualLocation"]);
  });

  it("keeps a sparse event valid: the drawn cover as its picture, free, an end from its length or none", () => {
    const [ld] = eventStructuredData(parseEventPage(sparseEvent()));
    expect(validateEvent(ld).errors).toEqual([]);
    expect(ld.image[0]).toBe("https://myotherapp.in/media/events/quiet-evening/cover");
    expect(ld.offers).toMatchObject({ price: 0, priceCurrency: "INR" });
    expect(ld.isAccessibleForFree).toBe(true);
    expect(ld.endDate).toBeUndefined();
    expect(ld.description).toMatch(/Yasya Hall/);
    expect(ld).not.toHaveProperty("performer");
    expect(ld).not.toHaveProperty("maximumAttendeeCapacity");

    const [timed] = eventStructuredData(parseEventPage(sparseEvent({ event: { ...sparseEvent().event, duration_hours: 2 } })));
    expect(timed.endDate).toBe("2026-10-22T21:00:00+05:30");
  });

  it("writes every time in India time, whatever zone the API used", () => {
    const [ld] = eventStructuredData(event({ starts_at: "2026-10-18T12:30:00Z", ends_at: "2026-10-18T15:30:00.000Z", reg_opens_at: "2026-09-20T04:30:00Z" }));
    expect(ld.startDate).toBe("2026-10-18T18:00:00+05:30");
    expect(ld.endDate).toBe("2026-10-18T21:00:00+05:30");
    expect(ld.offers.validFrom).toBe("2026-09-20T10:00:00+05:30");
  });

  it("offers tickets as in stock while open, pre-order before, sold out when full, closed or over", () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    expect(availability({ registration_open: true, status: "upcoming" }, now)).toBe("InStock");
    expect(availability({ registration_open: true, status: "closing_soon" }, now)).toBe("InStock");
    expect(availability({ registration_open: false, status: "upcoming", reg_opens_at: "2026-10-05T00:00:00Z" }, now)).toBe("PreOrder");
    expect(availability({ registration_open: false, status: "upcoming", reg_opens_at: "2026-09-05T00:00:00Z" }, now)).toBe("SoldOut");
    expect(availability({ registration_open: true, status: "full" }, now)).toBe("SoldOut");
    expect(availability({ registration_open: false, status: "ended" }, now)).toBe("SoldOut");
  });

  it("leaves the offer out when a paid event's price isn't known, and stays valid", () => {
    const [ld] = eventStructuredData(event({ has_fee: true, fee: null }));
    expect(ld).not.toHaveProperty("offers");
    expect(validateEvent(ld).errors).toEqual([]);
  });

  it("can't be broken out of its <script> by a club's text", async () => {
    const { jsonForScript } = await import("./jsonld");
    const [ld] = eventStructuredData(event({ name: "</script><script>alert(1)</script>" }));
    const text = jsonForScript(ld);
    expect(text).not.toMatch(/<\/script/i);
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("a club's structured data", () => {
  const data = parseClubPage({
    club: {
      id: 3,
      name: "Circuit Society",
      slug: "circuit-society",
      logo: "https://s3.example/logo.png?Expires=1",
      cover: null,
      tagline: "We build things that blink",
      about: "A student club for hardware people.",
      location_name: "COEP, Pune",
      contact_email: "hello@circuit.club",
      website_url: "https://circuit.myotherapp.in",
      socials: { instagram: "https://instagram.com/circuit", linkedin: null, youtube: "javascript:alert(1)", x: "https://x.com/circuit" },
      interests: ["Robotics"],
      followers: 40,
    },
    upcoming: [
      { id: 68, slug: "hack-night-04", name: "Hack Night 04", starts_at: "2026-10-30T12:30:00Z", ends_at: "2026-10-30T15:30:00Z", location_name: "Lab 3B", status: "upcoming", has_fee: false },
      { id: 69, slug: "ctf-night", name: "CTF Night", starts_at: "2026-11-02T12:30:00Z", is_online: true, status: "full", has_fee: true, fee: 99, poster: "https://s3.example/p.png?Expires=1" },
    ],
  });

  it("is an Organization with its logo, its links elsewhere and its upcoming events", () => {
    const [ld, crumbs] = clubStructuredData(data);
    expect(validateOrganization(ld).errors).toEqual([]);
    expect(ld).toMatchObject({
      "@type": "Organization",
      "@id": "https://myotherapp.in/clubs/circuit-society#organization",
      name: "Circuit Society",
      url: "https://myotherapp.in/clubs/circuit-society",
      logo: "https://myotherapp.in/media/clubs/circuit-society/logo?size=medium",
      description: "A student club for hardware people.",
      slogan: "We build things that blink",
      email: "hello@circuit.club",
      address: { "@type": "PostalAddress", addressLocality: "COEP, Pune", addressCountry: "IN" },
    });
    // Only http(s) links, the website among them.
    expect(ld.sameAs).toEqual(["https://instagram.com/circuit", "https://x.com/circuit", "https://circuit.myotherapp.in"]);
    expect(ld.event).toHaveLength(2);
    expect(ld.event[0]).toMatchObject({
      "@type": "Event",
      name: "Hack Night 04",
      url: "https://myotherapp.in/events/hack-night-04",
      startDate: "2026-10-30T18:00:00+05:30",
      endDate: "2026-10-30T21:00:00+05:30",
      image: ["https://myotherapp.in/media/events/hack-night-04/cover"],
      organizer: { "@type": "Organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" },
      offers: { price: 0, priceCurrency: "INR", availability: "https://schema.org/InStock" },
    });
    expect(ld.event[1]).toMatchObject({
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      image: ["https://myotherapp.in/media/events/ctf-night/poster?size=medium"],
      offers: { price: 99, availability: "https://schema.org/SoldOut" },
    });
    expect(JSON.stringify(ld)).not.toContain("s3.example");
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Home", "Clubs", "Circuit Society"]);
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
  });
});

describe("the site's own structured data", () => {
  it("names the organisation and offers a search box that lands on /events?q=", () => {
    const [org, site] = siteJsonLd();
    expect(validateOrganization(org).errors).toEqual([]);
    expect(org).toMatchObject({ "@type": "Organization", name: "MyOtherApp", url: "https://myotherapp.in", logo: { url: "https://myotherapp.in/brand/logo-icon.png" } });
    expect(site).toMatchObject({
      "@type": "WebSite",
      url: "https://myotherapp.in",
      publisher: { "@id": "https://myotherapp.in/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: "https://myotherapp.in/events?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    });
  });
});
