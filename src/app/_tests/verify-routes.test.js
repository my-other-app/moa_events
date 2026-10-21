// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { fakeFetch, outcome } from "@/test/next";
import { html } from "@/test/html";
import { STATIC_PAGES, staticEntries } from "@/seo/sitemap";
import { RESERVED } from "@/seo/legacy";

/*
 * The public certificate check on the server: /verify (indexable, a plain
 * GET form) and /verify/{number} (one check, made now for this visitor,
 * never indexed, cached, framed or referred on).
 */
let requestHeaders;
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const NUMBER = "CERT-7K3QF-X9PWM";
const VALID = {
  valid: true, reason: "ok", number: NUMBER, attendee_name: "Ananya Iyer", event_name: "LAN Night",
  org_name: "Respawn Room", org_slug: "respawn-room", issued_at: "2026-09-12T13:00:00Z",
};
const REVOKED = { valid: false, reason: "revoked", number: NUMBER, attendee_name: null, event_name: "LAN Night", org_name: "Respawn Room", org_slug: null, issued_at: null };
const NOT_FOUND = { valid: false, reason: "not_found", number: null, attendee_name: null, event_name: null, org_name: null, org_slug: null, issued_at: null };

let answers;
let fetch;
beforeEach(() => {
  requestHeaders = new Headers({ "x-forwarded-for": "49.37.10.2, 76.76.21.21" });
  answers = {};
  fetch = fakeFetch((url) => {
    const m = /^\/api\/v1\/verify\/certificates\/([^/]+)$/.exec(url.pathname);
    return m ? answers[decodeURIComponent(m[1])] || { body: NOT_FOUND } : { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const params = (o) => Promise.resolve(o);
const landing = () => import("../verify/page.jsx");
const result = () => import("../verify/[code]/page.jsx");
const verifyCalls = () => fetch.calls.filter((c) => c.url.includes("/verify/certificates/"));

describe("/verify, the landing", () => {
  it("is indexable, with its own title and canonical", async () => {
    const route = await landing();
    const meta = await route.generateMetadata({ searchParams: params({}) });
    expect(meta.title).toEqual({ absolute: "Verify a MyOtherApp certificate" });
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/verify");
    expect(meta.robots).toBeUndefined();
    // An address with a code in it is never indexed.
    expect((await route.generateMetadata({ searchParams: params({ code: "x" }) })).robots).toEqual({ index: false, follow: true });
  });

  it("works without JavaScript: a plain GET form, how to read it, where the number is, and no name search", async () => {
    const route = await landing();
    const out = html(await route.default({ searchParams: params({}) }), "/verify");
    expect(out).toMatch(/<form[^>]*action="\/verify"[^>]*method="get"/);
    expect(out).toMatch(/<input[^>]*name="code"/);
    expect(out).toContain("Verify a MyOtherApp certificate");
    for (const words of ["How to read the result", "Where to find the number", "No search by name or email", "Only trust results shown on", "myotherapp.in/verify"]) {
      expect(out).toContain(words);
    }
    expect(fetch.calls).toHaveLength(0);
  });

  it("sends a code that is a number on to its own page, however it was written", async () => {
    const route = await landing();
    for (const code of ["cert-7k3qf-x9pwm", " CERT 7K3QF X9PWM ", "certificate:MOA-7K3QF-X9PWM", "https://myotherapp.in/verify/CERT-7K3QF-X9PWM"]) {
      expect(await outcome(() => route.default({ searchParams: params({ code }) }))).toEqual({ redirect: { url: `/verify/${NUMBER}`, status: 307 } });
    }
    expect(fetch.calls).toHaveLength(0);
  });

  it("keeps a code that is not a number here, says so, and looks nothing up", async () => {
    const route = await landing();
    for (const code of ["Ananya Iyer", "ananya@example.com", "CERT-7K3QO-X9PWM"]) {
      const out = html(await route.default({ searchParams: params({ code }) }), "/verify");
      expect(out).toContain("That isn&#x27;t a certificate number");
      expect(out).toContain('aria-invalid="true"');
    }
    expect(fetch.calls).toHaveLength(0);
  });
});

describe("/verify/{number}, a result", () => {
  it("is never indexed, has no canonical, and refers nowhere", async () => {
    const route = await result();
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.metadata.robots).toEqual({ index: false, follow: false });
    expect(route.metadata.referrer).toBe("no-referrer");
    expect(route.metadata.alternates.canonical).toBeUndefined();
    expect(JSON.stringify(route.metadata)).not.toMatch(/Ananya|CERT-/);
  });

  it("valid: genuine, big and green, with the facts, the picture and the file check", async () => {
    answers[NUMBER] = { body: VALID };
    const route = await result();
    const out = html(await route.default({ params: params({ code: NUMBER }) }), `/verify/${NUMBER}`);
    expect(out).toContain('data-state="valid"');
    expect(out).toContain("vf-tone--valid");
    expect(out).toContain("This certificate is genuine");
    for (const fact of ["Ananya Iyer", "LAN Night", "Respawn Room", "12 Sept 2026", NUMBER]) expect(out).toContain(fact);
    expect(out).toContain('href="/clubs/respawn-room"');
    expect(out).toContain(`src="https://api.myotherapp.in/api/v1/verify/certificates/${NUMBER}/image"`);
    expect(out).toMatch(/<img[^>]*referrerPolicy="no-referrer"|<img[^>]*referrerpolicy="no-referrer"/);
    expect(out).toContain("Check a file");
    expect(out).toContain("Verified just now from myotherapp.in");
    expect(out).toMatch(/\d{4}, \d{1,2}:\d{2}:\d{2}\s?[ap]m IST/i);
    expect(out).toContain("Check another");
  });

  it("asks the API once, past every cache, for this visitor", async () => {
    vi.stubEnv("API_SITE_TOKEN", "s".repeat(64));
    answers[NUMBER] = { body: VALID };
    const route = await result();
    await route.default({ params: params({ code: NUMBER }) });
    const [call] = verifyCalls();
    expect(verifyCalls()).toHaveLength(1);
    expect(call.url).toBe(`https://api.myotherapp.in/api/v1/verify/certificates/${NUMBER}`);
    expect(call.init.cache).toBe("no-store");
    expect(call.init.next).toBeUndefined();
    expect(call.init.headers["X-Site-Token"]).toBe("s".repeat(64));
    expect(call.init.headers["X-Visitor-IP"]).toBe("49.37.10.2");
  });

  it("revoked: amber, which event and club, not whose, and no picture", async () => {
    answers[NUMBER] = { body: REVOKED };
    const route = await result();
    const out = html(await route.default({ params: params({ code: NUMBER }) }), `/verify/${NUMBER}`);
    expect(out).toContain('data-state="revoked"');
    expect(out).toContain("vf-tone--revoked");
    expect(out).toContain("Issued, then revoked by the club");
    expect(out).toContain("LAN Night");
    expect(out).not.toContain("Awarded to");
    expect(out).not.toContain("/image");
    expect(out).not.toContain("Check a file");
    expect(out).toContain("Verified just now from myotherapp.in");
  });

  it("not found: red, the number checked, and a hint to look for typos", async () => {
    const route = await result();
    const out = html(await route.default({ params: params({ code: NUMBER }) }), `/verify/${NUMBER}`);
    expect(out).toContain('data-state="not_found"');
    expect(out).toContain("vf-tone--notfound");
    expect(out).toContain("No certificate has this number");
    expect(out).toContain("Check it for typos");
    expect(out).toContain(NUMBER);
    expect(out).not.toContain("/image");
  });

  it("too many checks: a friendly 429, nothing claimed as verified", async () => {
    answers[NUMBER] = { status: 429, body: { message: "Too many certificate checks from here." } };
    const route = await result();
    const out = html(await route.default({ params: params({ code: NUMBER }) }), `/verify/${NUMBER}`);
    expect(out).toContain('data-state="limited"');
    expect(out).toContain("Too many checks from here");
    expect(out).toContain("Wait a minute");
    expect(out).not.toContain("Verified just now");
  });

  it("an API that fails says to try again, never genuine or not found", async () => {
    answers[NUMBER] = { status: 502, body: {} };
    const route = await result();
    const out = html(await route.default({ params: params({ code: NUMBER }) }), `/verify/${NUMBER}`);
    expect(out).toContain('data-state="unavailable"');
    expect(out).not.toMatch(/genuine|No certificate has this number|Verified just now/);
  });

  it("sends any other way of writing a number to the number's own address", async () => {
    const route = await result();
    for (const code of ["cert-7k3qf-x9pwm", "MOA-7K3QF-X9PWM", "certificate:MOA-7K3QF-X9PWM", "certificate%3AMOA-7K3QF-X9PWM"]) {
      expect(await outcome(() => route.default({ params: params({ code }) }))).toEqual({ redirect: { url: `/verify/${NUMBER}`, status: 307 } });
    }
    expect(fetch.calls).toHaveLength(0);
  });

  it("answers an address that holds no number without asking anyone", async () => {
    const route = await result();
    for (const code of ["Ananya%20Iyer", "ananya@example.com", "%E0%A4%A", "CERT-7K3QF"]) {
      const out = html(await route.default({ params: params({ code }) }), `/verify/${code}`);
      expect(out).toContain('data-state="invalid"');
      expect(out).toContain("That isn&#x27;t a certificate number");
      expect(out).not.toContain("Ananya");
    }
    expect(fetch.calls).toHaveLength(0);
  });
});

describe("the check's headers and where it is listed", () => {
  const find = async (source) => (await nextConfig.headers()).find((h) => h.source === source)?.headers || [];
  const value = (list, key) => list.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

  it("/verify: never framed, refers nowhere", async () => {
    const h = await find("/verify");
    expect(value(h, "X-Frame-Options")).toBe("DENY");
    expect(value(h, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(value(h, "Referrer-Policy")).toBe("no-referrer");
    // The landing is meant to be found.
    expect(value(h, "X-Robots-Tag")).toBeUndefined();
    expect(value(h, "Cache-Control")).toBeUndefined();
  });

  it("/verify/{number}: also never stored, at the edge or in the browser, nor indexed", async () => {
    const h = await find("/verify/:code");
    expect(value(h, "X-Frame-Options")).toBe("DENY");
    expect(value(h, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(value(h, "Referrer-Policy")).toBe("no-referrer");
    expect(value(h, "Cache-Control")).toMatch(/no-store/);
    expect(value(h, "Vercel-CDN-Cache-Control")).toBe("no-store");
    expect(value(h, "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("the landing is in the pages sitemap; a result never is", () => {
    expect(STATIC_PAGES.map(([p]) => p)).toContain("/verify");
    const locs = staticEntries().map((e) => e.loc);
    expect(locs).toContain("https://myotherapp.in/verify");
    expect(locs.filter((l) => l.includes("/verify/"))).toEqual([]);
    // Never taken for an old event address.
    expect(RESERVED.has("verify")).toBe(true);
  });

  it("the footer and About link to it", async () => {
    const { SiteFooter } = await import("@/components/discover/footer");
    const { createElement } = await import("react");
    expect(html(createElement(SiteFooter))).toMatch(/href="\/verify"[^>]*>Verify a certificate/);
    const about = await import("../about/page.jsx");
    expect(html(await about.default(), "/about")).toContain('href="/verify"');
  });
});
