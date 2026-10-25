// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config.mjs";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

const { revalidatePath, revalidateTag } = await import("next/cache");
const { POST } = await import("../api/revalidate/route.js");

/*
 * What keeps the site fast and fresh: the find pages kept a minute at
 * Vercel's edge (next.config.mjs headers), and /api/revalidate, for the API
 * to say an event or a club changed the moment it does.
 */

/* ---------- the edge ---------- */

describe("the find pages at the edge", () => {
  const EDGE = "max-age=60, stale-while-revalidate=300";
  const compile = (source) => new RegExp(`^${source.replace(/:(\w+)/g, "([^/]+)")}$`);
  /** The headers Next adds to a path, by next.config's headers(). */
  const headersFor = async (path) =>
    (await nextConfig.headers()).filter((rule) => compile(rule.source).test(path)).flatMap((rule) => rule.headers);
  const edgeOf = async (path) => (await headersFor(path)).find((h) => h.key === "Vercel-CDN-Cache-Control")?.value ?? null;

  it.each(["/events", "/clubs", "/topics/development", "/topics/arts"])("keeps %s a minute at the edge, then serves it stale for five while it refreshes", async (path) => {
    expect(await edgeOf(path)).toBe(EDGE);
  });

  it("sets it for Vercel's edge alone, never as the browser's Cache-Control", async () => {
    for (const path of ["/events", "/clubs", "/topics/development"]) {
      expect((await headersFor(path)).map((h) => h.key)).toEqual(["Vercel-CDN-Cache-Control"]);
    }
  });

  it.each(["/", "/events/hack-night-04", "/events/hack-night-04/register", "/clubs/circuit-society", "/topics", "/me/tickets", "/tickets/MOA77", "/events/in/pune"])("leaves %s to its own caching", async (path) => {
    expect(await edgeOf(path)).toBeNull();
  });

  it("never keeps a certificate check's result at the edge", async () => {
    expect(await edgeOf("/verify/CERT-AB12CD34")).toBe("no-store");
    expect(await edgeOf("/certificates/MOA77")).toBe("no-store");
  });
});

/* ---------- /api/revalidate ---------- */

describe("/api/revalidate", () => {
  const ask = (body, { secret = "s3cret", raw = false } = {}) =>
    POST(
      new Request("https://myotherapp.in/api/revalidate", {
        method: "POST",
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
        body: raw ? body : JSON.stringify(body),
      })
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("REVALIDATE_SECRET", "s3cret");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off (a 404) without its secret set, and touches nothing", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "");
    const res = await ask({ events: ["hack-night-04"] });
    expect(res.status).toBe(404);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a caller without the secret, or with another", async () => {
    expect((await ask({ events: ["hack-night-04"] }, { secret: null })).status).toBe(401);
    expect((await ask({ events: ["hack-night-04"] }, { secret: "guess" })).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("asks for JSON", async () => {
    const res = await ask("events=hack-night-04", { raw: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Send JSON" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("reads each event named afresh: its data, its page and the lists it is on", async () => {
    const res = await ask({ events: ["hack-night-04", 123] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revalidated: { events: ["hack-night-04", "123"], clubs: [], sitemap: false } });
    expect(revalidateTag.mock.calls).toEqual([
      ["event:hack-night-04", "max"],
      ["event:123", "max"],
      ["lists", "max"],
    ]);
    expect(revalidatePath.mock.calls).toEqual([["/events/hack-night-04"], ["/events/123"]]);
  });

  it("reads each club named afresh: its data, its page and the lists", async () => {
    const res = await ask({ clubs: ["circuit-society"], sitemap: true });
    expect(await res.json()).toEqual({ revalidated: { events: [], clubs: ["circuit-society"], sitemap: true } });
    expect(revalidateTag.mock.calls).toEqual([
      ["club:circuit-society", "max"],
      ["lists", "max"],
      ["sitemap", "max"],
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/clubs/circuit-society");
  });

  it("drops anything that isn't an event or club reference, and takes at most 200", async () => {
    const many = Array.from({ length: 250 }, (_, i) => `event-${i}`);
    const res = await ask({ events: ["../../etc/passwd", "has space", "", "-leading-dash", "x".repeat(129), ...many], clubs: "circuit-society" });
    const { revalidated } = await res.json();
    expect(revalidated.events).toEqual(many.slice(0, 200));
    // A club list that isn't a list names nobody.
    expect(revalidated.clubs).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledTimes(200);
    expect(revalidatePath).not.toHaveBeenCalledWith(expect.stringContaining(".."));
  });

  it("touches no list when nothing was named", async () => {
    const res = await ask({});
    expect(await res.json()).toEqual({ revalidated: { events: [], clubs: [], sitemap: false } });
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
