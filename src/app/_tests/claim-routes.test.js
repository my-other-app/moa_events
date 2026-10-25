// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { outcome } from "@/test/next";
import { html } from "@/test/html";
import { RESERVED } from "@/seo/legacy";
import { DISALLOW } from "@/seo/robots";
import { APP_PATHS } from "@/seo/appLinks";

/*
 * /claim/{token}: a waiting list's offer (the API's docs/TICKETING.md §4).
 * The token is the offer's only credential, so the page is never indexed,
 * kept, framed or passed on in a Referer; the offer itself is read in the
 * browser.
 */
const params = (o) => Promise.resolve(o);
const route = () => import("../claim/[token]/page.jsx");
const TOKEN = "Xy3abcdefghijklmnopqrstuvwxyz012";

describe("/claim/{token}", () => {
  it("is never indexed, kept, framed, or named to another site", async () => {
    const r = await route();
    expect(r.dynamic).toBe("force-dynamic");
    expect(r.metadata.robots).toEqual({ index: false, follow: false });
    expect(r.metadata.referrer).toBe("strict-origin");
    expect(r.metadata.alternates.canonical).toBeUndefined();
    const h = (await nextConfig.headers()).find((x) => x.source === "/claim/:token")?.headers || [];
    const value = (key) => h.find((x) => x.key === key)?.value;
    expect(value("Referrer-Policy")).toBe("strict-origin");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(value("Cache-Control")).toMatch(/no-store/);
    expect(value("Vercel-CDN-Cache-Control")).toBe("no-store");
  });

  it("first paints the loading card: the offer is the browser's to read", async () => {
    const r = await route();
    const out = html(await r.default({ params: params({ token: TOKEN }) }), `/claim/${TOKEN}`);
    expect(out).toContain('aria-label="Loading your offer"');
    expect(out).not.toContain(TOKEN);
  });

  it("answers an address that is no claim link with a real 404", async () => {
    const r = await route();
    expect(await outcome(() => r.default({ params: params({ token: "short" }) }))).toEqual({ notFound: true });
    expect(await outcome(() => r.default({ params: params({ token: "../../etc/passwd/aaaaaaaaaaaa" }) }))).toEqual({ notFound: true });
  });

  it("is kept from crawlers and from old event addresses, and the apps open it", () => {
    expect(DISALLOW).toContain("/claim/");
    expect(RESERVED.has("claim")).toBe(true);
    expect(APP_PATHS).toContain("/claim/*");
  });
});
