import { webcrypto, createHash } from "node:crypto";
// A Blob from the same realm as webcrypto, as in a browser. jsdom's Blob hands
// back its own realm's ArrayBuffer, which Node 20's digest() refuses.
import { Blob } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  NUMBER_PATTERN,
  PUBLIC_ID_PATTERN,
  certificateCodeFrom,
  certificateLookupFrom,
  certificateNumberFrom,
  certificatePublicIdFrom,
  isCertificatePublicId,
  parseVerification,
  sha256Hex,
  verifyPath,
} from "./certcode";

/** A certificate's public id: 24 URL-safe characters, case and all. */
const PUBLIC_ID = "q7Hb2_kLm9Zx-41PwT0aReXy";

describe("reading what was typed, scanned or pasted", () => {
  it("reads a number, a QR and a link the way the app does", () => {
    expect(certificateCodeFrom("  CERT-7K3QF-X9PWM ")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("cert-7k3qf-x9pwm")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("CERT 7K3QF X9PWM")).toBe("CERT7K3QFX9PWM");
    expect(certificateCodeFrom("certificate:CERT-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("https://myotherapp.in/verify/CERT-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("https://myotherapp.in/verify/CERT-7K3QF-X9PWM/?utm_source=x#top")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("certificate-CERT-7K3QF-X9PWM.pdf")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("CERT-7K3QF-X9PWM/")).toBe("CERT-7K3QF-X9PWM");
  });

  it("reads a certificate's link as its public id, exactly as it is", () => {
    for (const link of [
      `https://myotherapp.in/certificates/${PUBLIC_ID}`,
      `myotherapp.in/certificates/${PUBLIC_ID}`,
      `https://www.myotherapp.in/certificates/${PUBLIC_ID}/?utm_source=whatsapp#top`,
      `  http://events.myotherapp.in/Certificates/${PUBLIC_ID}  `,
      `/certificates/${PUBLIC_ID}`,
      // Its check's own address, as the address bar shows it.
      `https://myotherapp.in/verify/${PUBLIC_ID}`,
    ]) {
      expect(certificateCodeFrom(link), link).toBe(PUBLIC_ID);
      expect(certificatePublicIdFrom(link), link).toBe(PUBLIC_ID);
    }
    // One starting with - or _ is as good as any.
    expect(certificatePublicIdFrom("https://myotherapp.in/certificates/-Hb2_kLm9Zx-41PwT0aReXy_")).toBe("-Hb2_kLm9Zx-41PwT0aReXy_");
  });

  it("has nothing in an empty, a bare or an overlong input", () => {
    for (const v of [null, undefined, "", "   ", "https://myotherapp.in/", "certificate:", "x".repeat(301)]) expect(certificateCodeFrom(v)).toBeNull();
    expect(certificateCodeFrom("https://myotherapp.in/verify/%E0%A4%A")).toBeNull();
  });
});

describe("the number a code names", () => {
  it("is the number however it was written: any case, spaces, no dashes, a QR, a link", () => {
    expect(certificateNumberFrom("cert-7k3qf-x9pwm")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberFrom("certificate:CERT-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberFrom("https://myotherapp.in/verify/CERT-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    // Typed without its dashes, or with spaces for them.
    expect(certificateNumberFrom("CERT 7K3QF X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberFrom("cert7k3qfx9pwm")).toBe("CERT-7K3QF-X9PWM");
  });

  it("is never made from a ticket id, nor from anything shaped like one", () => {
    for (const v of [
      "MOA-7K3QF-X9PWM",
      "certificate:MOA-7K3QF-X9PWM",
      "Certificate:moa-7k3qf-x9pwm",
      "myotherapp.in/certificates/MOA-7K3QF-X9PWM",
      "http://events.myotherapp.in/certificates/moa-7k3qf-x9pwm",
      "MOA7K3QFX9PWM",
      // A ticket's hex clock under CERT-: not a number the API draws.
      "cert-2bceba8-pfzg3",
      "CERT2BCEBA8PFZG3",
      "certificate:MOA-1A-PFZG3",
    ]) {
      expect(certificateNumberFrom(v), v).toBeNull();
      expect(certificateLookupFrom(v), v).toBeNull();
    }
  });

  it("is null for anything that cannot be one: a name, an address, a guess", () => {
    for (const v of [
      "Ananya Iyer",
      "ananya@example.com",
      "9876543210",
      "CERT-7K3QF",
      "CERT-7K3QF-X9PWMM",
      "CERT-7K3QO-X9PWM", // O is never used
      "CERT-7K3Q1-X9PWM", // nor 1 outside the hex clock
      "CERT-12345678-X9PWM", // eight hex digits: too many
      "TICKET-7K3QF-X9PWM",
      "CERT-7K3QF-X9PWM' OR 1=1 --",
      "<script>alert(1)</script>",
      "CERT-%2E%2E-X9PWM",
    ]) {
      expect(certificateNumberFrom(v), v).toBeNull();
    }
  });

  it("holds the patterns to exactly the shapes the API issues", () => {
    expect(NUMBER_PATTERN.test("CERT-7K3QF-X9PWM")).toBe(true);
    expect(NUMBER_PATTERN.test("MOA-7K3QF-X9PWM")).toBe(false);
    expect(NUMBER_PATTERN.test("CERT-2BCEBA8-PFZG3")).toBe(false);
    expect(NUMBER_PATTERN.test("cert-7k3qf-x9pwm")).toBe(false);
    expect(PUBLIC_ID_PATTERN.test(PUBLIC_ID)).toBe(true);
    expect(isCertificatePublicId(PUBLIC_ID)).toBe(true);
    for (const v of [PUBLIC_ID.slice(1), `${PUBLIC_ID}a`, "MOA-7K3QF-X9PWM", "CERT-7K3QF-X9PWM", `${PUBLIC_ID.slice(1)}.`, null, 24]) {
      expect(isCertificatePublicId(v), String(v)).toBe(false);
    }
  });
});

describe("what /verify looks up", () => {
  it("a certificate's link by its public id, as it is; anything else by its number", () => {
    expect(certificateLookupFrom(`https://myotherapp.in/certificates/${PUBLIC_ID}`)).toBe(PUBLIC_ID);
    expect(certificateLookupFrom("cert-7k3qf-x9pwm")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateLookupFrom("https://myotherapp.in/verify/CERT-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(verifyPath(PUBLIC_ID)).toBe(`/verify/${PUBLIC_ID}`);
  });

  it("never a bare public id typed in the box, nor one under any other page, nor one whose case was changed", () => {
    expect(certificatePublicIdFrom(PUBLIC_ID)).toBeNull();
    expect(certificateLookupFrom(PUBLIC_ID)).toBeNull();
    expect(certificatePublicIdFrom(`https://myotherapp.in/tickets/${PUBLIC_ID}`)).toBeNull();
    expect(certificatePublicIdFrom(`https://myotherapp.in/${PUBLIC_ID}`)).toBeNull();
    expect(certificatePublicIdFrom(`https://myotherapp.in/certificates/${PUBLIC_ID}x`)).toBeNull();
    expect(certificateLookupFrom(`https://myotherapp.in/tickets/${PUBLIC_ID}`)).toBeNull();
    // A number in a certificate's link is still a number.
    expect(certificatePublicIdFrom("https://myotherapp.in/certificates/CERT-7K3QF-X9PWM")).toBeNull();
  });
});

describe("the API's answer", () => {
  const full = { valid: true, reason: "ok", number: "CERT-7K3QF-X9PWM", attendee_name: "Ananya Iyer", event_name: "LAN Night", org_name: "Respawn", org_slug: "respawn-1a2b3c", issued_at: "2026-09-12T13:00:00Z" };

  it("is valid only when it says both valid and ok", () => {
    expect(parseVerification(full)).toEqual({
      state: "valid", number: "CERT-7K3QF-X9PWM", attendeeName: "Ananya Iyer", eventName: "LAN Night",
      orgName: "Respawn", orgSlug: "respawn-1a2b3c", issuedAt: "2026-09-12T13:00:00Z",
    });
    expect(parseVerification({ ...full, reason: null }).state).toBe("valid");
    expect(parseVerification({ ...full, valid: "true" }).state).toBe("not_found");
    expect(parseVerification({ ...full, reason: "something new" }).state).toBe("not_found");
  });

  it("reads revoked and not found, and keeps nothing it does not show", () => {
    expect(parseVerification({ valid: false, reason: "revoked", number: "CERT-7K3QF-X9PWM" }).state).toBe("revoked");
    expect(parseVerification({ valid: false, reason: "not_found" }).state).toBe("not_found");
    expect(parseVerification(null).state).toBe("not_found");
    const parsed = parseVerification({ ...full, email: "a@example.com", ticket_id: "MOA-7K3QF-X9PWM", org_slug: "../admin" });
    expect(JSON.stringify(parsed)).not.toMatch(/example\.com|MOA-/);
    expect(parsed.orgSlug).toBeNull();
  });
});

describe("a file's SHA-256, in the browser", () => {
  it("is the hex digest of its bytes", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 a certificate");
    const blob = new Blob([bytes], { type: "application/pdf" });
    expect(await sha256Hex(blob, webcrypto.subtle)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("says so when the browser has no crypto", async () => {
    await expect(sha256Hex(new Blob(["x"]), null)).rejects.toThrow("can't check files");
  });
});

