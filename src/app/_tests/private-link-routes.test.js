// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig, { CLAIM_HEADERS, PRIVATE_LINK_HEADERS } from "../../../next.config.mjs";

/*
 * The addresses that are themselves a credential: a ticket (its id is the
 * door's QR), a guest's certificate, the survey link, a missing-answers
 * link, a check's result, a claim and a request link. Each is never framed by another site, never
 * kept or indexed, and never names its path to another site in a Referer.
 * The claim and request pages tell other sites the origin alone (their
 * payment needs it); the rest tell them nothing.
 */
const compile = (source) => new RegExp(`^${source.replace(/:(\w+)/g, "([^/]+)")}$`);
const headersFor = async (path) => (await nextConfig.headers()).filter((rule) => compile(rule.source).test(path)).flatMap((rule) => rule.headers);
const valueOf = (headers, key) => {
  const found = headers.filter((h) => h.key === key);
  // One rule per address: two would leave the browser to pick.
  expect(found.length).toBeLessThanOrEqual(1);
  return found[0]?.value ?? null;
};

describe("addresses that are a credential", () => {
  it.each([
    ["/tickets/MOA-7K3QF-X9PWM", "no-referrer"],
    ["/certificates/MOA-7K3QF-X9PWM", "no-referrer"],
    ["/certificates/q7Hb2_kLm9Zx-41PwT0aRe", "no-referrer"],
    ["/feedback/68/0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f", "no-referrer"],
    ["/answers/68/0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f", "no-referrer"],
    ["/answers/68/q0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f", "no-referrer"],
    ["/verify/CERT-7K3QF-X9PWM", "no-referrer"],
    ["/claim/Xy3abcdefghijklmnopqrstuvwxyz012", "strict-origin"],
    ["/requests/Rq7abcdefghijklmnopqrstuvwxyz012", "strict-origin"],
  ])("%s is never framed, kept, indexed or referred on (Referrer-Policy: %s)", async (path, referrer) => {
    const h = await headersFor(path);
    expect(valueOf(h, "Referrer-Policy")).toBe(referrer);
    expect(valueOf(h, "X-Frame-Options")).toBe("DENY");
    expect(valueOf(h, "Content-Security-Policy")).toBe("frame-ancestors 'none'");
    expect(valueOf(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(valueOf(h, "Cache-Control")).toBe("no-store, max-age=0");
    expect(valueOf(h, "X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("the ticket and the survey say no-referrer in the head too", async () => {
    for (const file of ["../tickets/[ticketid]/page.jsx", "../feedback/[eventId]/[registrationId]/page.jsx", "../certificates/[id]/page.jsx", "../answers/[eventId]/[ref]/page.jsx"]) {
      const { metadata } = await import(/* @vite-ignore */ file);
      expect(metadata.referrer).toBe("no-referrer");
      expect(metadata.robots).toMatchObject({ index: false });
    }
  });

  it("the two header sets differ only in what a Referer may say", () => {
    const strip = (list) => list.filter((h) => h.key !== "Referrer-Policy").map((h) => `${h.key}: ${h.value}`).sort();
    expect(strip(PRIVATE_LINK_HEADERS)).toEqual(strip(CLAIM_HEADERS));
  });

  it.each(["/", "/events", "/events/hack-night-04", "/me/tickets", "/play/68"])("%s keeps the site's defaults", async (path) => {
    expect(valueOf(await headersFor(path), "Referrer-Policy")).toBeNull();
  });
});
