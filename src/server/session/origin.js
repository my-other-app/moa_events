import "server-only";

/**
 * Who started a request to the site's gateway or session route. Only the
 * site's own pages use them, so (as the dashboards' gateway does):
 *
 *   - a request the browser says anything but this origin started
 *     (`Sec-Fetch-Site` other than same-origin or none) is refused,
 *     whatever its method, other myotherapp.in hosts (club sites) included;
 *   - a request that changes something must also name this origin
 *     (`Origin`), and a request with neither header is refused (fail
 *     closed: every browser in use sends one of them).
 *
 * Neither header can be set by another site's script, and the gateway
 * never answers a preflight with an Access-Control-* header.
 */

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The hosts this request was addressed to: Host (Caddy and Vercel pass the visitor's on), X-Forwarded-Host, and the URL's. */
export function ownHosts(request) {
  const hosts = new Set();
  const add = (value) => {
    const host = String(value || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    if (host) hosts.add(host);
  };
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host"));
  try {
    add(new URL(request.url).host);
  } catch {
    /* a relative URL in a test */
  }
  return hosts;
}

/** The browser says another site (or another myotherapp.in host) started this request. */
export function isCrossSite(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site === null) return false;
  const v = site.trim().toLowerCase();
  return v !== "same-origin" && v !== "none";
}

/** The request came from a page on this origin. */
export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (origin === null && site === null) return false;
  if (site !== null && site.trim().toLowerCase() !== "same-origin") return false;
  if (origin !== null) {
    let host;
    try {
      host = new URL(origin).host.toLowerCase();
    } catch {
      return false;
    }
    if (!host || !ownHosts(request).has(host)) return false;
  }
  return true;
}

/** Whether a request may go on: refused when another site started it, or when it changes something without naming this origin. */
export const fromThisSite = (request) => !isCrossSite(request) && (SAFE_METHODS.has(request.method) || isSameOrigin(request));

export const CROSS_ORIGIN_REFUSED = "CROSS_ORIGIN_REFUSED";

export const refusedCrossOrigin = () =>
  Response.json(
    { message: "This request didn't come from this site's own pages, so it wasn't sent. Reload the page and try again.", error_code: CROSS_ORIGIN_REFUSED },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
