// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch, outcome } from "@/test/next";

const club = {
  club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: "https://s3.example/l.png?Expires=1", tagline: "We build things that blink", followers: 40 },
  upcoming: [{ id: 68, slug: "hack-night-04", name: "Hack Night 04", starts_at: "2026-10-30T12:30:00Z", status: "upcoming" }],
  past: [],
};
let fetch;

beforeEach(() => {
  fetch = fakeFetch((url) => {
    const slug = url.pathname.replace("/api/v1/discover/clubs/", "");
    if (slug === "circuit-society" || slug === "circuit-old") return { body: club };
    if (slug === "boom") return { status: 500, body: {} };
    return { status: 404, body: { detail: "Not found" } };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => vi.unstubAllGlobals());

const params = (o) => Promise.resolve(o);

describe("/clubs/{slug}", () => {
  it("renders the club from one cached read, with its head", async () => {
    const route = await import("../clubs/[slug]/page.jsx");
    expect(route.revalidate).toBe(60);
    expect(route.generateStaticParams()).toEqual([]);
    const meta = await route.generateMetadata({ params: params({ slug: "circuit-society" }) });
    expect(meta.title).toBe("Circuit Society");
    expect(meta.alternates.types["application/rss+xml"][0].url).toBe("https://myotherapp.in/clubs/circuit-society/rss.xml");
    const result = await outcome(() => route.default({ params: params({ slug: "circuit-society" }) }));
    expect(result.value).toBeTruthy();
    expect(fetch.calls[0].init.next).toEqual({ revalidate: 60, tags: ["club:circuit-society"] });
  });

  it("moves an old address to the club's own (308), and answers a real 404 for no club", async () => {
    const route = await import("../clubs/[slug]/page.jsx");
    expect(await outcome(() => route.default({ params: params({ slug: "circuit-old" }) }))).toEqual({ redirect: { url: "/clubs/circuit-society", status: 308 } });
    expect(await outcome(() => route.default({ params: params({ slug: "nobody" }) }))).toEqual({ notFound: true });
  });

  it("lets an API failure reach the error page", async () => {
    const route = await import("../clubs/[slug]/page.jsx");
    await expect(route.default({ params: params({ slug: "boom" }) })).rejects.toMatchObject({ name: "ApiError", status: 500 });
  });
});
