// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseClubPage, parseEventPage, parseThread } from "@/api/parse";
import { fullEvent, sparseEvent } from "@/test/eventFixture";
import { clubMetadata, eventMetadata, eventOgVersion, pageMetadata, threadHeadline, threadMetadata } from "./metadata";

describe("a page's head", () => {
  it("names the page with the site, points at its one address on myotherapp.in, and fills the share tags", () => {
    const meta = pageMetadata({ title: "Find events", description: "Events near you.", path: "/events" });
    expect(meta.title).toBe("Find events");
    expect(meta.alternates).toEqual({ canonical: "https://myotherapp.in/events" });
    expect(meta.openGraph).toMatchObject({
      type: "website",
      url: "https://myotherapp.in/events",
      title: "Find events · MyOtherApp",
      description: "Events near you.",
      siteName: "MyOtherApp",
      locale: "en_IN",
      images: [{ url: "https://myotherapp.in/og-default.png", width: 1200, height: 630 }],
    });
    expect(meta.twitter).toEqual({ card: "summary_large_image", title: "Find events · MyOtherApp", description: "Events near you.", images: ["https://myotherapp.in/og-default.png"] });
    expect(meta.robots).toBeUndefined();
  });

  it("keeps a person's own pages out of search results, with no address of their own", () => {
    const meta = pageMetadata({ title: "Your ticket", path: null, noindex: true });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates).toEqual({});
    expect(meta.openGraph.url).toBeUndefined();
  });

  it("uses a title as it is when asked (the home page's)", () => {
    expect(pageMetadata({ absoluteTitle: "MyOtherApp · Events and clubs near you", path: "/" }).title).toEqual({ absolute: "MyOtherApp · Events and clubs near you" });
  });
});

describe("an event's head", () => {
  it("is the event: its name, its description, its canonical /events/{slug} and its own share picture", () => {
    const meta = eventMetadata(parseEventPage(fullEvent()));
    expect(meta.title).toBe("Hack Night 04");
    expect(meta.description).toMatch(/^Twenty-four hours of building\./);
    expect(meta.description.length).toBeLessThanOrEqual(160);
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/events/hack-night-04");
    expect(meta.openGraph).toMatchObject({ type: "website", url: "https://myotherapp.in/events/hack-night-04", title: "Hack Night 04 · MyOtherApp", locale: "en_IN", siteName: "MyOtherApp" });
    const [image] = meta.openGraph.images;
    expect(image).toMatchObject({ width: 1200, height: 630, alt: "Hack Night 04 · Sun, 18 Oct · 6:00 PM IST · Lab 3B, COEP" });
    expect(image.url).toMatch(/^https:\/\/myotherapp\.in\/og\/events\/hack-night-04\?v=[a-z0-9]+$/);
    expect(meta.twitter.images).toEqual([image.url]);
  });

  it("describes an event without words by when, where and who", () => {
    const meta = eventMetadata(parseEventPage(sparseEvent()));
    expect(meta.description).toBe("Thu, 22 Oct · 7:00 PM IST · Yasya Hall · Free. Hosted by Yasya on MyOtherApp.");
  });

  it("changes its share picture's version when what the picture shows changes, and only then", () => {
    const base = parseEventPage(fullEvent());
    const v = eventOgVersion(base);
    expect(eventOgVersion(parseEventPage(fullEvent()))).toBe(v);
    // A fresh signature on the same poster is the same picture.
    const resigned = parseEventPage(fullEvent({ event: { ...fullEvent().event, poster: { original: "https://cdn.example/p.jpg?sig=other" } } }));
    expect(eventOgVersion(resigned)).toBe(v);
    expect(eventOgVersion(parseEventPage(fullEvent({ event: { ...fullEvent().event, name: "Hack Night 05" } })))).not.toBe(v);
    expect(eventOgVersion(parseEventPage(fullEvent({ event: { ...fullEvent().event, starts_at: "2026-10-19T18:00:00+05:30" } })))).not.toBe(v);
    expect(eventOgVersion(parseEventPage(fullEvent({ event: { ...fullEvent().event, status: "ended" } })))).not.toBe(v);
  });
});

describe("a club's head", () => {
  it("is the club, with its share picture and its own feed", () => {
    const meta = clubMetadata(parseClubPage({ club: { id: 3, slug: "circuit-society", name: "Circuit Society", tagline: "We build things that blink" } }));
    expect(meta.title).toBe("Circuit Society");
    expect(meta.description).toBe("We build things that blink");
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/clubs/circuit-society");
    expect(meta.alternates.types).toEqual({
      "application/rss+xml": [{ url: "https://myotherapp.in/clubs/circuit-society/rss.xml", title: "Upcoming events from Circuit Society" }],
    });
    expect(meta.openGraph.images[0].url).toMatch(/^https:\/\/myotherapp\.in\/og\/clubs\/circuit-society\?v=/);
  });
});

describe("a post's head", () => {
  const post = (over = {}) =>
    parseThread({ id: "t1", club: { id: 3, name: "Circuit Society", slug: "circuit-society" }, body: "Kits are in! Pick yours up at Lab 3B before Friday, and bring your student ID with you.", created_at: "2026-10-15T10:00:00Z", ...over });

  it("is titled as the old page was, quotes the post, and shares its picture or the club's", () => {
    const meta = threadMetadata(post({ image: "https://b.s3.amazonaws.com/k.jpg?Signature=x" }));
    expect(meta.title).toEqual({ absolute: "Circuit Society on MyOtherApp: “Kits are in! Pick yours up at Lab 3B before Friday, and brin…”" });
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/threads/t1");
    expect(meta.openGraph).toMatchObject({ type: "article", url: "https://myotherapp.in/threads/t1" });
    expect(meta.openGraph.images[0].url).toBe("https://myotherapp.in/media/threads/t1/image");
    expect(meta.description).toMatch(/^Kits are in! Pick yours up/);
    const plain = threadMetadata(post());
    expect(plain.openGraph.images[0]).toMatchObject({ url: "https://myotherapp.in/og/clubs/circuit-society", width: 1200, height: 630 });
    expect(JSON.stringify(meta)).not.toMatch(/Signature=/);
  });

  it("says what a poll asks when the post has no words", () => {
    const meta = threadMetadata(post({ body: "", kind: "poll", poll: { options: [{ id: "a", label: "Friday" }, { id: "b", label: "Saturday" }], votes: 0 } }));
    expect(meta.title).toEqual({ absolute: "Circuit Society on MyOtherApp" });
    expect(meta.description).toBe("A poll from Circuit Society on MyOtherApp: Friday, Saturday.");
    expect(threadHeadline(post({ body: "\n  First line\nsecond" }))).toBe("First line");
  });
});
