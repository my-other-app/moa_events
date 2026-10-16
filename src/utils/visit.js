import apiClient from "@/api/client";

/**
 * One visit to the club's site, for its analytics: the link code it came
 * with (if any), whether the short link already counted it, and the page
 * before. The site inside the frame cannot see any of that, so the page
 * around it sends it. Best effort; a visit that is not counted costs nothing.
 */
export function countVisit(slug, params) {
  const body = JSON.stringify({
    ref: params.get("ref"),
    via: params.get("via"),
    referrer: typeof document !== "undefined" && document.referrer ? document.referrer : null,
  });
  apiClient
    .post(`/api/v1/sites/${slug}/visit`, body, { skipAuth: true, headers: { "Content-Type": "text/plain" } })
    .catch(() => {});
}
