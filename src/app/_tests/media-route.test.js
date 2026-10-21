// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeFetch } from "@/test/next";
import { fullEvent, sparseEvent } from "@/test/eventFixture";

/*
 * GET /media/...: the stable address of an image, redirecting to its current
 * presigned link. The API is a fake fetch whose links expire when we say.
 */
const now = () => Math.floor(Date.now() / 1000);
let posterExpires;
let fetch;

const eventWithPoster = () =>
  fullEvent({
    event: {
      ...fullEvent().event,
      poster: `https://b.s3.amazonaws.com/p.png?Signature=s&Expires=${posterExpires}`,
      poster_thumb: `https://b.s3.amazonaws.com/p.medium.png?Signature=s&Expires=${posterExpires}`,
    },
    speakers: [{ id: 1, name: "Ananya", photo: `https://b.s3.amazonaws.com/a.jpg?Expires=${posterExpires}` }],
  });

beforeEach(() => {
  posterExpires = now() + 3600;
  fetch = fakeFetch((url) => {
    if (url.pathname === "/api/v1/discover/events/hack-night-04") return { body: eventWithPoster() };
    if (url.pathname === "/api/v1/discover/events/quiet-evening") return { body: sparseEvent() };
    if (url.pathname === "/api/v1/discover/events/boom") return new TypeError("fetch failed");
    if (url.pathname === "/api/v1/discover/clubs/circuit-society")
      return { body: { club: { id: 3, slug: "circuit-society", name: "Circuit Society", logo: `https://b.s3.amazonaws.com/l.png?Expires=${posterExpires}`, cover: `https://b.s3.amazonaws.com/c.jpg?Expires=${posterExpires}` } } };
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => vi.unstubAllGlobals());

const get = async (path) => {
  const { GET } = await import("../media/[...path]/route.jsx");
  const url = new URL(path, "https://myotherapp.in");
  return GET(new NextRequest(url), { params: Promise.resolve({ path: url.pathname.split("/").slice(2) }) });
};

describe("a stable image address", () => {
  it("redirects to the poster's current link, kept five minutes", async () => {
    const res = await get("/media/events/hack-night-04/poster");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://b.s3.amazonaws.com/p.png?Signature=s&Expires=${posterExpires}`);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, s-maxage=300");
    const medium = await get("/media/events/hack-night-04/poster?size=medium");
    expect(medium.headers.get("location")).toContain("p.medium.png");
  });

  it("never keeps a redirect longer than the link lives, and asks again past the caches when it is about to die", async () => {
    posterExpires = now() + 200;
    const res = await get("/media/events/hack-night-04/poster");
    // Asked twice: the cached read, then a fresh one because the link had under ten minutes.
    expect(fetch.calls.map((c) => c.init.cache || "cached")).toEqual(["cached", "no-store"]);
    expect(res.status).toBe(307);
    // 200 s left, less the two-minute margin (a second may tick by meanwhile).
    expect(res.headers.get("cache-control")).toMatch(/^public, max-age=(79|80), s-maxage=(79|80)$/);
  });

  it("sends an event without a poster to its drawn cover", async () => {
    const res = await get("/media/events/quiet-evening/poster");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://myotherapp.in/media/events/quiet-evening/cover");
  });

  it("finds a speaker's photo and a club's logo", async () => {
    expect((await get("/media/events/hack-night-04/speakers/1/photo")).headers.get("location")).toContain("/a.jpg");
    expect((await get("/media/clubs/circuit-society/logo")).headers.get("location")).toContain("/l.png");
  });

  it("finds a club's cover (a club's cover is its picture, not an event's drawn one)", async () => {
    const res = await get("/media/clubs/circuit-society/cover?size=medium");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/c.jpg");
    // Never looked up as an event.
    expect(fetch.calls.map((c) => new URL(c.url).pathname)).toEqual(["/api/v1/discover/clubs/circuit-society"]);
  });

  it("is a 404 for nonsense, an unknown event, or an image the thing doesn't have", async () => {
    expect((await get("/media/events/hack-night-04/nonsense")).status).toBe(404);
    expect((await get("/media/users/1/photo")).status).toBe(404);
    expect((await get("/media/events/nobody/poster")).status).toBe(404);
    expect((await get("/media/events/hack-night-04/team/0/photo")).status).toBe(404);
  });

  it("says so (502, not kept) when the API can't be asked", async () => {
    const res = await get("/media/events/boom/poster");
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
