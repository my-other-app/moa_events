import { describe, expect, it } from "vitest";
import { parseClubPage, parseEvent, parseEventPage } from "@/api/parse";
import { fullEvent, sparseEvent } from "@/test/eventFixture";
import { eventFactsLine, eventMetadata } from "./metadata";
import { eventItem } from "./rss";
import { clubStructuredData, eventStructuredData } from "./structured";
import { validateEvent, validateOrganization } from "./validate";

/*
 * Co-hosts (the API's docs/COHOSTS.md) in what machines read: the event's
 * structured data names every host as its organizer, the host club first;
 * the description and the feeds say "Hosted by A and B". Without co-hosts,
 * all of it is as before.
 */
const RC = { club_id: 9, name: "Robotics Club", slug: "robotics-club", logo: "https://cdn.example/rc.png" };
const CC = { club_id: 12, name: "Code Club", slug: null, logo: null };

describe("a co-hosted event's structured data", () => {
  it("names every host as an organizer, the host club first, each by its page and logo", () => {
    const [ld] = eventStructuredData(parseEventPage(fullEvent({ cohosts: [RC, CC] })));
    expect(ld.organizer).toEqual([
      { "@type": "Organization", "@id": "https://myotherapp.in/clubs/circuit-society#organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" },
      {
        "@type": "Organization",
        "@id": "https://myotherapp.in/clubs/robotics-club#organization",
        name: "Robotics Club",
        url: "https://myotherapp.in/clubs/robotics-club",
        logo: "https://myotherapp.in/media/clubs/robotics-club/logo?size=medium",
      },
      // No address: a name only.
      { "@type": "Organization", name: "Code Club" },
    ]);
    expect(JSON.stringify(ld)).not.toMatch(/cdn\.example/);
    expect(validateEvent(ld).errors).toEqual([]);
  });

  it("keeps one organizer, as before, without co-hosts", () => {
    const [ld] = eventStructuredData(parseEventPage(fullEvent()));
    expect(ld.organizer).toEqual({ "@type": "Organization", "@id": "https://myotherapp.in/clubs/circuit-society#organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" });
  });

  it('says "Hosted by A and B" where the description is the facts line', () => {
    const page = parseEventPage(sparseEvent({ cohosts: [RC] }));
    const [ld] = eventStructuredData(page);
    expect(ld.description).toMatch(/\. Hosted by .+ and Robotics Club on MyOtherApp\.$/);
    expect(eventMetadata(page).description).toMatch(/Hosted by .+ and Robotics Club on MyOtherApp\.$/);
    const club = { name: "Circuit Society" };
    const event = { starts_at: null, is_online: true, has_fee: false };
    expect(eventFactsLine(event, club)).toBe("Online · Free. Hosted by Circuit Society on MyOtherApp.");
    expect(eventFactsLine(event, club, [{ name: "Robotics Club" }, { name: "Code Club" }])).toBe("Online · Free. Hosted by Circuit Society, Robotics Club and Code Club on MyOtherApp.");
  });
});

describe("a club page's events it co-hosts, in its structured data", () => {
  it("are organised by their hosts, the host club first; its own events by itself", () => {
    const data = parseClubPage({
      club: { id: 3, name: "Circuit Society", slug: "circuit-society", socials: {} },
      upcoming: [
        { id: 68, slug: "hack-night-04", name: "Hack Night 04", starts_at: "2026-11-17T12:30:00Z", status: "upcoming", club: { id: 3, name: "Circuit Society", slug: "circuit-society" } },
        {
          id: 70,
          slug: "design-jam",
          name: "Design Jam",
          starts_at: "2026-11-20T12:30:00Z",
          status: "upcoming",
          club: { id: 1, name: "Design Society", slug: "design-society" },
          cohosts: [{ club_id: 3, name: "Circuit Society", slug: "circuit-society" }],
        },
      ],
      past: [],
      threads: [],
      team: [],
      partners: [],
    });
    const [ld] = clubStructuredData(data);
    expect(ld.event[0].organizer).toEqual({ "@type": "Organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" });
    expect(ld.event[1].organizer).toEqual([
      { "@type": "Organization", name: "Design Society", url: "https://myotherapp.in/clubs/design-society" },
      { "@type": "Organization", name: "Circuit Society", url: "https://myotherapp.in/clubs/circuit-society" },
    ]);
    expect(validateOrganization(ld).errors).toEqual([]);
  });
});

describe("a co-hosted event in the feeds", () => {
  const card = (over = {}) =>
    parseEvent({ id: 5, slug: "solder-sprint", name: "Solder Sprint", starts_at: "2026-10-25T12:30:00Z", has_fee: false, club: { id: 3, name: "Circuit Society", slug: "circuit-society" }, ...over });

  it("is by every host", () => {
    const xml = eventItem(card({ cohosts: [RC] }));
    expect(xml).toContain("Free · by Circuit Society and Robotics Club");
    expect(xml).toContain("<dc:creator>Circuit Society and Robotics Club</dc:creator>");
    expect(xml).toContain("<ev:organizer>Circuit Society and Robotics Club</ev:organizer>");
  });

  it("is by the club alone without co-hosts", () => {
    const xml = eventItem(card());
    expect(xml).toContain("Free · by Circuit Society<");
    expect(xml).toContain("<ev:organizer>Circuit Society</ev:organizer>");
  });
});
