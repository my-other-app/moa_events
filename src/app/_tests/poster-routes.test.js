// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { outcome } from "@/test/next";
import { html } from "@/test/html";
import { RESERVED } from "@/seo/legacy";
import { DISALLOW } from "@/seo/robots";
import { APP_PATHS, BROWSER_PATHS } from "@/seo/appLinks";
import { STATIC_PAGES, staticEntries } from "@/seo/sitemap";

/*
 * /posters/{ticket}?s=: a guest's "I'm attending" poster
 * (feature-register/posters/CONTRACT.md §6). The address holds the ticket's
 * id (what the door scans) and, from the email, the link's key: never
 * indexed, kept, framed or passed on in a Referer. The email's
 * /tickets/{ticket}/poster?s= (§12) redirects to it, query kept. No app
 * claims either: the app has no poster screen yet.
 */
const params = (o) => Promise.resolve(o);
const route = () => import("../posters/[ticketid]/page.jsx");
const T = "MOA-7K3QF-X9PWM";
const S = "3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7";

const render = async (p, searchParams = params({})) => (await route()).default({ params: params(p), searchParams });

const headersOf = async (source) => {
  const h = (await nextConfig.headers()).find((x) => x.source === source)?.headers || [];
  return (key) => h.find((x) => x.key === key)?.value;
};

describe("/posters/{ticket}", () => {
  it("is never indexed, kept, framed, or named to another site", async () => {
    const r = await route();
    expect(r.dynamic).toBe("force-dynamic");
    expect(r.metadata.robots).toMatchObject({ index: false });
    expect(r.metadata.referrer).toBe("no-referrer");
    expect(r.metadata.alternates?.canonical).toBeUndefined();
    for (const source of ["/posters/:ticketid", "/tickets/:ticketid/poster"]) {
      const value = await headersOf(source);
      expect(value("Referrer-Policy")).toBe("no-referrer");
      expect(value("X-Frame-Options")).toBe("DENY");
      expect(value("Content-Security-Policy")).toBe("frame-ancestors 'none'");
      expect(value("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(value("Cache-Control")).toMatch(/no-store/);
      expect(value("Vercel-CDN-Cache-Control")).toBe("no-store");
    }
  });

  it("hands the ticket over, with the email link's key when there is one", async () => {
    expect((await render({ ticketid: T }, params({ s: S }))).props).toEqual({ ticketid: T, s: S });
    expect((await render({ ticketid: T })).props).toEqual({ ticketid: T, s: "" });
    expect((await (await route()).default({ params: params({ ticketid: "12345" }) })).props).toEqual({ ticketid: "12345", s: "" });
    expect((await render({ ticketid: T }, params({ s: [S, "other-key-aaaaaaaaaaaa"] }))).props.s).toBe(S);
  });

  it.each([
    ["a path", "../../etc/passwd"],
    ["characters no ticket has", "MOA<script>"],
    ["far too long", "M".repeat(65)],
  ])("answers a ticket %s with a real 404", async (_, ticketid) => {
    expect(await outcome(() => render({ ticketid }))).toEqual({ notFound: true });
  });

  it.each([
    ["too short", "abc123"],
    ["with characters no key has", `${S}<script>`],
    ["far too long", "a".repeat(129)],
  ])("answers a key %s with a real 404", async (_, s) => {
    expect(await outcome(() => render({ ticketid: T }, params({ s })))).toEqual({ notFound: true });
  });

  it("first paints the loading card, with neither the ticket's code nor the key in it", async () => {
    const out = html(await render({ ticketid: T }, params({ s: S })), `/posters/${T}?s=${S}`);
    expect(out).toContain('aria-label="Loading your poster"');
    expect(out).not.toContain(T);
    expect(out).not.toContain(S);
  });

  describe("the older email address, /tickets/{ticket}/poster", () => {
    const redirect = async (path, method = "GET") => {
      const r = await import("../tickets/[ticketid]/poster/route.js");
      const url = new URL(path, "https://myotherapp.in");
      const ticketid = decodeURIComponent(url.pathname.split("/")[2]);
      return r[method](new Request(url, { method }), { params: Promise.resolve({ ticketid }) });
    };
    const privateHeaders = (res) => {
      expect(res.headers.get("cache-control")).toBe("no-store, max-age=0");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    };

    it("goes on to the poster page with the key, never kept or named to another site", async () => {
      const res = await redirect(`/tickets/${T}/poster?s=${S}&utm_source=email`);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(`/posters/${T}?s=${S}`);
      privateHeaders(res);
      expect((await redirect(`/tickets/${T}/poster`, "HEAD")).headers.get("location")).toBe(`/posters/${T}`);
    });

    it.each([
      ["a key that isn't one", `/tickets/${T}/poster?s=abc`],
      ["a ticket that isn't one", `/tickets/MOA%3Cx%3E/poster?s=${S}`],
    ])("is a 404 for %s", async (_, path) => {
      const res = await redirect(path);
      expect(res.status).toBe(404);
      expect(res.headers.get("location")).toBeNull();
      privateHeaders(res);
    });
  });

  it("is kept from crawlers, sitemaps and old event addresses; the apps leave it to the browser", () => {
    expect(DISALLOW).toContain("/posters/");
    expect(RESERVED.has("posters")).toBe(true);
    expect(APP_PATHS.some((p) => p.startsWith("/posters"))).toBe(false);
    expect(BROWSER_PATHS.map(([p]) => p)).toContain("/tickets/*/poster");
    expect(STATIC_PAGES.some(([path]) => path.startsWith("/posters"))).toBe(false);
    expect(staticEntries().some((e) => e.loc.includes("/posters"))).toBe(false);
  });
});
