import { describe, expect, it } from "vitest";
import { eventHosts, hostedBy, hostNames, hostsOf, hostsShort, isCohosted, joinNames, sameClub } from "./hosts";

/*
 * Who hosts an event (the API's docs/COHOSTS.md): its club, then the clubs
 * co-hosting it, in the order they accepted. "Hosted by A and B" for one
 * co-host, "Hosted by A, B and C" for more; a card says "A + 2" for three
 * or more. Without co-hosts, exactly what the site said before.
 */
const DS = { id: 1, name: "Design Society", slug: "design-society", logo: null };
const RC = { id: 9, name: "Robotics Club", slug: "robotics-club", logo: "https://cdn.example/rc.png" };
const CC = { id: 12, name: "Code Club", slug: "code-club", logo: null };
const QC = { id: 14, name: "Quiz Circle", slug: "quiz-circle", logo: null };

describe("the hosts' names", () => {
  it("join as a sentence: A; A and B; A, B and C", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Design Society"])).toBe("Design Society");
    expect(joinNames(["Design Society", "Robotics Club"])).toBe("Design Society and Robotics Club");
    expect(joinNames(["Design Society", "Robotics Club", "Code Club"])).toBe("Design Society, Robotics Club and Code Club");
    expect(joinNames(["A", "B", "C", "D"])).toBe("A, B, C and D");
    // Blank names are no one.
    expect(joinNames([" Design Society ", "", null, "Robotics Club"])).toBe("Design Society and Robotics Club");
  });

  it("say Hosted by, with one co-host and with more", () => {
    expect(hostedBy([DS])).toBe("Hosted by Design Society");
    expect(hostedBy([DS, RC])).toBe("Hosted by Design Society and Robotics Club");
    expect(hostedBy([DS, RC, CC])).toBe("Hosted by Design Society, Robotics Club and Code Club");
    expect(hostedBy([])).toBe("");
    expect(hostNames([DS, RC])).toBe("Design Society and Robotics Club");
  });

  it("are short on a card: A, A and B, then A + 2", () => {
    expect(hostsShort([DS])).toBe("Design Society");
    expect(hostsShort([DS, RC])).toBe("Design Society and Robotics Club");
    expect(hostsShort([DS, RC, CC])).toBe("Design Society + 2");
    expect(hostsShort([DS, RC, CC, QC])).toBe("Design Society + 3");
    expect(hostsShort([])).toBe("");
  });
});

describe("an event's hosts", () => {
  it("are its club first, then each co-host in the order the API gives", () => {
    expect(hostsOf(DS, [RC, CC]).map((h) => h.name)).toEqual(["Design Society", "Robotics Club", "Code Club"]);
    expect(eventHosts({ club: DS, cohosts: [CC, RC] }).map((h) => h.slug)).toEqual(["design-society", "code-club", "robotics-club"]);
  });

  it("leave out the club itself, a club listed twice and a nameless row", () => {
    const hosts = hostsOf(DS, [RC, { ...DS, logo: "x" }, { id: 9, name: "Robotics Club again", slug: null }, { id: 40, name: "" }, null, CC]);
    expect(hosts.map((h) => h.name)).toEqual(["Design Society", "Robotics Club", "Code Club"]);
    // The same club by its slug when there's no id to go by.
    expect(hostsOf({ id: null, name: "DS", slug: "design-society" }, [{ id: null, name: "Also DS", slug: "design-society" }])).toHaveLength(1);
  });

  it("are the club alone for an API without co-hosts", () => {
    expect(eventHosts({ club: DS })).toEqual([DS]);
    expect(eventHosts({ club: DS, cohosts: null })).toEqual([DS]);
    expect(eventHosts({ club: null })).toEqual([]);
    expect(eventHosts(null)).toEqual([]);
    expect(isCohosted({ club: DS })).toBe(false);
    expect(isCohosted({ club: DS, cohosts: [] })).toBe(false);
    expect(isCohosted({ club: DS, cohosts: [RC] })).toBe(true);
  });

  it("tell one club from another by id, then by slug", () => {
    expect(sameClub(DS, { id: "1", name: "x", slug: null })).toBe(true);
    expect(sameClub(DS, { id: null, name: "x", slug: "design-society" })).toBe(true);
    expect(sameClub(DS, RC)).toBe(false);
    expect(sameClub({ id: null, slug: null }, { id: null, slug: null })).toBe(false);
    expect(sameClub(DS, null)).toBe(false);
  });
});
