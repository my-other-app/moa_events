// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { outcome } from "@/test/next";
import { html } from "@/test/html";
import { RESERVED } from "@/seo/legacy";
import { DISALLOW } from "@/seo/robots";
import { APP_PATHS } from "@/seo/appLinks";

/*
 * /requests/{token}: where a registration stands, for an event that reviews
 * registrations (registration approval). The token is the registration's
 * only credential (it can cancel it), so the page is never indexed, kept,
 * framed or passed on in a Referer; the registration itself is read in the
 * browser.
 */
const params = (o) => Promise.resolve(o);
const route = () => import("../requests/[token]/page.jsx");
const TOKEN = "Rq7abcdefghijklmnopqrstuvwxyz012";

describe("/requests/{token}", () => {
  it("is never indexed, kept, framed, or named to another site", async () => {
    const r = await route();
    expect(r.dynamic).toBe("force-dynamic");
    expect(r.metadata.robots).toEqual({ index: false, follow: false });
    expect(r.metadata.referrer).toBe("strict-origin");
    expect(r.metadata.alternates.canonical).toBeUndefined();
    const h = (await nextConfig.headers()).find((x) => x.source === "/requests/:token")?.headers || [];
    const value = (key) => h.find((x) => x.key === key)?.value;
    expect(value("Referrer-Policy")).toBe("strict-origin");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(value("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(value("Cache-Control")).toMatch(/no-store/);
    expect(value("Vercel-CDN-Cache-Control")).toBe("no-store");
  });

  it("is titled as the person's registration", async () => {
    const r = await route();
    expect(String(r.metadata.title?.absolute ?? r.metadata.title)).toMatch(/^Your registration/);
    expect(r.metadata.description).toBe("Where your registration for an event stands.");
  });

  it("first paints the loading card: the registration is the browser's to read", async () => {
    const r = await route();
    const out = html(await r.default({ params: params({ token: TOKEN }) }), `/requests/${TOKEN}`);
    expect(out).toContain('aria-label="Loading your registration"');
    expect(out).not.toContain(TOKEN);
  });

  it("?withdraw=1 (the email's cancel link) asks the page to open on the cancel question; nothing else does", async () => {
    const r = await route();
    const asks = async (searchParams) => (await r.default({ params: params({ token: TOKEN }), searchParams })).props.askToCancel;
    expect(await asks(params({ withdraw: "1" }))).toBe(true);
    expect(await asks(params({ withdraw: ["1", "0"] }))).toBe(true);
    expect(await asks(params({ withdraw: "0" }))).toBe(false);
    expect(await asks(params({ withdraw: "yes" }))).toBe(false);
    expect(await asks(params({}))).toBe(false);
    expect(await asks(undefined)).toBe(false);
  });

  it("answers an address that is no request link with a real 404", async () => {
    const r = await route();
    expect(await outcome(() => r.default({ params: params({ token: "short" }) }))).toEqual({ notFound: true });
    expect(await outcome(() => r.default({ params: params({ token: "../../etc/passwd/aaaaaaaaaaaa" }) }))).toEqual({ notFound: true });
  });

  it("is kept from crawlers and from old event addresses, and the apps open it", () => {
    expect(DISALLOW).toContain("/requests/");
    expect(RESERVED.has("requests")).toBe(true);
    expect(APP_PATHS).toContain("/requests/*");
  });
});
