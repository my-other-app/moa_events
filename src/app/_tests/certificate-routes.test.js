// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { fakeFetch, outcome } from "@/test/next";
import { html } from "@/test/html";

/*
 * /certificates/{public id}: a certificate's page, by the id in the link
 * the API hands out (certificate_url). What it says is the public check's,
 * asked on the server for this visitor; the picture and the PDF are the
 * API's by the same id. /certificates/{ticket id}, an older address, opens
 * nothing here: the holder's browser is sent on (OldCertificateAddress).
 */
let requestHeaders;
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const PUBLIC_ID = "q7Hb2_kLm9Zx-41PwT0aReXy";
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
const route = () => import("../certificates/[id]/page.jsx");
/** The page's own part, without the site's header and footer. */
const mainOf = (out) => /<main[\s\S]*<\/main>/.exec(out)?.[0] ?? "";
const render = async (id) => mainOf(html(await (await route()).default({ params: params({ id }) }), `/certificates/${id}`));

describe("/certificates/{id}", () => {
  it("is never indexed, kept, framed or followed, and refers nowhere", async () => {
    const r = await route();
    expect(r.dynamic).toBe("force-dynamic");
    expect(r.metadata.robots).toEqual({ index: false, follow: false });
    expect(r.metadata.referrer).toBe("no-referrer");
    expect(r.metadata.alternates.canonical).toBeUndefined();
    const h = (await nextConfig.headers()).find((x) => x.source === "/certificates/:id")?.headers || [];
    const value = (key) => h.find((x) => x.key === key)?.value;
    expect(value("Referrer-Policy")).toBe("no-referrer");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(value("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(value("Cache-Control")).toMatch(/no-store/);
  });

  it("by its public id: the check's facts, the club's design and its PDF, by that id exactly as it is", async () => {
    answers[PUBLIC_ID] = { body: VALID };
    const out = await render(PUBLIC_ID);
    for (const fact of ["LAN Night", "Ananya Iyer", "Respawn Room", "12 Sept 2026", NUMBER]) expect(out).toContain(fact);
    expect(out).toContain(`src="https://api.myotherapp.in/api/v1/events/certificates/${PUBLIC_ID}/image"`);
    expect(out).toContain(`href="https://api.myotherapp.in/api/v1/events/certificates/${PUBLIC_ID}/pdf"`);
    expect(out).toContain(`href="/verify/${NUMBER}"`);
    // The old page drew a generic card from the template's flat fields, and said N/A for a missing name.
    for (const gone of ["Certificate of Participation", "This is to certify that", "N/A", "cert-preview", "Loading certificate"]) expect(out).not.toContain(gone);
  });

  it("asks the public check once, past every cache, for this visitor, by the public id as it is", async () => {
    vi.stubEnv("API_SITE_TOKEN", "s".repeat(64));
    answers[PUBLIC_ID] = { body: VALID };
    await render(PUBLIC_ID);
    expect(fetch.calls).toHaveLength(1);
    const [call] = fetch.calls;
    expect(call.url).toBe(`https://api.myotherapp.in/api/v1/verify/certificates/${PUBLIC_ID}`);
    expect(call.init.cache).toBe("no-store");
    expect(call.init.headers["X-Visitor-IP"]).toBe("49.37.10.2");
  });

  it("revoked: says so, with no picture and no PDF", async () => {
    answers[PUBLIC_ID] = { body: REVOKED };
    const out = await render(PUBLIC_ID);
    expect(out).toContain("This certificate was revoked");
    expect(out).toContain("LAN Night");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("/events/certificates/");
    expect(out).not.toContain("Download PDF");
  });

  it("not found: it can't be shown, and nothing is asked for by the id", async () => {
    const out = await render(PUBLIC_ID);
    expect(out).toContain("This certificate can’t be shown");
    expect(out).not.toContain("<img");
    expect(out).not.toContain("/events/certificates/");
  });

  it.each([
    ["an API that fails", { status: 502, body: {} }],
    ["too many checks", { status: 429, body: {} }],
  ])("%s: couldn't load, try again, nothing claimed", async (_, answer) => {
    answers[PUBLIC_ID] = answer;
    const out = await render(PUBLIC_ID);
    expect(out).toContain("load this certificate");
    expect(out).toContain(`href="/certificates/${PUBLIC_ID}"`);
    expect(out).not.toMatch(/revoked|can.t be shown|Download PDF|<img/);
  });

  it("an older address, by ticket id: asks the API nothing and shows no picture, PDF or number", async () => {
    for (const id of ["MOA-7K3QF-X9PWM", "MOA5OLD99", "q7Hb2_kLm9Zx-41PwT0aRe"]) {
      const r = await route();
      const { value } = await outcome(() => r.default({ params: params({ id }) }));
      const page = value.props.children;
      expect(page.type.name).toBe("OldCertificateAddress");
      expect(page.props).toEqual({ ticketId: id });
      const out = mainOf(html(value, `/certificates/${id}`));
      expect(out).not.toContain("/events/certificates/");
      expect(out).not.toContain("<img");
      expect(out).not.toContain("CERT-");
    }
    expect(fetch.calls).toEqual([]);
  });

  it("answers an address that is neither with a real 404", async () => {
    const r = await route();
    for (const id of ["../etc", "-x", "a b", "a".repeat(65), `${PUBLIC_ID}.`]) {
      expect(await outcome(() => r.default({ params: params({ id }) }))).toEqual({ notFound: true });
    }
    expect(fetch.calls).toEqual([]);
  });

  it("takes a public id that starts with - or _", async () => {
    const id = "-q7Hb2kLm9Zx-41PwT0aRe_y";
    answers[id] = { body: VALID };
    const out = await render(id);
    expect(out).toContain(`src="https://api.myotherapp.in/api/v1/events/certificates/${id}/image"`);
  });
});
