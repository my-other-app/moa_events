// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { fakeFetch, outcome } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { SPEAKER } from "@/test/speakerFixture";
import { RESERVED } from "@/seo/legacy";
import { appleAppSiteAssociation } from "@/seo/appLinks";
import { validateBreadcrumbs, validateProfilePage } from "@/seo/validate";
import { maskText } from "@/sentry/options";

/*
 * /speakers/{slug} on the server: the whole profile and its talks in the
 * HTML, no presigned link anywhere in it, ProfilePage + BreadcrumbList, en-IN
 * head and canonical; a merged profile 308s to the one it went into; hidden,
 * unknown, or an API without speakers (404) is the not-found page. The claim
 * link and the edit page are never indexed; the claim link is a credential.
 * Their sitemap, and the photo's stable address.
 */
const params = (o) => Promise.resolve(o);

const load = async (table) => {
  vi.resetModules();
  vi.stubGlobal("fetch", fakeFetch(table));
  return import("../speakers/[slug]/page.jsx");
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/speakers/{slug}", { timeout: 30000 }, () => {
  it("is regenerated every minute, with the speaker's head, canonical and en-IN", async () => {
    const route = await load({ "/api/v1/speakers/asha-rao": { body: SPEAKER() } });
    expect(route.revalidate).toBe(60);
    const meta = await route.generateMetadata({ params: params({ slug: "asha-rao" }) });
    expect(meta.title).toBe("Asha Rao, Engineer · Zoho");
    expect(meta.description).toBe("Builds compilers. Teaches on weekends.");
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/speakers/asha-rao");
    expect(meta.openGraph).toMatchObject({ type: "profile", locale: "en_IN", url: "https://myotherapp.in/speakers/asha-rao" });
    expect(meta.openGraph.images[0].url).toBe("https://myotherapp.in/media/speakers/asha-rao/photo?size=medium");
    expect(meta.twitter.card).toBe("summary");
    expect(meta.robots).toBeUndefined();
  });

  it("renders the profile and its talks, every image on a stable address", async () => {
    const route = await load({ "/api/v1/speakers/asha-rao": { body: SPEAKER() } });
    const out = html(await route.default({ params: params({ slug: "asha-rao" }) }), "/speakers/asha-rao");
    const text = out.replace(/<!-- -->/g, "");
    for (const words of ["Asha Rao", "Engineer · Zoho", "Kochi", "Builds compilers.", "Upcoming talks", "Hack Night 04", "Writing a tiny compiler", "by Circuit Society", "Past talks", "DevFest 25", "41 followers"]) {
      expect(text.replace(/<[^>]+>/g, "")).toContain(words);
    }
    expect(out).toContain('href="/events/hack-night-04"');
    expect(out).toContain('href="/topics/development"');
    expect(out).toContain('href="https://linkedin.com/in/asha"');
    expect(out).not.toContain("javascript:");
    // No presigned link in a cached page.
    expect(out).not.toMatch(/X-Amz-|s3\.amazonaws\.com/);
    expect(out).toContain("/media/speakers/asha-rao/photo?size=medium");
    expect(out).toContain("/media/events/hack-night-04/poster?size=medium");
  });

  it("describes them as a ProfilePage with a Person, and a breadcrumb trail", async () => {
    const route = await load({ "/api/v1/speakers/asha-rao": { body: SPEAKER() } });
    const [profile, crumbs] = jsonLdOf(html(await route.default({ params: params({ slug: "asha-rao" }) })));
    expect(validateProfilePage(profile)).toEqual({ errors: [], warnings: [] });
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(profile.mainEntity).toMatchObject({
      "@type": "Person",
      name: "Asha Rao",
      jobTitle: "Engineer · Zoho",
      url: "https://myotherapp.in/speakers/asha-rao",
      image: "https://myotherapp.in/media/speakers/asha-rao/photo?size=medium",
      sameAs: ["https://asha.dev/", "https://linkedin.com/in/asha"],
      knowsAbout: ["Development"],
      homeLocation: { name: "Kochi", address: { addressCountry: "IN" } },
    });
    expect(profile.mainEntity.performerIn.map((e) => e.url)).toEqual(["https://myotherapp.in/events/hack-night-04", "https://myotherapp.in/events/devfest-25"]);
    expect(profile.inLanguage).toBe("en-IN");
  });

  it("sends a merged profile on to the one it went into, and an old spelling to its own address (308)", async () => {
    let route = await load({ "/api/v1/speakers/asha-r": { body: { redirect_slug: "asha-rao" } } });
    expect(await outcome(() => route.default({ params: params({ slug: "asha-r" }) }))).toEqual({ redirect: { url: "/speakers/asha-rao", status: 308 } });
    route = await load({ "/api/v1/speakers/Asha-Rao": { body: SPEAKER() } });
    expect(await outcome(() => route.default({ params: params({ slug: "Asha-Rao" }) }))).toEqual({ redirect: { url: "/speakers/asha-rao", status: 308 } });
  });

  it("is the not-found page for a hidden or unknown profile, and while the API has no speakers (404)", async () => {
    const route = await load({});
    expect(await outcome(() => route.default({ params: params({ slug: "nobody" }) }))).toEqual({ notFound: true });
    expect((await route.generateMetadata({ params: params({ slug: "nobody" }) })).robots).toEqual({ index: false, follow: true });
    const nf = await import("../speakers/[slug]/not-found.jsx");
    expect(html(nf.default())).toContain("We couldn&#x27;t find that speaker");
  });

  it("says noindex when every talk is a demo club's", async () => {
    const demo = SPEAKER({
      talks: { upcoming: [{ ...SPEAKER().talks.upcoming[0], club: { id: 9, name: "Neural Tide", slug: "neural-tide" } }], past: [] },
    });
    const route = await load({ "/api/v1/speakers/asha-rao": { body: demo } });
    expect((await route.generateMetadata({ params: params({ slug: "asha-rao" }) })).robots).toEqual({ index: false, follow: true });
  });

  it("is a word of the site's own, never an old event address", () => {
    expect(RESERVED.has("speakers")).toBe(true);
  });
});

describe("an event's speakers", () => {
  it("name their own page in the event's structured data", async () => {
    const { parseEventPage } = await import("@/api/discover");
    const { eventStructuredData } = await import("@/seo/structured");
    const { fullEvent } = await import("@/test/eventFixture");
    const page = parseEventPage(fullEvent({ speakers: [{ id: 1, name: "Asha Rao", profile_slug: "asha-rao", talk_title: "Compilers" }, { id: 2, name: "Ravi K" }] }));
    expect(page.speakers.map((s) => [s.profile_slug ?? null, s.talk_title ?? null])).toEqual([
      ["asha-rao", "Compilers"],
      [null, null],
    ]);
    const [event] = eventStructuredData(page);
    expect(event.performer.map((p) => p.url ?? null)).toEqual(["https://myotherapp.in/speakers/asha-rao", null]);
  });
});

describe("claiming and editing a profile", () => {
  it("the claim link checks its token, is never indexed, kept, framed or referred on, and is masked", async () => {
    const r = await import("../speakers/claim/[token]/page.jsx");
    expect(r.metadata.robots).toEqual({ index: false, follow: false });
    expect(r.metadata.referrer).toBe("strict-origin");
    expect(await outcome(() => r.default({ params: params({ token: "x" }) }))).toEqual({ notFound: true });
    expect((await outcome(() => r.default({ params: params({ token: "Sp3abcdefghijklmnopqrstuv" }) }))).value).toBeTruthy();
    const h = (await nextConfig.headers()).find((x) => x.source === "/speakers/claim/:token")?.headers || [];
    expect(Object.fromEntries(h.map((x) => [x.key, x.value]))).toMatchObject({ "Referrer-Policy": "strict-origin", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" });
    expect(maskText("https://myotherapp.in/speakers/claim/Sp3abcdefghijklmnopqrstuv")).toBe("https://myotherapp.in/speakers/claim/[code]");
    expect(maskText("POST https://api.myotherapp.in/api/v1/speakers/claim/Sp3abcdefghijklmnopqrstuv")).toBe("POST https://api.myotherapp.in/api/v1/speakers/claim/[code]");
  });

  it("the edit page is never indexed", async () => {
    const r = await import("../speakers/me/page.jsx");
    expect(r.metadata.robots).toEqual({ index: false, follow: false });
  });

  it("the apps leave claiming and editing to the browser", () => {
    const components = appleAppSiteAssociation().applinks.details[0].components;
    expect(components).toContainEqual(expect.objectContaining({ "/": "/speakers/claim/*", exclude: true }));
    expect(components).toContainEqual(expect.objectContaining({ "/": "/speakers/me", exclude: true }));
    expect(components.some((c) => c["/"] === "/speakers/*" && !c.exclude)).toBe(false);
  });
});

describe("the speakers' sitemap and photos", { timeout: 30000 }, () => {
  it("lists speakers' pages, and the index names it, once the API has some", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      fakeFetch((u) => {
        if (u.pathname === "/api/v1/speakers/sitemap") return { body: { speakers: [{ slug: "asha-rao", updated_at: "2026-11-10T09:00:00Z" }, { slug: "../bad" }] } };
        if (u.pathname === "/api/v1/discover/sitemap/index") return { status: 404, body: {} };
        if (u.pathname === "/api/v1/discover/sitemap") return { body: { events: [], clubs: [] } };
        return { status: 404, body: {} };
      }),
    );
    const one = await import("../sitemaps/[name]/route.js");
    const res = await one.GET(new Request("https://myotherapp.in/sitemaps/speakers.xml"), { params: params({ name: "speakers.xml" }) });
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("<loc>https://myotherapp.in/speakers/asha-rao</loc>");
    expect(xml).not.toContain("bad");
    const index = await import("../sitemap.xml/route.js");
    expect(await (await index.GET()).text()).toContain("<loc>https://myotherapp.in/sitemaps/speakers.xml</loc>");
  });

  it("is a 404, and left out of the index, while the API has none", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", fakeFetch((u) => (u.pathname === "/api/v1/discover/sitemap" ? { body: { events: [], clubs: [] } } : { status: 404, body: {} })));
    const one = await import("../sitemaps/[name]/route.js");
    expect((await one.GET(new Request("https://myotherapp.in/sitemaps/speakers.xml"), { params: params({ name: "speakers.xml" }) })).status).toBe(404);
    const index = await import("../sitemap.xml/route.js");
    expect(await (await index.GET()).text()).not.toContain("speakers.xml");
  });

  it("redirects the photo's stable address to the current link", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", fakeFetch({ "/api/v1/speakers/asha-rao": { body: SPEAKER({ photo: { thumbnail: "https://cdn.example/t.jpg", medium: "https://cdn.example/m.jpg" } }) } }));
    const media = await import("../media/[...path]/route.jsx");
    const req = (q) => Object.assign(new Request(`https://myotherapp.in/media/speakers/asha-rao/photo${q}`), { nextUrl: new URL(`https://myotherapp.in/media/speakers/asha-rao/photo${q}`) });
    const res = await media.GET(req("?size=thumbnail"), { params: params({ path: ["speakers", "asha-rao", "photo"] }) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://cdn.example/t.jpg");
    const big = await media.GET(req(""), { params: params({ path: ["speakers", "asha-rao", "photo"] }) });
    expect(big.headers.get("location")).toBe("https://cdn.example/m.jpg");
  });
});
