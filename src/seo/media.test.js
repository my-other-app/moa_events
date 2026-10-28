// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseClubPage, parseEventPage } from "@/api/parse";
import { fullEvent } from "@/test/eventFixture";
import { isStale, mediaTarget, posterOf, redirectTtl, secondsLeft } from "./media";
import { stableClubPage, stableEventPage } from "./stabilize";

const NOW = Date.parse("2026-10-18T07:00:00Z");
const at = (secondsFromNow) => Math.floor(NOW / 1000) + secondsFromNow;

describe("a media address", () => {
  it("is read into what to look up, and nonsense is nothing", () => {
    expect(mediaTarget(["events", "hack-night-04", "poster"])).toMatchObject({ source: "event", ref: "hack-night-04", what: "poster" });
    expect(mediaTarget(["events", "123", "cover"])).toMatchObject({ source: "event", what: "cover" });
    expect(mediaTarget(["events", "x", "speakers", "7", "photo"])).toMatchObject({ source: "event", what: "speaker" });
    expect(mediaTarget(["events", "x", "speakers", "i2", "photo"])).toMatchObject({ what: "speaker" });
    expect(mediaTarget(["events", "x", "team", "3", "photo"])).toMatchObject({ what: "team" });
    expect(mediaTarget(["clubs", "circuit-society", "logo"])).toMatchObject({ source: "club", what: "logo" });
    expect(mediaTarget(["clubs", "circuit-society", "cover"])).toMatchObject({ source: "club", what: "cover" });
    expect(mediaTarget(["clubs", "c", "partners", "0", "logo"])).toMatchObject({ what: "partner" });
    expect(mediaTarget(["threads", "55", "image"])).toMatchObject({ source: "thread", what: "image" });
    for (const bad of [[], ["events"], ["events", "../x", "poster"], ["events", "x", "poster", "y"], ["clubs", "c", "team", "1000", "photo"], ["users", "1", "photo"], ["events", "x", "speakers", "a b", "photo"]]) {
      expect(mediaTarget(bad)).toBeNull();
    }
  });

  it("finds the current link for each size, the poster's smaller ones from its thumbnail", () => {
    const page = parseEventPage(fullEvent({ event: { ...fullEvent().event, poster: "https://s3/p.png?Expires=1", poster_thumb: "https://s3/p.medium.png?Expires=1" } }));
    expect(posterOf(page, "original")).toBe("https://s3/p.png?Expires=1");
    expect(posterOf(page, "medium")).toBe("https://s3/p.medium.png?Expires=1");
    expect(posterOf(page, "nonsense")).toBe("https://s3/p.png?Expires=1");
    // A card's large: the original while the API sends no large, never the soft medium; the large once it does.
    expect(posterOf(page, "large")).toBe("https://s3/p.png?Expires=1");
    const withLarge = parseEventPage(fullEvent({ event: { ...fullEvent().event, poster: "https://s3/p.png", poster_thumb: "https://s3/p.medium.png", poster_large: "https://s3/p.large.png" } }));
    expect(posterOf(withLarge, "large")).toBe("https://s3/p.large.png");
    expect(posterOf(withLarge, "medium")).toBe("https://s3/p.medium.png");
    const speaker = mediaTarget(["events", "hack-night-04", "speakers", "1", "photo"]);
    const withPhoto = parseEventPage(fullEvent({ speakers: [{ id: 1, name: "Ananya", photo: "https://s3/a.jpg" }, { id: null, name: "Rahul", photo: "https://s3/r.jpg" }] }));
    expect(speaker.pick(withPhoto)).toBe("https://s3/a.jpg");
    expect(mediaTarget(["events", "x", "speakers", "i1", "photo"]).pick(withPhoto)).toBe("https://s3/r.jpg");
    const club = parseClubPage({ club: { id: 3, slug: "c", name: "C", logo: { thumbnail: "https://s3/l-t.png", medium: "https://s3/l-m.png" } }, partners: [{ name: "Acme", logo: "https://s3/acme.png" }] });
    expect(mediaTarget(["clubs", "c", "logo"]).pick(club)).toBe("https://s3/l-t.png");
    expect(mediaTarget(["clubs", "c", "logo"]).pick(club, "medium")).toBe("https://s3/l-m.png");
    // A banner has no thumbnail: its large, else the next best.
    const covered = parseClubPage({ club: { id: 3, slug: "c", name: "C", cover: { medium: "https://s3/c-m.png", large: "https://s3/c-l.png", original: "https://s3/c.png" } } });
    expect(mediaTarget(["clubs", "c", "cover"]).pick(covered, "large")).toBe("https://s3/c-l.png");
    expect(mediaTarget(["clubs", "c", "cover"]).pick(covered, "medium")).toBe("https://s3/c-m.png");
    expect(mediaTarget(["clubs", "c", "partners", "0", "logo"]).pick(club)).toBe("https://s3/acme.png");
    expect(mediaTarget(["clubs", "c", "partners", "5", "logo"]).pick(club)).toBeNull();
  });
});

describe("how long a presigned link lives", () => {
  it("reads AWS's v2 and v4 signatures, and knows a plain link doesn't expire", () => {
    expect(secondsLeft(`https://b.s3.amazonaws.com/x.png?AWSAccessKeyId=A&Signature=S&Expires=${at(3000)}`, NOW)).toBe(3000);
    expect(secondsLeft("https://b.s3.amazonaws.com/x.png?X-Amz-Algorithm=A&X-Amz-Date=20261018T065000Z&X-Amz-Expires=3600&X-Amz-Signature=s", NOW)).toBe(3000);
    expect(secondsLeft("https://cdn.example/x.png", NOW)).toBeNull();
    expect(secondsLeft("not a url", NOW)).toBeNull();
  });

  it("keeps a redirect five minutes at most, and never past two minutes before the link dies", () => {
    expect(redirectTtl(`https://s3/x?Expires=${at(3600)}`, NOW)).toBe(300);
    expect(redirectTtl(`https://s3/x?Expires=${at(400)}`, NOW)).toBe(280);
    expect(redirectTtl(`https://s3/x?Expires=${at(60)}`, NOW)).toBe(0);
    expect(redirectTtl("https://cdn.example/x.png", NOW)).toBe(300);
  });

  it("calls a link stale with less than ten minutes left (so it is looked up again)", () => {
    expect(isStale(`https://s3/x?Expires=${at(3000)}`, NOW)).toBe(false);
    expect(isStale(`https://s3/x?Expires=${at(500)}`, NOW)).toBe(true);
    expect(isStale(`https://s3/x?Expires=${at(-10)}`, NOW)).toBe(true);
    expect(isStale(null, NOW)).toBe(false);
  });
});

describe("a page's images, before it is cached", () => {
  const presigned = /s3\.example|cdn\.example|Expires=/;

  it("are all on stable addresses for an event page, and missing ones stay missing", () => {
    const data = fullEvent();
    data.club.logo = "https://s3.example/logo.png?Expires=1";
    data.speakers[0].photo = "https://s3.example/a.png?Expires=1";
    data.team[0].photo = "https://s3.example/t.png?Expires=1";
    data.more_from_club[0].poster = "https://s3.example/m.png?Expires=1";
    data.more_from_club[0].club.logo = "https://s3.example/l.png?Expires=1";
    const page = stableEventPage(parseEventPage(data));
    expect(JSON.stringify(page)).not.toMatch(presigned);
    expect(page.event.poster).toEqual({
      thumbnail: "/media/events/hack-night-04/poster?size=thumbnail",
      medium: "/media/events/hack-night-04/poster?size=medium",
      large: "/media/events/hack-night-04/poster?size=large",
      original: "/media/events/hack-night-04/poster",
    });
    expect(page.club.logo.thumbnail).toBe("/media/clubs/circuit-society/logo?size=thumbnail");
    expect(page.speakers.map((s) => s.photo)).toEqual(["/media/events/hack-night-04/speakers/1/photo", null]);
    expect(page.team[0].photo).toBe("/media/events/hack-night-04/team/0/photo");
    expect(page.more_from_club[0].poster.medium).toBe("/media/events/solder-sprint/poster?size=medium");
    expect(page.similar[0].poster).toBeNull();
  });

  it("are all on stable addresses for a club page", () => {
    const data = parseClubPage({
      club: { id: 3, slug: "c", name: "C", logo: "https://s3.example/l.png?Expires=1", cover: "https://s3.example/c.png?Expires=1" },
      upcoming: [{ id: 9, slug: "e", name: "E", poster: "https://s3.example/e.png?Expires=1", club: { id: 3, slug: "c", name: "C", logo: "https://s3.example/l.png?Expires=1" } }],
      threads: [{ id: 5, club: { id: 3, slug: "c", name: "C", logo: "https://s3.example/l.png?Expires=1" }, image: "https://s3.example/t.png?Expires=1" }],
      team: [{ name: "Asha", photo: "https://s3.example/a.png?Expires=1" }, { name: "Ravi" }],
      partners: [{ name: "Acme", logo: "https://s3.example/acme.png?Expires=1" }],
    });
    const page = stableClubPage(data);
    expect(JSON.stringify(page)).not.toMatch(presigned);
    expect(page.club.cover.original).toBe("/media/clubs/c/cover");
    expect(page.threads[0].image.medium).toBe("/media/threads/5/image?size=medium");
    expect(page.team.map((p) => p.photo)).toEqual(["/media/clubs/c/team/0/photo", null]);
    expect(page.partners[0].logo).toBe("/media/clubs/c/partners/0/logo");
  });
});

describe("where the pictures come from (for <link rel=preconnect>)", () => {
  it("is the origin of the first picture link, in any shape the API sends it", async () => {
    const { mediaOrigin } = await import("./media");
    expect(mediaOrigin("https://bucket.s3.amazonaws.com/a/p.jpeg?Signature=x&Expires=1")).toBe("https://bucket.s3.amazonaws.com");
    expect(mediaOrigin(null, { medium: "https://media.myotherapp.in/clubs/logos/v-1.medium.png" })).toBe("https://media.myotherapp.in");
    // Stable addresses (same origin) and junk are skipped; nothing found is null.
    expect(mediaOrigin("/media/events/x/poster", "javascript:alert(1)", "http://plain.example/x.png")).toBeNull();
    expect(mediaOrigin()).toBeNull();
  });
});
