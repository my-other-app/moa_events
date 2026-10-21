/**
 * Certificate numbers, as the public verifier (/verify) reads them.
 *
 * A certificate issued on MyOtherApp carries a number, CERT-XXXXX-XXXXX,
 * printed beside a QR code. The QR opens https://myotherapp.in/verify/{number};
 * on certificates printed before October 2026 it held
 * `certificate:MOA-XXXXX-XXXXX` (the ticket's id, whose body the number
 * shares) and the number's first group could be one to seven hex digits.
 *
 * What someone types, scans or pastes is read the way the app reads it
 * (certificateCodeFrom in the app's certificate_verification.dart), then
 * held to a strict pattern before anything is asked: a name, an email or
 * anything else that cannot be a number is never sent anywhere.
 */

/** The letters and digits a number is made of: no 0/O, 1/I/L, so it reads back off paper. */
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const A = `[${ALPHABET}]`;
const BODY = `(?:${A}{5}|[0-9A-F]{1,7})-${A}{5}`;

/** A code the verifier takes, upper case: the number, or the ticket id an older QR held. */
export const CODE_PATTERN = new RegExp(`^(?:CERT|MOA)-(${BODY})$`);
/** A certificate number, as the result pages' addresses carry it. */
export const NUMBER_PATTERN = new RegExp(`^CERT-${BODY}$`);
export const EXAMPLE_NUMBER = "CERT-7K3QF-X9PWM";
/** Longer than any link to a certificate: anything longer is not one. */
export const MAX_INPUT = 300;

/**
 * What was typed, scanned or pasted, as the code to look up, upper case;
 * null when there is nothing in it. Not yet checked against the pattern.
 *
 *   https://myotherapp.in/verify/CERT-7K3QF-X9PWM   the last part of a link
 *   myotherapp.in/certificates/MOA-7K3QF-X9PWM       (with or without https://)
 *   certificate:MOA-7K3QF-X9PWM                      an older certificate's QR
 *   cert-7k3qf x9pwm                                 any case, spaces anywhere
 *   certificate-CERT-7K3QF-X9PWM.pdf                 the file's own name
 */
export function certificateCodeFrom(input) {
  let code = String(input ?? "").trim();
  if (!code || code.length > MAX_INPUT) return null;
  if (code.includes("/")) {
    // A link: its last part, after the host (with or without https://).
    const scheme = /^[a-z][a-z0-9+.-]*:\/\//i;
    let parts = code.replace(scheme, "").split(/[?#]/)[0].split("/").filter(Boolean);
    if (parts.length && (scheme.test(code) || parts[0].includes("."))) parts = parts.slice(1);
    code = parts.length ? parts[parts.length - 1] : "";
    try {
      code = decodeURIComponent(code);
    } catch {
      return null;
    }
  }
  if (code.toLowerCase().startsWith("certificate:")) code = code.slice("certificate:".length);
  code = code.replace(/\s/g, "").toUpperCase();
  if (code.startsWith("CERTIFICATE-")) code = code.slice("CERTIFICATE-".length);
  code = code.replace(/\.(PDF|PNG)$/, "");
  return code || null;
}

/** The same, typed without its dashes (CERT7K3QFX9PWM, or "CERT 7K3QF X9PWM"): the last five are the second group. */
const FLAT_PATTERN = new RegExp(`^(?:CERT|MOA)(${A}{5}|[0-9A-F]{1,7})(${A}{5})$`);

/** The certificate number (CERT-…) a typed, scanned or pasted thing names; null when it cannot be one. */
export function certificateNumberFrom(input) {
  const code = certificateCodeFrom(input);
  if (!code) return null;
  const found = CODE_PATTERN.exec(code);
  if (found) return `CERT-${found[1]}`;
  const flat = FLAT_PATTERN.exec(code.replace(/-/g, ""));
  return flat ? `CERT-${flat[1]}-${flat[2]}` : null;
}

/**
 * The number a guest's certificate carries, for their own view of it: the
 * one the API names (certificate_no), else, for one printed before numbers
 * were drawn on their own, CERT- and the ticket id's body.
 */
export function certificateNumberOf(ticketId, certificateNo = null) {
  if (typeof certificateNo === "string" && NUMBER_PATTERN.test(certificateNo)) return certificateNo;
  const body = String(ticketId ?? "").split("-").slice(1).join("-");
  return body ? `CERT-${body}` : "";
}

/** The result page's address for a number. */
export const verifyPath = (number) => `/verify/${number}`;

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * GET /verify/certificates/{code}, read as the app reads it: valid only
 * when the API says both `valid` and `ok`; a reason it does not know reads
 * as not found. Only the fields the page shows are kept.
 */
export function parseVerification(data) {
  const d = data && typeof data === "object" ? data : {};
  const reason = text(d.reason);
  const state = d.valid === true && (reason === null || reason === "ok") ? "valid" : reason === "revoked" ? "revoked" : "not_found";
  return {
    state,
    number: text(d.number),
    attendeeName: text(d.attendee_name),
    eventName: text(d.event_name),
    orgName: text(d.org_name),
    orgSlug: typeof d.org_slug === "string" && SLUG.test(d.org_slug) ? d.org_slug : null,
    issuedAt: text(d.issued_at),
  };
}

/** The SHA-256 of a file's bytes, as 64 hex characters, worked out in the browser. */
export async function sha256Hex(blob, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error("This browser can't check files.");
  const bytes = typeof blob.arrayBuffer === "function" ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
