import "server-only";
import { parseVerification } from "@/utils/certcode";
import { ApiError, apiGet } from "./api";

/**
 * Checking a certificate for /verify/{number}, from the site's server.
 *
 * Never cached anywhere (a revocation shows at once), and always for the
 * visitor whose page it is: with API_SITE_TOKEN set, apiGet names them in
 * X-Visitor-IP, and the API counts the check against them rather than
 * against the few Vercel addresses every visitor's page comes from
 * (app/api/certificates/router.py). `number` has already passed
 * NUMBER_PATTERN; nothing else is ever sent.
 *
 *   {state: "valid" | "revoked" | "not_found", ...parseVerification}
 *   {state: "limited"}      the API said 429: too many checks from them
 *   {state: "unavailable"}  the API failed or did not answer
 */
export async function checkCertificate(number, { visitor = null, fetchImpl } = {}) {
  try {
    const { data } = await apiGet(`/api/v1/verify/certificates/${encodeURIComponent(number)}`, {
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
