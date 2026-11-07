// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { outcome } from "@/test/next";
import { html } from "@/test/html";

/*
 * /certificates/{id}: a guest's certificate, as the club designed it, by
 * the id in the link the API hands out (certificate_url). The site passes
 * that id on as it is: today a ticket's, soon the certificate's own.
 */
const params = (o) => Promise.resolve(o);
const route = () => import("../certificates/[id]/page.jsx");

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

  it("shows the server's render of the club's design and its PDF, never a card of its own", async () => {
    const r = await route();
    const out = html(await r.default({ params: params({ id: "MOA-7K3QF-X9PWM" }) }), "/certificates/MOA-7K3QF-X9PWM");
    expect(out).toContain('src="https://api.myotherapp.in/api/v1/events/certificates/MOA-7K3QF-X9PWM/image"');
    expect(out).toContain('href="https://api.myotherapp.in/api/v1/events/certificates/MOA-7K3QF-X9PWM/pdf"');
    expect(out).toContain('href="/verify"');
    // The old page drew a generic card from the template's flat fields, and said N/A for a missing name.
    for (const gone of ["Certificate of Participation", "This is to certify that", "N/A", "cert-preview", "Loading certificate"]) expect(out).not.toContain(gone);
  });

  it("hands an id of any other shape to the API as it is: no ticket format, nothing read from it", async () => {
    const r = await route();
    for (const id of ["q7Hb2_kLm9Zx-41PwT0aRe", "0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f", "a".repeat(128)]) {
      const out = html(await r.default({ params: params({ id }) }), `/certificates/${id}`);
      expect(out).toContain(`src="https://api.myotherapp.in/api/v1/events/certificates/${id}/image"`);
      expect(out).toContain(`href="https://api.myotherapp.in/api/v1/events/certificates/${id}/pdf"`);
      expect(out).not.toContain("CERT-");
    }
  });

  it("answers an address that is no link's id with a real 404", async () => {
    const r = await route();
    for (const id of ["../etc", "-x", "a b", "a".repeat(129)]) {
      expect(await outcome(() => r.default({ params: params({ id }) }))).toEqual({ notFound: true });
    }
  });
});
