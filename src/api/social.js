import apiClient from "./client";
import { apiFailure } from "@/utils/ticketing";

/**
 * Social accounts, from the browser (feature-register/social-posting-contract.md):
 * only what the public site needs, a data deletion request's status for
 * /data-deletion?code= (GET /api/v1/social/data-deletion/{code}, public).
 * Throws apiFailure()'s shape.
 */
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** {code, status: "completed" | "pending", requestedAt, completedAt, accounts, what}. */
export function parseDeletionStatus(d) {
  const o = d && typeof d === "object" ? d : null;
  if (!o || !str(o.code)) return null;
  return {
    code: str(o.code),
    status: o.status === "completed" ? "completed" : "pending",
    requestedAt: str(o.requested_at),
    completedAt: str(o.completed_at),
    accounts: typeof o.accounts === "number" && o.accounts >= 0 ? o.accounts : null,
    what: str(o.what),
  };
}

export const socialApi = {
  deletionStatus: (code) =>
    apiClient.get(`/api/v1/social/data-deletion/${encodeURIComponent(code)}`, { skipAuth: true }).then(
      (r) => {
        const s = parseDeletionStatus(r.data);
        if (!s) throw apiFailure({ response: { status: 404, data: {} } });
        return s;
      },
      (error) => {
        throw apiFailure(error);
      },
    ),
};
