// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseClubPage, parseComment, parseEventPage, parseThread } from "@/api/parse";
import { fullEvent, sparseEvent } from "@/test/eventFixture";
import { plansResponse } from "@/test/plansFixture";
import { parsePlans, plansJsonLd } from "@/utils/pricing";
import { availability, siteJsonLd } from "./jsonld";
import { clubStructuredData, clubsListStructuredData, eventStructuredData, eventsListStructuredData, threadStructuredData } from "./structured";
import { validateBreadcrumbs, validateDiscussionPosting, validateEvent, validateItemList, validateOrganization, validateSoftwareApplication } from "./validate";

const event = (over = {}, page = {}) => parseEventPage(fullEvent({ ...page, event: { ...fullEvent().event, ...over } }));

describe("an event's structured data", () => {
  it("is a complete schema.org Event: Google's required fields, its recommended ones, nothing empty", () => {
    const [ld, crumbs] = eventStructuredData(event());
    const check = validateEvent(ld);
    expect(check.errors).toEqual([]);
    // Every recommended field is there too, but the PIN code its words don't have.
    expect(check.warnings).toEqual(["location.address.postalCode is recommended"]);
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
        // The city and state from its point (it is in Pune), in India.
        address: { "@type": "PostalAddress", streetAddress: "Lab 3B, COEP", addressLocality: "Pune", addressRegion: "Maharashtra", addressCountry: "IN" },
        geo: { "@type": "GeoCoordinates", latitude: 18.5293, longitude: 73.8565 },
        hasMap: "https://maps.app.goo.gl/abc",
      },
      url: "https://myotherapp.in/events/hack-night-04",
      organizer: { "@type": "Organization", "@id": "https://myotherapp.in/clubs/circuit-society#organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" },
      inLanguage: "en-IN",
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
    // Pictures on the site's stable addresses: the poster, then the same at 16:9, 4:3 and 1:1. Never a presigned link.
    expect(ld.image).toEqual([
      "https://myotherapp.in/media/events/hack-night-04/poster",
      expect.stringMatching(/^https:\/\/myotherapp\.in\/og\/events\/hack-night-04\?v=\w+&ratio=16x9$/),
      expect.stringMatching(/^https:\/\/myotherapp\.in\/og\/events\/hack-night-04\?v=\w+&ratio=4x3$/),
      expect.stringMatching(/^https:\/\/myotherapp\.in\/og\/events\/hack-night-04\?v=\w+&ratio=1x1$/),
    ]);
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
      // Its city, from its words ("COEP, Pune"), and the state it is in.
      address: { "@type": "PostalAddress", addressLocality: "Pune", addressRegion: "Maharashtra", addressCountry: "IN" },
      areaServed: { "@type": "City", name: "Pune", containedInPlace: { "@type": "State", name: "Maharashtra" } },
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
    // India, Kerala first.
    expect(org.areaServed).toEqual([
      { "@type": "Country", name: "India" },
      { "@type": "State", name: "Kerala" },
    ]);
    expect(site.inLanguage).toBe("en-IN");
  });
});

describe("what the API may say outright (newer APIs), in the structured data", () => {
  it("says a called-off, postponed or moved event is, and when a moved one was to start", () => {
    const status = (over) => eventStructuredData(event(over))[0];
    expect(status({ event_status: "cancelled" }).eventStatus).toBe("https://schema.org/EventCancelled");
    expect(status({ event_status: "postponed" }).eventStatus).toBe("https://schema.org/EventPostponed");
    expect(status({ event_status: "moved_online" }).eventStatus).toBe("https://schema.org/EventMovedOnline");
    const moved = status({ event_status: "rescheduled", previous_starts_at: "2026-10-11T12:30:00Z" });
    expect(moved).toMatchObject({ eventStatus: "https://schema.org/EventRescheduled", previousStartDate: "2026-10-11T18:00:00+05:30" });
    expect(validateEvent(moved).errors).toEqual([]);
    // Anything else, or nothing (today's API), is as planned; a past event too.
    expect(status({ event_status: "who-knows" }).eventStatus).toBe("https://schema.org/EventScheduled");
    const past = status({ status: "ended", starts_at: "2025-01-10T18:00:00+05:30", ends_at: "2025-01-10T21:00:00+05:30" });
    expect(past).toMatchObject({ eventStatus: "https://schema.org/EventScheduled", startDate: "2025-01-10T18:00:00+05:30", endDate: "2025-01-10T21:00:00+05:30" });
    expect(past.offers.availability).toBe("https://schema.org/SoldOut");
    expect(past).not.toHaveProperty("previousStartDate");
  });

  it("takes the attendance mode and the venue's address parts as the API says them", () => {
    const [hybrid] = eventStructuredData(event({ attendance_mode: "hybrid", is_online: false }));
    expect(hybrid.eventAttendanceMode).toBe("https://schema.org/MixedEventAttendanceMode");
    expect(hybrid.location.map((l) => l["@type"])).toEqual(["Place", "VirtualLocation"]);
    const [addressed] = eventStructuredData(event({ locality: "Shivajinagar", region: "MH", postal_code: "411005" }));
    expect(addressed.location.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Lab 3B, COEP",
      addressLocality: "Shivajinagar",
      addressRegion: "MH",
      postalCode: "411005",
      addressCountry: "IN",
    });
    expect(validateEvent(addressed)).toEqual({ errors: [], warnings: [] });
  });

  it("reads none of it from an answer that doesn't have it: today's pages parse as before", () => {
    const page = event();
    for (const k of ["event_status", "attendance_mode", "previous_starts_at", "locality", "region", "postal_code", "is_demo"]) expect(page.event).not.toHaveProperty(k);
    expect(page.club).not.toHaveProperty("is_demo");
  });
});

describe("a find page's structured data", () => {
  it("is an ItemList of the events shown, in order, each at its canonical address", () => {
    const items = [
      { id: 68, slug: "hack-night-04", name: "Hack Night 04" },
      { id: 70, slug: null, name: "No slug yet" },
    ];
    const ld = eventsListStructuredData(items, { name: "Online events", path: "/events?type=online" });
    expect(validateItemList(ld)).toEqual({ errors: [], warnings: [] });
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Online events",
      url: "https://myotherapp.in/events?type=online",
      numberOfItems: 2,
      itemListElement: [
        { "@type": "ListItem", position: 1, url: "https://myotherapp.in/events/hack-night-04", name: "Hack Night 04" },
        { "@type": "ListItem", position: 2, url: "https://myotherapp.in/events/70", name: "No slug yet" },
      ],
    });
  });

  it("lists clubs by their pages, leaving out one without an address", () => {
    const ld = clubsListStructuredData(
      [
        { id: 1, slug: "circuit-society", name: "Circuit Society" },
        { id: 2, slug: null, name: "Nameless" },
      ],
      { name: "Clubs on MyOtherApp", path: "/clubs" }
    );
    expect(validateItemList(ld).errors).toEqual([]);
    expect(ld.itemListElement.map((i) => i.url)).toEqual(["https://myotherapp.in/clubs/circuit-society"]);
    expect(ld.numberOfItems).toBe(1);
  });

  it("is checked: positions in order, absolute addresses, none twice", () => {
    const bad = { "@context": "https://schema.org", "@type": "ItemList", numberOfItems: 3, itemListElement: [{ "@type": "ListItem", position: 2, url: "/x" }, { "@type": "ListItem", position: 2, url: "/x" }] };
    const { errors } = validateItemList(bad);
    expect(errors).toEqual(expect.arrayContaining(["item 1 has position 2", "item 1 needs an absolute url", "item 2: /x is listed twice", "numberOfItems is 3 for 2 items"]));
  });
});

describe("a post's structured data", () => {
  const thread = (over = {}) =>
    parseThread({
      id: "t1",
      club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: "https://b.s3.amazonaws.com/l.png?Signature=x" },
      body: "Kits are in!\nPick yours up at Lab 3B before Friday.",
      image: { medium: "https://b.s3.amazonaws.com/k.jpg?Signature=x&Expires=1" },
      likes: 12,
      comments: 2,
      created_at: "2026-10-15T10:00:00Z",
      ...over,
    });
  const comments = [
    parseComment({ id: "c1", body: "On my way", author: { name: "Rohan P.", is_club: false }, created_at: "2026-10-15T11:00:00Z" }),
    parseComment({ id: "c2", body: "See you!", author: { name: "Circuit Society", is_club: true }, created_at: "2026-10-15T11:30:00Z" }),
  ];

  it("is a DiscussionForumPosting Google reads: the club as author, when, the words, the picture, likes and comments", () => {
    const [ld, crumbs] = threadStructuredData(thread(), comments);
    expect(validateDiscussionPosting(ld)).toEqual({ errors: [], warnings: [] });
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(ld).toMatchObject({
      "@type": "DiscussionForumPosting",
      url: "https://myotherapp.in/threads/t1",
      headline: "Kits are in!",
      text: "Kits are in!\nPick yours up at Lab 3B before Friday.",
      image: "https://myotherapp.in/media/threads/t1/image",
      author: { "@type": "Organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" },
      datePublished: "2026-10-15T15:30:00+05:30",
      interactionStatistic: [
        { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: 12 },
        { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: 2 },
      ],
      commentCount: 2,
      comment: [
        { "@type": "Comment", text: "On my way", author: { "@type": "Person", name: "Rohan P." }, datePublished: "2026-10-15T16:30:00+05:30" },
        { "@type": "Comment", text: "See you!", author: { "@type": "Organization", name: "Circuit Society" } },
      ],
    });
    expect(JSON.stringify(ld)).not.toMatch(/Signature=|Expires=/);
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Home", "Threads", "Kits are in!"]);
  });

  it("says what a poll asks when the post has no words, and leaves out what it hasn't got", () => {
    const poll = thread({ body: "", image: null, comments: 0, poll: { options: [{ id: "a", label: "Friday", share: 60 }, { id: "b", label: "Saturday", share: 40 }], votes: 5 }, kind: "poll" });
    const [ld] = threadStructuredData(poll, []);
    expect(validateDiscussionPosting(ld).errors).toEqual([]);
    expect(ld.headline).toBe("Poll from Circuit Society");
    expect(ld.text).toBe("Poll: Friday / Saturday");
    expect(ld.image).toBeUndefined();
    expect(ld.comment).toBeUndefined();
    expect(ld.commentCount).toBe(0);
  });

  it("is checked: an author with a name, a zoned date, words or a picture, counts that are whole numbers", () => {
    const { errors } = validateDiscussionPosting({
      "@context": "https://schema.org",
      "@type": "DiscussionForumPosting",
      author: { "@type": "Thing" },
      datePublished: "2026-10-15T10:00:00",
      interactionStatistic: [{ "@type": "InteractionCounter", interactionType: "https://schema.org/Like", userInteractionCount: 1.5 }],
      comment: [{ "@type": "Comment", author: { "@type": "Person", name: "R" } }],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        "author must be a Person or an Organization",
        "author.name is required",
        "datePublished must be ISO 8601 with a time zone",
        "text, image or video is required",
        'interactionStatistic[0].interactionType "https://schema.org/Like" isn\'t one schema.org knows',
        "interactionStatistic[0].userInteractionCount must be a whole number",
        "comment[0].datePublished is required",
        "comment[0].text, image or video is required",
      ])
    );
  });
});

describe("the plans' structured data", () => {
  it("is a SoftwareApplication with a priced Offer per plan and cycle", () => {
    const ld = plansJsonLd(parsePlans(plansResponse()), { url: "https://myotherapp.in/pricing", siteUrl: "https://myotherapp.in", description: "Plans." });
    expect(validateSoftwareApplication(ld)).toEqual({ errors: [], warnings: [] });
    expect(ld.offers.length).toBeGreaterThan(3);
    expect(validateSoftwareApplication({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "x", offers: [{ "@type": "Offer", price: "9" }] }).errors).toEqual(
      expect.arrayContaining(["offers[0].price must be a number", "offers[0].priceCurrency must be a 3-letter code"])
    );
  });
});
