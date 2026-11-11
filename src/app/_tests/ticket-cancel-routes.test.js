// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { appleAppSiteAssociation } from "@/seo/appLinks";
import { RESERVED } from "@/seo/legacy";

/*
 * /tickets/cancel?t=…: a page of its own under /tickets (never a ticket's
 * id), never indexed, kept, framed or referred on, left to the browser by
 * the iPhone app; the token is checked before anything is asked.
 */
const search = (o) => Promise.resolve(o);

describe("/tickets/cancel", () => {
  it("is never indexed, and sends no Referer", async () => {
    const r = await import("../tickets/cancel/page.jsx");
    expect(r.dynamic).toBe("force-dynamic");
    expect(r.metadata.robots).toEqual({ index: false, follow: false });
    expect(r.metadata.referrer).toBe("no-referrer");
    expect(r.metadata.alternates.canonical).toBeUndefined();
  });

  it("hands the page a well-formed token, and nothing else", async () => {
    const r = await import("../tickets/cancel/page.jsx");
    expect((await r.default({ searchParams: search({ t: "eyJyIjoxMjN9.c2lnbmF0dXJlLXZhbHVl" }) })).props).toEqual({ token: "eyJyIjoxMjN9.c2lnbmF0dXJlLXZhbHVl" });
    expect((await r.default({ searchParams: search({ t: "<script>" }) })).props).toEqual({ token: null });
    expect((await r.default({ searchParams: search({}) })).props).toEqual({ token: null });
  });

  it("gets the private-link headers (the ticket's own rule covers it)", async () => {
    const rules = await nextConfig.headers();
    const rule = rules.find((x) => new RegExp(`^${x.source.replace(/:\w+/g, "[^/]+")}$`).test("/tickets/cancel"));
    const h = Object.fromEntries(rule.headers.map((x) => [x.key, x.value]));
    expect(h).toMatchObject({ "Referrer-Policy": "no-referrer", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY" });
  });

  it("is left to the browser by the iPhone app, which opens /tickets/{id}", () => {
    const components = appleAppSiteAssociation().applinks.details[0].components;
    const cancel = components.findIndex((c) => c["/"] === "/tickets/cancel" && c.exclude);
    const tickets = components.findIndex((c) => c["/"] === "/tickets/*" && !c.exclude);
    expect(cancel).toBeGreaterThanOrEqual(0);
    expect(cancel).toBeLessThan(tickets);
    expect(RESERVED.has("tickets")).toBe(true);
  });
});
