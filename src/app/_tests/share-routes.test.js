// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/next";
import { fullEvent } from "@/test/eventFixture";
import { html } from "@/test/html";
import { DATA_DELETION } from "@/content/datadeletion";
import { LEGAL } from "@/content/legal";
import { RESERVED } from "@/seo/legacy";

/*
 * The share row on an event's page: in the HTML when the API has one, and
 * never a reason for the page to fail (404, 500, a timeout: no row). The
 * link preview's picture: the API's share_image_url when it lasts, else the
 * site's card. /data-deletion and the policies' new sections.
 */
const params = (o) => Promise.resolve(o);
const ROW = [
  { platform: "x", text: "Hack Night 04", url: "https://r.myotherapp.in/x1" },
  { platform: "linkedin", text: "Hack Night 04", url: "https://r.myotherapp.in/l1" },
  { platform: "facebook", text: "Hack Night 04", url: "https://r.myotherapp.in/f1" },
  { platform: "whatsapp", text: "Hack Night 04", url: "https://r.myotherapp.in/w1" },
  { platform: "copy", text: "Hack Night 04", url: "https://r.myotherapp.in/c1" },
];

async function eventRoute(share, over = {}) {
  vi.resetModules();
  const fetch = fakeFetch((u) => {
    if (u.pathname === "/api/v1/discover/events/hack-night-04") return { body: fullEvent(over) };
    if (u.pathname === "/api/v1/events/123/share") return typeof share === "function" ? share() : share;
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
  return { route: await import("../events/[slug]/page.jsx"), fetch };
}

afterEach(() => vi.unstubAllGlobals());

describe("the share row on an event's page", { timeout: 30000 }, () => {
  it("is in the HTML, each platform's share page with the event's own tracking link", async () => {
    const { route, fetch } = await eventRoute({ body: ROW });
    const out = html(await route.default({ params: params({ slug: "hack-night-04" }) }), "/events/hack-night-04");
    expect(out).toContain("Share this event");
    expect(out).toContain('href="https://x.com/intent/post?text=Hack%20Night%2004&amp;url=https%3A%2F%2Fr.myotherapp.in%2Fx1"');
    expect(out).toContain('href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fr.myotherapp.in%2Fl1"');
    expect(out).toContain('href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fr.myotherapp.in%2Ff1"');
    expect(out).toContain('href="https://wa.me/?text=Hack%20Night%2004%20https%3A%2F%2Fr.myotherapp.in%2Fw1"');
    expect(out).toContain("Copy link");
    const read = fetch.calls.find((c) => c.url.endsWith("/api/v1/events/123/share"));
    expect(read.init.next).toEqual({ revalidate: 60, tags: ["event:hack-night-04"] });
  });

  it("is left out, and the page renders, while the API has no share row (404), or fails (500), or never answers", async () => {
    for (const share of [{ status: 404, body: { detail: "Not Found" } }, { status: 500, body: {} }, () => new Error("ECONNRESET")]) {
      const { route } = await eventRoute(share);
      const out = html(await route.default({ params: params({ slug: "hack-night-04" }) }), "/events/hack-night-04");
      expect(out).toContain("Hack Night 04");
      expect(out).not.toContain("Share this event");
    }
  });

  it("isn't asked for, or shown, on a cancelled event", async () => {
    const { route, fetch } = await eventRoute({ body: ROW }, { event: { ...fullEvent().event, status: "cancelled", cancellation: { reason: "Rain", cancelled_at: "2026-11-01T10:00:00Z" } } });
    const out = html(await route.default({ params: params({ slug: "hack-night-04" }) }), "/events/hack-night-04");
    expect(out).not.toContain("Share this event");
    expect(fetch.calls.some((c) => c.url.endsWith("/share"))).toBe(false);
  });
});

describe("the event's link preview", { timeout: 30000 }, () => {
  const imageOf = async (over) => {
    const { route } = await eventRoute({ status: 404, body: {} }, over);
    return (await route.generateMetadata({ params: params({ slug: "hack-night-04" }) })).openGraph.images[0];
  };

  it("uses share_image_url (1200 × 630) when the API sends a lasting one", async () => {
    const image = await imageOf({ event: { ...fullEvent().event, share_image_url: "https://media.myotherapp.in/posters/123/facebook.jpg" } });
    expect(image).toMatchObject({ url: "https://media.myotherapp.in/posters/123/facebook.jpg", width: 1200, height: 630 });
  });

  it("keeps the site's own card without one, or for a presigned one", async () => {
    expect((await imageOf({})).url).toMatch(/^https:\/\/myotherapp\.in\/og\/events\/hack-night-04\?v=/);
    const presigned = await imageOf({ event: { ...fullEvent().event, share_image_url: "https://b.s3.amazonaws.com/p.jpg?X-Amz-Signature=x" } });
    expect(presigned.url).toMatch(/^https:\/\/myotherapp\.in\/og\/events\//);
  });
});

describe("/data-deletion", () => {
  it("is a static page with its own canonical; every section in the HTML", async () => {
    vi.stubGlobal("fetch", fakeFetch({}));
    const route = await import("../data-deletion/page.jsx");
    expect(route.metadata.alternates.canonical).toBe("https://myotherapp.in/data-deletion");
    expect(route.metadata.robots).toBeUndefined();
    const out = html(route.default(), "/data-deletion");
    for (const s of DATA_DELETION.sections) expect(out).toContain(`id="${s.id}"`);
    expect(out).toContain("Settings → Social accounts");
    expect(RESERVED.has("data-deletion")).toBe(true);
  });

  it("the privacy policy and terms say what we keep from social accounts, and link here", () => {
    const privacy = LEGAL.privacy.sections.find((s) => s.id === "social-accounts");
    expect(privacy.heading).toBe("7. Social Accounts Clubs Connect");
    expect(JSON.stringify(privacy.blocks)).toContain("(/data-deletion)");
    expect(LEGAL.privacy.sections.map((s) => s.heading.split(".")[0])).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    const terms = LEGAL.terms.sections.find((s) => s.id === "social-posting");
    expect(JSON.stringify(terms.blocks)).toContain("The club is responsible for what it posts");
  });
});
