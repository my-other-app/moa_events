// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { outcome } from "@/test/next";
import { html } from "@/test/html";

/* /certificates/{ticket id}: a guest's certificate, as the club designed it. */
const params = (o) => Promise.resolve(o);
const route = () => import("../certificates/[ticketid]/page.jsx");

describe("/certificates/{ticket id}", () => {
  it("is never indexed or followed, and refers nowhere", async () => {
    const r = await route();
    expect(r.dynamic).toBe("force-dynamic");
    expect(r.metadata.robots).toEqual({ index: false, follow: false });
    expect(r.metadata.referrer).toBe("no-referrer");
    expect(r.metadata.alternates.canonical).toBeUndefined();
    const h = (await nextConfig.headers()).find((x) => x.source === "/certificates/:ticketid")?.headers || [];
    const value = (key) => h.find((x) => x.key === key)?.value;
    expect(value("Referrer-Policy")).toBe("no-referrer");
    expect(value("X-Frame-Options")).toBe("DENY");
    expect(value("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(value("Cache-Control")).toMatch(/no-store/);
  });

  it("shows the server's render of the club's design and its PDF, never a card of its own", async () => {
    const r = await route();
    const out = html(await r.default({ params: params({ ticketid: "MOA-7K3QF-X9PWM" }) }), "/certificates/MOA-7K3QF-X9PWM");
    expect(out).toContain('src="https://api.myotherapp.in/api/v1/events/certificates/MOA-7K3QF-X9PWM/image"');
    expect(out).toContain('href="https://api.myotherapp.in/api/v1/events/certificates/MOA-7K3QF-X9PWM/pdf"');
    expect(out).toContain('href="/verify"');
    // The old page drew a generic card from the template's flat fields, and said N/A for a missing name.
    for (const gone of ["Certificate of Participation", "This is to certify that", "N/A", "cert-preview", "Loading certificate"]) expect(out).not.toContain(gone);
  });

  it("answers an address that is no ticket with a real 404", async () => {
    const r = await route();
    expect(await outcome(() => r.default({ params: params({ ticketid: "../etc" }) }))).toEqual({ notFound: true });
  });
});
