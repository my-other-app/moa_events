// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { validateOrganization } from "@/seo/validate";

/*
 * / on the server: statically regenerated, the same for everyone, read for
 * nobody; near you is left to the browser (/api/near). The API is a fake.
 */
const S3 = "https://b.s3.amazonaws.com/p.png?Signature=x&Expires=1";
const card = (id, over = {}) => ({ id, slug: `event-${id}`, name: `Event ${id}`, poster: S3, starts_at: "2026-10-30T12:30:00Z", status: "upcoming", club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: S3 }, ...over });
const HOME = {
  where: { city: "Ashburn", lat: 39, lng: -77, source: "ip" },
  near: [card(9)],
  this_week: [card(1, { distance_km: 12000 })],
  online: [card(2, { is_online: true })],
  popular: [card(3)],
  clubs: [{ id: 3, name: "Circuit Society", slug: "circuit-society", logo: S3, cover: S3, followers: 40 }],
  categories: [{ id: 4, name: "Tech", upcoming: 12 }],
  threads: [{ id: "t1", club: { id: 3, name: "Circuit Society", slug: "circuit-society", logo: S3 }, body: "Kits are in!", image: S3, created_at: "2026-10-16T10:00:00Z" }],
  stats: { upcoming_events: 34, clubs: 9, cities: 3 },
};

let fetch;
beforeEach(() => {
  fetch = fakeFetch((url) => {
    if (url.pathname === "/api/v1/discover/home") return { body: HOME };
    if (url.pathname === "/api/v1/discover/clubs") return { body: { items: [{ id: 8, name: "Most Followed", slug: "most-followed", followers: 900, logo: S3 }], total: 1 } };
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/", () => {
  it("is regenerated at most once a minute, with its head, its feed and the site's structured data", async () => {
    const route = await import("../page.jsx");
    expect(route.revalidate).toBe(60);
    expect(route.metadata.alternates).toEqual({
      canonical: "https://myotherapp.in/",
      types: { "application/rss+xml": [{ url: "https://myotherapp.in/events/rss.xml", title: "Upcoming events on MyOtherApp" }] },
    });
    const out = html(await route.default());
    const [org, site] = jsonLdOf(out);
    expect(validateOrganization(org).errors).toEqual([]);
    expect(site["@type"]).toBe("WebSite");
  });

  it("is the same for everyone: what's on, the most followed clubs, the posts; never near you, distances or an expiring link", async () => {
    const route = await import("../page.jsx");
    const out = html(await route.default());
    for (const words of ["Find your people.", "This week", "Event 1", "Online events", "Popular", "Most Followed", "From the clubs", "Kits are in!", "Tech", "34"]) expect(out).toContain(words);
    expect(out).toContain('aria-label="Finding events near you"');
    expect(out).not.toContain("Event 9");
    expect(out).not.toContain("Ashburn");
    expect(out).not.toMatch(/km away/);
    expect(out).not.toMatch(/Signature=|Expires=/);
    expect(out).toContain("/media/events/event-1/poster");
    // Read once for nobody: no point, no visitor address (there is none for a static page).
    vi.stubEnv("API_SITE_TOKEN", "s3cret");
    fetch.calls.length = 0;
    await route.default();
    expect(new URL(fetch.calls[0].url).search).toBe("");
    expect(fetch.calls[0].init.headers).toEqual({ Accept: "application/json", "X-Site-Token": "s3cret" });
  });

  it("keeps the last good copy when the API fails (it throws), but is made without data while building", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 503, body: {} })));
    const route = await import("../page.jsx");
    await expect(route.default()).rejects.toMatchObject({ name: "ApiError", status: 503 });
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = html(await route.default());
    expect(out).toContain("It&#x27;s quiet out here");
  });
});
