// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { outcome } from "@/test/next";
import { html } from "@/test/html";
import { RESERVED } from "@/seo/legacy";
import { DISALLOW } from "@/seo/robots";
import { APP_PATHS } from "@/seo/appLinks";
import { STATIC_PAGES, staticEntries } from "@/seo/sitemap";

/*
 * /answers/{eventId}/{ref}?k=: the details a club asks one person for after
 * they signed up (feature-register/missing-answers-contract.md §2.2). `ref`
 * names the person (a registration's UUID, or "q" and a request's) and `k`
 * is the link's key, so the page is never indexed, kept, framed or passed on
 * in a Referer; the questions are read and answered in the browser.
 */
const params = (o) => Promise.resolve(o);
const route = () => import("../answers/[eventId]/[ref]/page.jsx");
const REG = "0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f";
const REQ = `q${REG}`;
const K = "3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7";

const render = async (p, searchParams = params({ k: K })) => (await route()).default({ params: params(p), searchParams });

describe("/answers/{eventId}/{ref}", () => {
  it("is never indexed, kept, framed, or named to another site", async () => {
    const r = await route();
    expect(r.dynamic).toBe("force-dynamic");
    expect(r.metadata.robots).toEqual({ index: false, follow: false });
    expect(r.metadata.referrer).toBe("no-referrer");
    expect(r.metadata.alternates.canonical).toBeUndefined();
    const h = (await nextConfig.headers()).find((x) => x.source === "/answers/:eventId/:ref")?.headers || [];
    const value = (key) => h.find((x) => x.key === key)?.value;
    expect(value("Referrer-Policy")).toBe("no-referrer");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(value("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(value("Cache-Control")).toMatch(/no-store/);
    expect(value("Vercel-CDN-Cache-Control")).toBe("no-store");
  });

  it("is titled as the person's details", async () => {
    const r = await route();
    expect(String(r.metadata.title?.absolute ?? r.metadata.title)).toMatch(/^Add your details/);
  });

  it.each([
    ["a registration", { eventId: "68", ref: REG }],
    ["a registration request (q + its id)", { eventId: "68", ref: REQ }],
    ["an id in capitals", { eventId: "68", ref: REG.toUpperCase() }],
  ])("hands %s over, with the link's key", async (_, p) => {
    const el = await render(p);
    expect(el.props).toEqual({ eventId: "68", answerRef: p.ref, k: K });
  });

  it("opens without a key too (the holder's own sign-in), and takes the first of a repeated one", async () => {
    expect((await render({ eventId: "68", ref: REG }, params({}))).props.k).toBe("");
    expect((await (await route()).default({ params: params({ eventId: "68", ref: REG }) })).props.k).toBe("");
    expect((await render({ eventId: "68", ref: REG }, params({ k: [K, "other-key-aaaaaaaaaaaa"] }))).props.k).toBe(K);
  });

  it.each([
    ["an event that isn't a number", { eventId: "hack-night", ref: REG }],
    ["an event id far too long", { eventId: "1234567890123", ref: REG }],
    ["a ticket number for a ref", { eventId: "68", ref: "MOA-7K3QF-X9PWM" }],
    ["a request token for a ref", { eventId: "68", ref: "Rq7abcdefghijklmnopqrstuvwxyz012" }],
    ["another letter before the id", { eventId: "68", ref: `r${REG}` }],
    ["an id cut short", { eventId: "68", ref: REG.slice(0, -1) }],
    ["an id with more after it", { eventId: "68", ref: `${REG}0` }],
    ["a path", { eventId: "68", ref: "../../etc/passwd" }],
  ])("answers %s with a real 404", async (_, p) => {
    expect(await outcome(() => render(p))).toEqual({ notFound: true });
  });

  it.each([
    ["too short", "abc123"],
    ["with characters no key has", "3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7<script>"],
    ["far too long", "a".repeat(129)],
  ])("answers a key %s with a real 404", async (_, k) => {
    expect(await outcome(() => render({ eventId: "68", ref: REG }, params({ k })))).toEqual({ notFound: true });
  });

  it("first paints the loading card, with neither the person nor the key in it", async () => {
    const out = html(await render({ eventId: "68", ref: REG }), `/answers/68/${REG}?k=${K}`);
    expect(out).toContain('aria-label="Loading your details"');
    expect(out).not.toContain(REG);
    expect(out).not.toContain(K);
  });

  it("is kept from crawlers, sitemaps and old event addresses, and the apps open it", () => {
    expect(DISALLOW).toContain("/answers/");
    expect(RESERVED.has("answers")).toBe(true);
    expect(APP_PATHS).toContain("/answers/*");
    expect(STATIC_PAGES.some(([path]) => path.startsWith("/answers"))).toBe(false);
    expect(staticEntries().some((e) => e.loc.includes("/answers"))).toBe(false);
  });
});
