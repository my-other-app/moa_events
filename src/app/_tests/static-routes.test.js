// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFetch } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";
import { plansResponse } from "@/test/plansFixture";
import { validateSoftwareApplication } from "@/seo/validate";
import { LEGAL } from "@/content/legal";

/* /about, /privacy, /terms, /pricing and /for-clubs on the server: all their words in the HTML. */
let fetch;
beforeEach(() => {
  fetch = fakeFetch((url) => {
    if (url.pathname === "/api/v1/plans") return { body: plansResponse() };
    if (url.pathname === "/api/v1/discover/home") return { body: { where: { source: "none" }, stats: { upcoming_events: 128, clubs: 42, cities: 3 }, clubs: [] } };
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the static pages", () => {
  it("/about: its words and the live numbers, with its own title and canonical", async () => {
    const route = await import("../about/page.jsx");
    expect(route.metadata.title).toEqual({ absolute: "About MyOtherApp" });
    expect(route.metadata.alternates.canonical).toBe("https://myotherapp.in/about");
    expect(route.metadata.robots).toBeUndefined();
    const out = html(await route.default(), "/about");
    expect(out).toContain("Where student clubs run their events");
    expect(out).toContain("128");
    expect(out).toContain("On MyOtherApp right now");
  });

  it("/privacy and /terms: the whole text, static, each its own canonical", async () => {
    for (const [file, doc] of [
      ["../privacy/page.jsx", LEGAL.privacy],
      ["../terms/page.jsx", LEGAL.terms],
    ]) {
      const route = await import(file);
      expect(route.revalidate).toBeUndefined();
      expect(route.metadata.title).toBe(doc.title);
      expect(route.metadata.alternates.canonical).toBe(`https://myotherapp.in${doc.path}`);
      const out = html(route.default(), doc.path);
      for (const s of doc.sections) expect(out).toContain(`id="${s.id}"`);
    }
    expect(fetch.calls).toHaveLength(0);
  });

  it("/pricing: every card and the whole comparison, and the plans as a SoftwareApplication", async () => {
    const route = await import("../pricing/page.jsx");
    expect(route.revalidate).toBe(300);
    expect(route.metadata.alternates.canonical).toBe("https://myotherapp.in/pricing");
    const out = html(await route.default(), "/pricing");
    for (const words of ["Plans for", "Growth", "Most popular", "₹699", 'id="compare"', "Events a month"]) expect(out).toContain(words);
    const [ld] = jsonLdOf(out);
    expect(validateSoftwareApplication(ld)).toEqual({ errors: [], warnings: [] });
    expect(ld).toMatchObject({ url: "https://myotherapp.in/pricing" });
    expect(ld.offers).toHaveLength(9);
  });

  it("/for-clubs: what clubs get, the plans, the numbers, and the plans' structured data", async () => {
    const route = await import("../for-clubs/page.jsx");
    expect(route.metadata.alternates.canonical).toBe("https://myotherapp.in/for-clubs");
    const out = html(await route.default(), "/for-clubs");
    for (const words of ["from one place.", "Fill the room", "Most popular", "Paid plans from ₹299 a month", "on MyOtherApp right now"]) expect(out).toContain(words);
    const [ld] = jsonLdOf(out);
    expect(validateSoftwareApplication(ld).errors).toEqual([]);
    expect(ld.offers.find((o) => o.name === "Growth, yearly")).toMatchObject({ price: 6990, priceCurrency: "INR" });
  });

  it("keep the last good copy when the API fails, but are made without it while building", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => ({ status: 503, body: {} })));
    const pricing = await import("../pricing/page.jsx");
    await expect(pricing.default()).rejects.toMatchObject({ name: "ApiError" });
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = html(await pricing.default(), "/pricing");
    expect(out).toContain("Pricing is loading…");
    expect(jsonLdOf(out)).toEqual([]);
    const about = await import("../about/page.jsx");
    expect(html(await about.default(), "/about")).toContain("dc-about-live--mark");
  });
});
