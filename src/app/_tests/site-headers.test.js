// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig, { SITE_HEADERS, cspReportUri, reportOnlyPolicy } from "../../../next.config.mjs";
import { effectiveHeaders } from "@/test/headers";
import { isOurImage, ourImage } from "@/utils/imagehosts";
import { imageDataUrl } from "@/og/assets";
import { namesSecret } from "@/server/secret";

/*
 * What every address on the site is sent, besides its own rules: never
 * framed, never sniffed, the origin alone in a Referer, and the script
 * policy as a report only. And the two places the site follows an image
 * link the API gave it (/media and /og) follow only our own storage's.
 */

describe("the site-wide headers", () => {
  it("are the first block, so every address's own rules win over them", async () => {
    const rules = await nextConfig.headers();
    expect(rules[0]).toEqual({ source: "/:path*", headers: SITE_HEADERS });
  });

  it.each(["/", "/events", "/events/hack-night-04", "/events/hack-night-04/register", "/events/hack-night-04/live", "/me/tickets", "/speakers/me", "/help/requests/1", "/og/events/x", "/media/events/x/poster"])(
    "%s is never framed or sniffed, and tells other sites its origin alone",
    async (path) => {
      const h = await effectiveHeaders(nextConfig, path);
      expect(h).toMatchObject({
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), browsing-topics=()",
      });
      expect(h["Content-Security-Policy-Report-Only"]).toMatch(/^default-src 'self'; script-src /);
    },
  );

  it("keeps each credential address's own stricter rules", async () => {
    const ticket = await effectiveHeaders(nextConfig, "/tickets/MOA-7K3QF-X9PWM");
    expect(ticket).toMatchObject({ "Referrer-Policy": "no-referrer", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY" });
    expect((await effectiveHeaders(nextConfig, "/claim/Xy3abcdefghijklmnopqrstuvwxyz012"))["Referrer-Policy"]).toBe("strict-origin");
    const qr = await effectiveHeaders(nextConfig, "/p/ABCD1234");
    expect(qr).toMatchObject({ "Referrer-Policy": "no-referrer", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" });
    // The find pages keep their edge rule.
    expect((await effectiveHeaders(nextConfig, "/events"))["Vercel-CDN-Cache-Control"]).toBe("max-age=60, stale-while-revalidate=300");
  });

  it("enforces no script policy: the CSP is sent only as a report", () => {
    const enforced = SITE_HEADERS.filter((h) => h.key === "Content-Security-Policy").map((h) => h.value);
    expect(enforced).toEqual(["frame-ancestors 'none'"]);
    const report = reportOnlyPolicy({ apiOrigin: "https://api.myotherapp.in", dev: false, reportUri: null });
    expect(report).toContain("script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://accounts.google.com/gsi/client;");
    expect(report).toContain("connect-src 'self' https://api.myotherapp.in ");
    expect(report).toContain("frame-src https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com;");
    expect(report).toContain("object-src 'none'; base-uri 'self'");
    expect(report).not.toContain("unsafe-eval");
    expect(report).not.toContain("report-uri");
  });

  it("reports to Sentry's security endpoint when Sentry is on", () => {
    expect(cspReportUri("https://abc123@o42.ingest.de.sentry.io/4507")).toBe("https://o42.ingest.de.sentry.io/api/4507/security/?sentry_key=abc123");
    expect(cspReportUri(null)).toBeNull();
    expect(cspReportUri("not a dsn")).toBeNull();
    expect(reportOnlyPolicy({ reportUri: "https://o42.ingest.de.sentry.io/api/4507/security/?sentry_key=abc123", dev: false })).toMatch(/; report-uri https:\/\/o42\.ingest\.de\.sentry\.io\/api\/4507\/security\/\?sentry_key=abc123$/);
  });
});

describe("the image links the site follows", () => {
  it("are https links on our own storage only", () => {
    for (const ok of [
      "https://media.myotherapp.in/myotherapp-media/clubs/logos/v-1.png?X-Amz-Signature=a",
      "https://moa-media.s3.amazonaws.com/a.png",
      "https://moa-media-ap-south-1.s3.ap-south-1.amazonaws.com/p.jpg?Expires=1",
      "https://b.s3.amazonaws.com/p.png",
    ]) {
      expect(isOurImage(ok)).toBe(true);
    }
    for (const no of [
      "http://media.myotherapp.in/a.png",
      "https://evil.example/a.png",
      "https://media.myotherapp.in.evil.example/a.png",
      "https://evil.example/media.myotherapp.in/a.png",
      "https://user:pass@media.myotherapp.in/a.png",
      "https://media.myotherapp.in:8443/a.png",
      "https://s3.amazonaws.com/bucket/a.png",
      "https://ec2-1-2-3-4.compute-1.amazonaws.com/a.png",
      "https://api.myotherapp.in/static/a.png",
      "http://postgres:5432/",
      "https://169.254.169.254/latest/meta-data",
      "javascript:alert(1)",
      "/media/x",
      "",
      null,
      { url: "https://media.myotherapp.in/a.png" },
    ]) {
      expect(isOurImage(no)).toBe(false);
    }
    expect(ourImage("https://evil.example/a.png")).toBeNull();
  });

  it("are fetched for a share picture only from our storage, never by a redirect", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const fetchImpl = vi.fn(async () => new Response(png, { status: 200 }));
    expect(await imageDataUrl("https://media.myotherapp.in/a.png", { fetchImpl })).toMatch(/^data:image\/png;base64,/);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
    fetchImpl.mockClear();
    for (const url of ["https://evil.example/a.png", "http://redis:6379/", "https://api.myotherapp.in/static/a.png"]) {
      expect(await imageDataUrl(url, { fetchImpl })).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    // A redirect off our storage is a failed fetch: no picture.
    const redirected = vi.fn(async () => {
      throw new TypeError("fetch failed: unexpected redirect");
    });
    expect(await imageDataUrl("https://media.myotherapp.in/a.png", { fetchImpl: redirected })).toBeNull();
  });
});

describe("the revalidate secret", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is named in full or not at all", () => {
    expect(namesSecret("Bearer s3cret-value", "s3cret-value")).toBe(true);
    for (const wrong of ["Bearer s3cret-valu", "Bearer s3cret-value ", "bearer s3cret-value", "s3cret-value", "", null, undefined]) {
      expect(namesSecret(wrong, "s3cret-value")).toBe(false);
    }
    expect(namesSecret("Bearer ", "")).toBe(false);
  });

  it("guards /api/revalidate", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "s3cret-value");
    const { POST } = await import("../api/revalidate/route.js");
    const ask = (auth) => POST(new Request("https://myotherapp.in/api/revalidate", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: "{}" }));
    expect((await ask("Bearer nope")).status).toBe(401);
    expect((await ask("Bearer s3cret-value")).status).toBe(200);
  });
});
