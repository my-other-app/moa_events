import "server-only";
import { NUMBER_PATTERN, isCertificatePublicId, parseVerification } from "@/utils/certcode";
import { ApiError, apiGet } from "./api";

/**
 * Checking a certificate for /verify/{code} and a certificate's own page
 * (/certificates/{public id}), from the site's server.
 *
 * Never cached anywhere (a revocation shows at once), and always for the
 * visitor whose page it is: with API_SITE_TOKEN set, apiGet names them in
 * X-Visitor-IP, and the API counts the check against them rather than
 * against the few Vercel addresses every visitor's page comes from
 * (app/api/certificates/router.py). `code` is a certificate's number
 * (NUMBER_PATTERN) or its public id (PUBLIC_ID_PATTERN), which the API
 * takes alike; anything else is never sent.
 *
 *   {state: "valid" | "revoked" | "not_found", ...parseVerification}
 *   {state: "invalid"}      `code` is neither: nothing was asked
 *   {state: "limited"}      the API said 429: too many checks from them
 *   {state: "unavailable"}  the API failed or did not answer
 */
export async function checkCertificate(code, { visitor = null, fetchImpl } = {}) {
  if (typeof code !== "string" || !(NUMBER_PATTERN.test(code) || isCertificatePublicId(code))) return { state: "invalid" };
  try {
    const { data } = await apiGet(`/api/v1/verify/certificates/${encodeURIComponent(code)}`, {
      fresh: true,
      visitor,
      timeoutMs: 8000,
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    return parseVerification(data);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return { state: e.status === 429 ? "limited" : "unavailable" };
  }
}
