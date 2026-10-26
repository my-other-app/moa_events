/**
 * A registration request's link (registration approval: the API's
 * docs/APPROVALS.md), as the register call's `approval` and the event's
 * `ticketing.viewer_request` carry it: {id, status, token, status_url}.
 * Shared by utils/requests.js and utils/ticketing.js, so neither needs the
 * other.
 *
 * `token` and `status_url` can be null: the form sent again, signed out,
 * for an address with an open request already. Whoever typed the address
 * hasn't shown it is theirs, so the API emails the link instead.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const iso = (v) => {
  const s = str(v);
  return s && !Number.isNaN(new Date(s).getTime()) ? s : null;
};

/** The request's link token: URL-safe, as the server makes it (and as /requests/{token} accepts it). */
export const REQUEST_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

/** "https://myotherapp.in/requests/<token>" → "<token>"; null when it isn't one. */
export function tokenFromStatusUrl(url) {
  const s = str(url);
  if (!s) return null;
  try {
    const parts = new URL(s, "https://myotherapp.in").pathname.split("/").filter(Boolean);
    const at = parts.indexOf("requests");
    const token = at !== -1 ? decodeURIComponent(parts[at + 1] || "") : "";
    return REQUEST_TOKEN.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** The site's own address for a request's status: /requests/{token}. Null without a token. */
export const requestPath = (token) => (token && REQUEST_TOKEN.test(String(token)) ? `/requests/${encodeURIComponent(token)}` : null);

/** The token an answer carries: `token`, else the one in `status_url`. */
export const tokenOf = (o) => (str(o?.token) && REQUEST_TOKEN.test(o.token.trim()) ? o.token.trim() : tokenFromStatusUrl(o?.status_url));

/** {id, status, submittedAt, token, path}, or null when it isn't one. `token` and `path` are null when the link was emailed instead. */
export function parseRequestRef(d) {
  const a = obj(d);
  if (!a) return null;
  const token = tokenOf(a);
  return {
    id: a.id === null || a.id === undefined ? null : String(a.id),
    status: str(a.status) || "pending",
    submittedAt: iso(a.submitted_at),
    token,
    path: requestPath(token),
  };
}
