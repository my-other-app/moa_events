// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { fakeFetch, outcome } from "@/test/next";
import { html } from "@/test/html";
import { PRIVATE_PROFILE, PUBLIC_PROFILE } from "@/test/profileFixture";
import { RESERVED, isLegacyRef } from "@/seo/legacy";
import { parseSitemapName, staticEntries } from "@/seo/sitemap";

/*
 * /u/{handle} and /p/{code} on the server (feature-register/profiles-networking-contract.md):
 * the profile read as nobody (no token, so the HTML is the same for everyone
 * and kept a minute), Open Graph with their name, headline and picture,
 * noindex unless indexable, the private state, the sections hidden from
 * strangers, the 404; a QR's code looked up fresh and sent on with the save
 * intent, with pages of its own for a replaced code and scanning off.
 */
const params = (o) => Promise.resolve(o);
const textOf = (out) => out.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

let fetched;
const load = async (table, file = "../u/[handle]/page.jsx") => {
  vi.resetModules();
  fetched = fakeFetch(table);
  vi.stubGlobal("fetch", fetched);
  return import(file);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/u/{handle}", { timeout: 30000 }, () => {
  it("is regenerated every minute, with their name, headline and picture in Open Graph and the Twitter card", async () => {
    const route = await load({ "/api/v1/profiles/asha": { body: PUBLIC_PROFILE() } });
    expect(route.revalidate).toBe(60);
    const meta = await route.generateMetadata({ params: params({ handle: "asha" }) });
    expect(meta.title).toBe("Asha Rao, Compiler engineer");
    expect(meta.description).toBe("Builds compilers. Teaches on weekends.");
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/u/asha");
    expect(meta.openGraph).toMatchObject({ type: "profile", locale: "en_IN", url: "https://myotherapp.in/u/asha", title: "Asha Rao, Compiler engineer · MyOtherApp" });
    expect(meta.openGraph.images[0]).toEqual({ url: "https://myotherapp.in/media/profiles/asha/picture?size=medium", alt: "Asha Rao" });
    expect(meta.twitter).toMatchObject({ card: "summary", title: "Asha Rao, Compiler engineer · MyOtherApp", images: ["https://myotherapp.in/media/profiles/asha/picture?size=medium"] });
  });

  it("says noindex unless the owner made the profile findable, and always for a private one", async () => {
    let route = await load({ "/api/v1/profiles/asha": { body: PUBLIC_PROFILE() } });
    expect((await route.generateMetadata({ params: params({ handle: "asha" }) })).robots).toEqual({ index: false });
    route = await load({ "/api/v1/profiles/asha": { body: PUBLIC_PROFILE({ indexable: true }) } });
    expect((await route.generateMetadata({ params: params({ handle: "asha" }) })).robots).toBeUndefined();
    route = await load({ "/api/v1/profiles/asha": { body: PRIVATE_PROFILE({ indexable: true }) } });
    expect((await route.generateMetadata({ params: params({ handle: "asha" }) })).robots).toEqual({ index: false });
  });

  it("falls back to the site's picture, and a line about them, without a picture or a bio", async () => {
    const route = await load({ "/api/v1/profiles/asha": { body: PUBLIC_PROFILE({ picture: null, bio: null }) } });
    const meta = await route.generateMetadata({ params: params({ handle: "asha" }) });
    expect(meta.openGraph.images[0].url).toBe("https://myotherapp.in/og-default.png");
    expect(meta.twitter.card).toBe("summary_large_image");
    expect(meta.description).toBe("Asha Rao: Compiler engineer · Zoho · Kochi. On MyOtherApp.");
  });

  it("reads the profile as nobody: no token goes, whoever asked", async () => {
    const route = await load({ "/api/v1/profiles/asha": { body: PUBLIC_PROFILE() } });
    await route.default({ params: params({ handle: "asha" }) });
    expect(fetched.calls.length).toBeGreaterThan(0);
    for (const c of fetched.calls) {
      expect(new URL(c.url).pathname).toBe("/api/v1/profiles/asha");
      expect(Object.keys(c.init?.headers || {}).map((k) => k.toLowerCase())).not.toContain("authorization");
      expect(c.init?.next?.revalidate).toBe(60);
      expect(c.init?.next?.tags).toEqual(["profile:asha"]);
    }
  });

  it("renders the whole profile as everyone sees it, every picture on a stable address", async () => {
    const route = await load({ "/api/v1/profiles/asha": { body: PUBLIC_PROFILE() } });
    const out = html(await route.default({ params: params({ handle: "asha" }) }), "/u/asha");
    const text = textOf(out);
    for (const words of [
      "Asha Rao",
      "@asha",
      "Compiler engineer",
      "Zoho",
      "Kochi",
      "About Asha",
      "Builds compilers.",
      "Links",
      "GitHub",
      "My site",
      "Projects",
      "Tiny C",
      "Author · Mar 2026",
      "A C compiler in 2,000 lines.",
      "compilers",
      "Went to 12 events",
      "Writing a tiny compiler",
      "Hack Night 04",
      "DevFest 25",
      "Interests",
      "Open source",
      "Save to your network",
      "Save contact",
    ]) {
      expect(text).toContain(words);
    }
    expect(out).toContain('href="/events/hack-night-04"');
    expect(out).toContain('href="https://api.myotherapp.in/api/v1/profiles/asha/vcard"');
    // No presigned link in a kept page.
    expect(out).not.toMatch(/X-Amz-|s3\.amazonaws\.com/);
    expect(out).toContain("/media/profiles/asha/picture?size=medium");
    expect(out).toContain("/media/profiles/asha/projects/11/image");
    // Nothing hidden from strangers is announced as hidden.
    expect(text).not.toContain("only with people they know");
    expect(text).not.toContain("This profile is private");
  });

  it("renders what people wrote as text, and only their http(s) links, as nofollow ugc", async () => {
    const route = await load({
      "/api/v1/profiles/asha": {
        body: PUBLIC_PROFILE({
          headline: '<img src=x onerror="alert(1)">',
          bio: "<script>alert(1)</script> and <b>bold</b>",
          links: [
            { type: "github", url: "https://github.com/asha", label: '"><script>x</script>' },
            { type: "other", url: "javascript:alert(1)", label: "Click me" },
            { type: "other", url: "data:text/html,<script>alert(1)</script>", label: "Data" },
            { type: "website", url: "https://user:secret@evil.example/", label: "Creds" },
            { type: "website", url: "//evil.example", label: "No scheme" },
          ],
          projects: [{ id: 12, title: "<i>T</i>", url: "javascript:alert(2)", tags: [] }],
        }),
      },
    });
    const out = html(await route.default({ params: params({ handle: "asha" }) }), "/u/asha");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<b>bold</b>");
    expect(out).not.toContain("<img src=x");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toMatch(/javascript:|data:text|secret@|Click me|Creds|No scheme/);
    // The profile's own links (the site's header and footer aside).
    const article = out.slice(out.indexOf("<article"), out.indexOf("</article>"));
    const anchors = [...article.matchAll(/<a [^>]*href="(https?:\/\/(?!api\.myotherapp\.in|myotherapp\.in)[^"]+)"[^>]*>/g)];
    expect(anchors.map((m) => m[1])).toEqual(["https://github.com/asha"]);
    expect(anchors[0][0]).toContain('rel="nofollow noopener noreferrer ugc"');
    expect(anchors[0][0]).toContain('target="_blank"');
  });

  it("leaves out the sections the owner keeps from strangers, and says so in one line", async () => {
    const route = await load({
      "/api/v1/profiles/asha": {
        body: PUBLIC_PROFILE({ links: [], projects: [], interests: [], org: null, hidden_sections: ["links", "projects", "interests", "org"] }),
      },
    });
    const out = html(await route.default({ params: params({ handle: "asha" }) }), "/u/asha");
    const text = textOf(out);
    expect(text).not.toMatch(/\bLinks\b|\bProjects\b|\bInterests\b|Zoho|Tiny C/);
    expect(out).not.toContain('id="links"');
    expect(out).not.toContain('id="projects"');
    expect(text).toContain("Asha shares their links, projects, interests and organisation only with people they know.");
    // What strangers may see is still there.
    expect(text).toContain("Builds compilers.");
    expect(text).toContain("Went to 12 events");
  });

  it("shows a private profile's header and says it is private, whatever else came with it", async () => {
    const route = await load({ "/api/v1/profiles/asha": { body: PRIVATE_PROFILE({ bio: "Secret bio", links: [{ type: "github", url: "https://github.com/asha" }] }) } });
    const out = html(await route.default({ params: params({ handle: "asha" }) }), "/u/asha");
    const text = textOf(out);
    expect(text).toContain("Asha Rao");
    expect(text).toContain("Compiler engineer");
    expect(text).toContain("This profile is private");
    expect(text).toContain("Only people Asha has saved to their network can see the rest of it.");
    expect(text).not.toContain("Secret bio");
    expect(out).not.toContain("github.com/asha");
    // Saving them is still offered; their contact card isn't.
    expect(text).toContain("Save to your network");
    expect(text).not.toContain("Save contact");
  });

  it("is the not-found page for an unknown, hidden or blocked profile (404), and never asks for nonsense", async () => {
    let route = await load({});
    expect(await outcome(() => route.default({ params: params({ handle: "nobody" }) }))).toEqual({ notFound: true });
    expect((await route.generateMetadata({ params: params({ handle: "nobody" }) })).robots).toEqual({ index: false, follow: true });
    route = await load({});
    for (const handle of ["..", ".asha", "a/b", "x".repeat(65), "%3Cscript%3E"]) {
      expect(await outcome(() => route.default({ params: params({ handle }) }))).toEqual({ notFound: true });
    }
    expect(fetched.calls).toEqual([]);
    const nf = await import("../u/[handle]/not-found.jsx");
    expect(html(nf.default())).toContain("We couldn&#x27;t find that profile");
    expect(nf.metadata.robots).toEqual({ index: false, follow: true });
  });

  it("has one address per person: a handle in capitals 308s to its own", async () => {
    const route = await load({ "/api/v1/profiles/asha": { body: PUBLIC_PROFILE() } });
    expect(await outcome(() => route.default({ params: params({ handle: "Asha" }) }))).toEqual({ redirect: { url: "/u/asha", status: 308 } });
  });

  it("keeps an API that can't answer from being a 404 (the kept copy stays)", async () => {
    const route = await load({ "/api/v1/profiles/asha": { status: 503, body: {} } });
    await expect(route.default({ params: params({ handle: "asha" }) })).rejects.toMatchObject({ name: "ApiError", status: 503 });
  });
});

describe("/p/{code}", { timeout: 30000 }, () => {
  const P = "../p/[code]/page.jsx";

  it("looks the code up fresh, then sends it on to the profile with the save intent (307)", async () => {
    const route = await load({ "/api/v1/profiles/by-code/k7mx3qp9wz": { body: { handle: "asha", profile: PUBLIC_PROFILE() } } }, P);
    expect(route.dynamic).toBe("force-dynamic");
    expect(await outcome(() => route.default({ params: params({ code: "k7mx3qp9wz" }) }))).toEqual({ redirect: { url: "/u/asha?save=1", status: 307 } });
    expect(fetched.calls).toHaveLength(1);
    expect(fetched.calls[0].init.cache).toBe("no-store");
    expect(Object.keys(fetched.calls[0].init.headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    // A code typed in capitals is the same code.
    expect(await outcome(() => route.default({ params: params({ code: "K7MX3QP9WZ" }) }))).toEqual({ redirect: { url: "/u/asha?save=1", status: 307 } });
  });

  it("says a replaced code was replaced (410 PROFILE_CODE_INACTIVE)", async () => {
    const route = await load({ "/api/v1/profiles/by-code/k7mx3qp9wz": { status: 410, body: { error_code: "PROFILE_CODE_INACTIVE", message: "Replaced" } } }, P);
    const res = await outcome(() => route.default({ params: params({ code: "k7mx3qp9wz" }) }));
    const text = textOf(html(res.value));
    expect(text).toContain("This QR code was replaced");
    expect(text).toContain("Ask them to show you the new one.");
  });

  it("says saving by QR is off (403 PROFILE_SCANNING_OFF)", async () => {
    const route = await load({ "/api/v1/profiles/by-code/k7mx3qp9wz": { status: 403, body: { error_code: "PROFILE_SCANNING_OFF" } } }, P);
    const res = await outcome(() => route.default({ params: params({ code: "k7mx3qp9wz" }) }));
    expect(textOf(html(res.value))).toContain("Saving by QR is off");
  });

  it("is the 404 page for an unknown code, and never asks for nonsense", async () => {
    const route = await load({}, P);
    expect(await outcome(() => route.default({ params: params({ code: "k7mx3qp9wz" }) }))).toEqual({ notFound: true });
    const calls = fetched.calls.length;
    for (const code of ["ab", "../../x", "k7mx-3qp9", "x".repeat(17)]) {
      expect(await outcome(() => route.default({ params: params({ code }) }))).toEqual({ notFound: true });
    }
    expect(fetched.calls).toHaveLength(calls);
    const nf = await import("../p/[code]/not-found.jsx");
    expect(html(nf.default())).toContain("We couldn&#x27;t find that profile");
  });

  it("treats any other refusal as the API's trouble, not as scanning off", async () => {
    const route = await load({ "/api/v1/profiles/by-code/k7mx3qp9wz": { status: 403, body: { detail: "Forbidden" } } }, P);
    await expect(route.default({ params: params({ code: "k7mx3qp9wz" }) })).rejects.toMatchObject({ name: "ApiError", status: 403 });
  });

  it("is never indexed, kept or framed", async () => {
    const route = await import(P);
    expect(route.metadata.robots).toEqual({ index: false, follow: false });
    const h = (await nextConfig.headers()).find((x) => x.source === "/p/:code")?.headers || [];
    expect(Object.fromEntries(h.map((x) => [x.key, x.value]))).toMatchObject({
      "Cache-Control": "no-store, max-age=0",
      "Vercel-CDN-Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Frame-Options": "DENY",
    });
  });
});

describe("profiles and the rest of the site", () => {
  it("are words of the site's own, never an old event address", () => {
    expect(RESERVED.has("u")).toBe(true);
    expect(RESERVED.has("p")).toBe(true);
    expect(isLegacyRef("u")).toBe(false);
    expect(isLegacyRef("P")).toBe(false);
  });

  it("stay out of the sitemaps", () => {
    expect(parseSitemapName("profiles.xml")).toBeNull();
    const locs = staticEntries().map((e) => e.loc);
    expect(locs.length).toBeGreaterThan(0);
    expect(locs.some((loc) => /\/(u|p)(\/|$)/.test(new URL(loc).pathname))).toBe(false);
  });

  it("have stable picture addresses that look the current link up, as nobody sees the profile", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      fakeFetch({
        "/api/v1/profiles/asha": {
          body: PUBLIC_PROFILE({
            picture: { thumbnail: "https://cdn.example/t.jpg", medium: "https://cdn.example/m.jpg" },
            projects: [{ id: 11, title: "Tiny C", image: { medium: "https://cdn.example/p11.jpg" }, tags: [] }],
          }),
        },
      }),
    );
    const media = await import("../media/[...path]/route.jsx");
    const req = (p) => Object.assign(new Request(`https://myotherapp.in${p}`), { nextUrl: new URL(`https://myotherapp.in${p}`) });
    let res = await media.GET(req("/media/profiles/asha/picture?size=thumbnail"), { params: params({ path: ["profiles", "asha", "picture"] }) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://cdn.example/t.jpg");
    res = await media.GET(req("/media/profiles/asha/picture"), { params: params({ path: ["profiles", "asha", "picture"] }) });
    expect(res.headers.get("location")).toBe("https://cdn.example/m.jpg");
    res = await media.GET(req("/media/profiles/asha/projects/11/image"), { params: params({ path: ["profiles", "asha", "projects", "11", "image"] }) });
    expect(res.headers.get("location")).toBe("https://cdn.example/p11.jpg");
    // A project strangers don't see has no picture here.
    res = await media.GET(req("/media/profiles/asha/projects/99/image"), { params: params({ path: ["profiles", "asha", "projects", "99", "image"] }) });
    expect(res.status).toBe(404);
    res = await media.GET(req("/media/profiles/../picture"), { params: params({ path: ["profiles", "..", "picture"] }) });
    expect(res.status).toBe(404);
  });
});
