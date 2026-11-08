/**
 * Certificate numbers and links, as the public verifier (/verify) reads them.
 *
 * A certificate issued on MyOtherApp carries a number, CERT-XXXXX-XXXXX,
 * printed beside a QR code that opens https://myotherapp.in/verify/{number}.
 * Its page, the link its holder shares, is
 * https://myotherapp.in/certificates/{public id}: 24 URL-safe characters,
 * case and all, that the API draws for each certificate. A ticket id is
 * neither, and is never looked up here.
 *
 * What someone types, scans or pastes is read the way the app reads it
 * (certificateCodeFrom in the app's certificate_verification.dart), then
 * held to a strict pattern before anything is asked: a name, an email or
 * anything else that cannot be a number or a certificate's link is never
 * sent anywhere.
 */

/** The letters and digits a number is made of: no 0/O, 1/I/L, so it reads back off paper. */
export const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const A = `[${ALPHABET}]`;

/** A certificate number, upper case, as the result pages' addresses carry it (the API's CERTIFICATE_CODE). */
export const NUMBER_PATTERN = new RegExp(`^CERT-${A}{5}-${A}{5}$`);
/** A certificate's public id, exactly as its link carries it (the API's CERTIFICATE_PUBLIC_ID). */
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{24}$/;
/** True for a certificate's public id: the id in its page's address. Case matters. */
export const isCertificatePublicId = (v) => typeof v === "string" && PUBLIC_ID_PATTERN.test(v);
export const EXAMPLE_NUMBER = "CERT-7K3QF-X9PWM";
/** Longer than any link to a certificate: anything longer is not one. */
export const MAX_INPUT = 300;

/** The pages whose address ends in a certificate's public id: its own, and its check. */
const PUBLIC_ID_PAGES = new Set(["certificates", "verify"]);

/**
 * What was typed, scanned or pasted: {code} upper case, not yet checked
 * against a pattern, or {publicId} as it is when it was a link to a
 * certificate's page (or its check) by public id; null when there is
 * nothing in it.
 */
function readCode(input) {
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
    // A certificate's page: its public id, whose case is part of it.
    if (parts.length >= 2 && PUBLIC_ID_PAGES.has(parts[parts.length - 2].toLowerCase()) && isCertificatePublicId(code)) return { publicId: code };
  }
  if (code.toLowerCase().startsWith("certificate:")) code = code.slice("certificate:".length);
  code = code.replace(/\s/g, "").toUpperCase();
  if (code.startsWith("CERTIFICATE-")) code = code.slice("CERTIFICATE-".length);
  code = code.replace(/\.(PDF|PNG)$/, "");
  return code ? { code } : null;
}

/**
 * What was typed, scanned or pasted, as the code to look up; null when
 * there is nothing in it. Not yet checked against a pattern. A number comes
 * back upper case; the public id in a link to a certificate's page, as it is.
 *
 *   https://myotherapp.in/verify/CERT-7K3QF-X9PWM            the last part of a link
 *   https://myotherapp.in/certificates/q7Hb2_kLm9Zx-41PwT0aReXy
 *                                                           a certificate's page: its public id
 *   myotherapp.in/verify/CERT-7K3QF-X9PWM                    (with or without https://)
 *   certificate:CERT-7K3QF-X9PWM                             after certificate:
 *   cert-7k3qf x9pwm                                         any case, spaces anywhere
 *   certificate-CERT-7K3QF-X9PWM.pdf                         the file's own name
 */
export function certificateCodeFrom(input) {
  const read = readCode(input);
  return read ? read.publicId || read.code : null;
}

/** The same, typed without its dashes (CERT7K3QFX9PWM, or "CERT 7K3QF X9PWM"): the last five are the second group. */
const FLAT_PATTERN = new RegExp(`^CERT(${A}{5})(${A}{5})$`);

/** The certificate number (CERT-…) a typed, scanned or pasted thing names; null when it cannot be one. */
export function certificateNumberFrom(input) {
  const code = readCode(input)?.code;
  if (!code) return null;
  if (NUMBER_PATTERN.test(code)) return code;
  const flat = FLAT_PATTERN.exec(code.replace(/-/g, ""));
  return flat ? `CERT-${flat[1]}-${flat[2]}` : null;
}

/** The public id a pasted link to a certificate's page carries, as it is; null for anything else. */
export const certificatePublicIdFrom = (input) => readCode(input)?.publicId || null;

/**
 * What /verify looks a typed, scanned or pasted thing up by: the public id
 * in a link to a certificate's page, else its number; null when it is
 * neither, and then nothing is asked.
 */
export const certificateLookupFrom = (input) => certificatePublicIdFrom(input) || certificateNumberFrom(input);

/** The result page's address for a number, or for the public id a certificate's link carries. */
export const verifyPath = (code) => `/verify/${code}`;

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
