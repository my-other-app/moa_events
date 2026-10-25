// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { fullEvent } from "@/test/eventFixture";

/*
 * The share pictures, drawn for real (next/og, then sharp for a JPEG): an
 * event's at 1200×630 and at the three sizes its structured data names, and
 * a club's. The API and the pictures it links to are a fake fetch.
 */
const event = fullEvent();
const club = {
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: "https://s3.example/l.png?Expires=1", cover: null, tagline: "We build things that blink", location_name: "Pune", followers: 40, upcoming_events: 1 },
  upcoming: [{ id: 68, slug: "hack-night-04", name: "Hack Night 04", starts_at: "2026-10-30T12:30:00Z", status: "upcoming" }],
  past: [],
};

let picture; // a real PNG, for any picture the API links to
let pictures; // whether the picture links answer
let calls;

beforeAll(async () => {
  picture = await sharp({ create: { width: 40, height: 60, channels: 3, background: { r: 200, g: 40, b: 90 } } })
    .png()
    .toBuffer();
  // Load the routes (and the renderer) once, up front.
  await Promise.all([import("../og/events/[slug]/route.jsx"), import("../og/clubs/[slug]/route.jsx")]);
}, 60000);

beforeEach(() => {
  pictures = false;
  calls = [];
  vi.stubGlobal("fetch", async (url) => {
    const u = new URL(String(url));
    calls.push(u.href);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (u.hostname === "api.myotherapp.in") {
      const ref = decodeURIComponent(u.pathname.split("/").at(-1));
      if (ref === "boom") return json({}, 503);
      if (u.pathname.startsWith("/api/v1/discover/events/") && ref === "hack-night-04") return json(event);
      if (u.pathname.startsWith("/api/v1/discover/clubs/") && ref === "circuit-society") return json(club);
      return json({ detail: "Not found" }, 404);
    }
    return pictures ? new Response(picture, { headers: { "Content-Type": "image/png" } }) : new Response("gone", { status: 403 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const params = (o) => Promise.resolve(o);
const eventPicture = async (slug, query = "") => (await import("../og/events/[slug]/route.jsx")).GET(new NextRequest(`https://myotherapp.in/og/events/${slug}${query}`), { params: params({ slug }) });
const clubPicture = async (slug) => (await import("../og/clubs/[slug]/route.jsx")).GET(new NextRequest(`https://myotherapp.in/og/clubs/${slug}`), { params: params({ slug }) });

/** {format, width, height} of what was drawn. */
const drawn = async (res) => {
  const { format, width, height } = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  return { format, width, height };
};
const KEPT = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

describe("/og/events/{slug}", () => {
  it("draws the event as a 1200×630 PNG when its poster can't be had, kept a day at the edge", async () => {
    const res = await eventPicture("hack-night-04");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(KEPT);
    expect(await drawn(res)).toEqual({ format: "png", width: 1200, height: 630 });
    // The poster's link was dead, so the event was looked up afresh once for a new one.
    expect(calls.filter((u) => u.includes("/discover/events/hack-night-04"))).toHaveLength(2);
  }, 30000);

  it("draws the poster in, as a JPEG of the same size", async () => {
    pictures = true;
    const res = await eventPicture("hack-night-04");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe(KEPT);
    expect(await drawn(res)).toEqual({ format: "jpeg", width: 1200, height: 630 });
    // The poster at its middle size, and the club has no logo to fetch.
    expect(calls).toContain("https://cdn.example/p-t.jpg");
  }, 30000);

  it.each([
    ["16x9", 1200, 675],
    ["4x3", 1200, 900],
    ["1x1", 1200, 1200],
  ])("draws the %s picture for the event's structured data at %i×%i", async (ratio, width, height) => {
    pictures = true;
    const res = await eventPicture("hack-night-04", `?ratio=${ratio}`);
    expect(res.status).toBe(200);
    expect(await drawn(res)).toEqual({ format: "jpeg", width, height });
    // A frame shows the whole poster, so the original.
    expect(calls).toContain("https://cdn.example/p.jpg");
  }, 30000);

  it("draws the usual picture for a ratio it doesn't know", async () => {
    const res = await eventPicture("hack-night-04", "?ratio=3x2");
    expect(await drawn(res)).toEqual({ format: "png", width: 1200, height: 630 });
  }, 30000);

  it("is a 404 for no such event, and a 502 when the API fails", async () => {
    const missing = await eventPicture("nope");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("public, max-age=60, s-maxage=60");
    const down = await eventPicture("boom");
    expect(down.status).toBe(502);
    expect(down.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/og/clubs/{slug}", () => {
  it("draws the club as a 1200×630 PNG without a cover", async () => {
    const res = await clubPicture("circuit-society");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(KEPT);
    expect(await drawn(res)).toEqual({ format: "png", width: 1200, height: 630 });
    expect(calls).toContain("https://s3.example/l.png?Expires=1");
  }, 30000);

  it("draws its cover in, as a JPEG of the same size", async () => {
    pictures = true;
    club.club.cover = "https://cdn.example/c.jpg";
    try {
      const res = await clubPicture("circuit-society");
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(await drawn(res)).toEqual({ format: "jpeg", width: 1200, height: 630 });
      expect(calls).toContain("https://cdn.example/c.jpg");
    } finally {
      club.club.cover = null;
    }
  }, 30000);

  it("is a 404 for no such club, and a 502 when the API fails", async () => {
    expect((await clubPicture("nobody")).status).toBe(404);
    expect((await clubPicture("boom")).status).toBe(502);
  });
});
