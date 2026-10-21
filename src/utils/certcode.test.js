import { webcrypto, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CODE_PATTERN, NUMBER_PATTERN, certificateCodeFrom, certificateNumberFrom, certificateNumberOf, parseVerification, sha256Hex } from "./certcode";

describe("reading what was typed, scanned or pasted", () => {
  it("reads a number, a QR and a link the way the app does", () => {
    expect(certificateCodeFrom("  CERT-7K3QF-X9PWM ")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("cert-7k3qf-x9pwm")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("CERT 7K3QF X9PWM")).toBe("CERT7K3QFX9PWM");
    expect(certificateCodeFrom("certificate:MOA-7K3QF-X9PWM")).toBe("MOA-7K3QF-X9PWM");
    expect(certificateCodeFrom("Certificate:moa-7k3qf-x9pwm")).toBe("MOA-7K3QF-X9PWM");
    expect(certificateCodeFrom("https://myotherapp.in/verify/CERT-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("https://myotherapp.in/verify/CERT-7K3QF-X9PWM/?utm_source=x#top")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("myotherapp.in/certificates/MOA-7K3QF-X9PWM")).toBe("MOA-7K3QF-X9PWM");
    expect(certificateCodeFrom("http://events.myotherapp.in/certificates/moa-7k3qf-x9pwm")).toBe("MOA-7K3QF-X9PWM");
    expect(certificateCodeFrom("certificate-CERT-7K3QF-X9PWM.pdf")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateCodeFrom("CERT-7K3QF-X9PWM/")).toBe("CERT-7K3QF-X9PWM");
  });

  it("has nothing in an empty, a bare or an overlong input", () => {
    for (const v of [null, undefined, "", "   ", "https://myotherapp.in/", "certificate:", "x".repeat(301)]) expect(certificateCodeFrom(v)).toBeNull();
    expect(certificateCodeFrom("https://myotherapp.in/verify/%E0%A4%A")).toBeNull();
  });
});

describe("the number a code names", () => {
  it("is CERT- and the body, for a number or an older QR's ticket id", () => {
    expect(certificateNumberFrom("cert-7k3qf-x9pwm")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberFrom("certificate:MOA-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberFrom("MOA-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberFrom("https://myotherapp.in/verify/CERT-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    // A number made from a ticket id minted before October 2026: hex clock first.
    expect(certificateNumberFrom("cert-2bceba8-pfzg3")).toBe("CERT-2BCEBA8-PFZG3");
    expect(certificateNumberFrom("certificate:MOA-1A-PFZG3")).toBe("CERT-1A-PFZG3");
    // Typed without its dashes, or with spaces for them.
    expect(certificateNumberFrom("CERT 7K3QF X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberFrom("cert7k3qfx9pwm")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberFrom("CERT2BCEBA8PFZG3")).toBe("CERT-2BCEBA8-PFZG3");
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
    expect(CODE_PATTERN.test("MOA-7K3QF-X9PWM")).toBe(true);
    expect(NUMBER_PATTERN.test("cert-7k3qf-x9pwm")).toBe(false);
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

describe("a guest's own certificate", () => {
  it("shows its own number, else the one made from an older ticket, never the ticket id", () => {
    expect(certificateNumberOf("MOA-AAAAA-BBBBB", "CERT-7K3QF-X9PWM")).toBe("CERT-7K3QF-X9PWM");
    expect(certificateNumberOf("MOA-2BCEBA8-PFZG3", null)).toBe("CERT-2BCEBA8-PFZG3");
    expect(certificateNumberOf("MOA-2BCEBA8-PFZG3", "not a number")).toBe("CERT-2BCEBA8-PFZG3");
    expect(certificateNumberOf("", null)).toBe("");
  });
});
