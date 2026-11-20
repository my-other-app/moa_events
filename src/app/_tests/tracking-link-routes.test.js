// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RESERVED } from "@/seo/legacy";
import { DISALLOW } from "@/seo/robots";
import { APP_PATHS } from "@/seo/appLinks";
import { LINK_CODE, trackingTarget } from "@/utils/trackinglink";

/*
 * /l/{code}: a tracking link on the site's own domain, what a guest's
 * "I'm attending" poster prints. A 307 to the API's own /l/{code}, the query
 * kept (the API counts the click and sends the visitor on to the event's
 * page with `?ref=`), never kept by a browser or an edge; anything that isn't
 * a code is a 404, so it can only ever send people to the API's /l/ path.
 */
const route = () => import("../l/[code]/route.js");
const call = async (path, method = "GET") => {
  const r = await route();
  const url = new URL(path, "https://myotherapp.in");
  const code = decodeURIComponent(url.pathname.split("/")[2] ?? "");
  return r[method](new Request(url, { method }), { params: Promise.resolve({ code }) });
};

describe("/l/{code}", () => {
  it("sends the visitor on to the API's tracking link at once, and is never kept", async () => {
    const res = await call("/l/x7k2m9pq");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://api.myotherapp.in/l/x7k2m9pq");
    expect(res.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(res.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(res.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await route()).dynamic).toBe("force-dynamic");
  });

  it("keeps the query", async () => {
    const res = await call("/l/x7k2m9pq?utm_source=instagram&utm_content=story");
    expect(res.headers.get("location")).toBe("https://api.myotherapp.in/l/x7k2m9pq?utm_source=instagram&utm_content=story");
  });

  it("answers HEAD the same (a link preview checking it)", async () => {
    const res = await call("/l/X7K2M9PQ", "HEAD");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://api.myotherapp.in/l/X7K2M9PQ");
  });

  it.each([
    ["too short", "/l/abc"],
    ["too long", `/l/${"a".repeat(33)}`],
    ["with a dot", "/l/x7k2.m9pq"],
    ["with a dash", "/l/x7k2-m9pq"],
    ["a path climbing out", "/l/..%2F..%2Fevil"],
    ["an encoded address", "/l/https%3A%2F%2Fevil.example"],
    ["an encoded slash", "/l/x7k2%2Fm9pq"],
    ["a space", "/l/x7k2%20m9pq"],
    ["nothing", "/l/%20"],
  ])("is a 404, never kept, for %s", async (_, path) => {
    const res = await call(path);
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store, max-age=0");
  });

  it("only ever points at the API's /l/ path", () => {
    expect(trackingTarget("x7k2m9pq", "?a=1", "https://api.example")).toBe("https://api.example/l/x7k2m9pq?a=1");
    expect(trackingTarget("x7k2m9pq", "")).toBe("https://api.myotherapp.in/l/x7k2m9pq");
    expect(trackingTarget("x7k2m9pq", "?")).toBe("https://api.myotherapp.in/l/x7k2m9pq");
    for (const bad of ["//evil.example", "x7k2m9pq/../../x", "", null, undefined, 12345678]) expect(trackingTarget(bad)).toBeNull();
    expect(LINK_CODE.test("bcdfghjk")).toBe(true);
  });

  it("is the site's own word: no old event address, no crawler, no app", () => {
    expect(RESERVED.has("l")).toBe(true);
    expect(DISALLOW).toContain("/l/");
    expect(APP_PATHS.some((p) => p.startsWith("/l"))).toBe(false);
  });
});
