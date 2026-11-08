import { SITE_URL } from "@/config";

/**
 * Addresses as the router shim (src/lib/router.jsx) takes them: a string, or
 * react-router's {pathname, search, hash}; and the links the API hands out
 * to this site's pages. Pure, so server code may use it.
 */

/**
 * A link the API handed out to one of this site's pages (a certificate's
 * `certificate_url`, a ticket's `ticket_url`, the missing-answers link), as
 * the site links it: its path when it is the site's own address (so it opens
 * wherever the site runs), else the address as given; null when it is no web
 * address at all. The link is the API's to make: nothing here builds one.
 */
export function siteHref(v) {
  const s = typeof v === "string" && v.trim() ? v.trim() : null;
  if (!s) return null;
  let url;
  try {
    url = new URL(s, SITE_URL);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const site = new URL(SITE_URL).host;
  return url.host === site || url.host === `www.${site}` ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

/** "/events?q=x#top" from a string or a {pathname, search, hash}. */
export function hrefOf(to, current = "") {
  if (typeof to === "string") return to;
  if (!to || typeof to !== "object") return current || "/";
  const pathname = to.pathname ?? (current ? current.split(/[?#]/)[0] : "") ?? "";
  const search = to.search ? (to.search.startsWith("?") ? to.search : `?${to.search}`) : "";
  const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : "";
  return `${pathname}${search}${hash}` || "/";
}

/** The query string for an address: "" or "?a=1" from URLSearchParams, a string, an object or entries. */
export function searchOf(init) {
  const params = init instanceof URLSearchParams ? init : new URLSearchParams(init || "");
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Whether `pathname` is at `to` (react-router's NavLink: `end` means exactly, else `to` or under it). */
export function isActivePath(pathname, to, end = false) {
  const target = hrefOf(to).split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const here = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (here === target) return true;
  if (end || target === "/") return false;
  return here.startsWith(`${target}/`);
}
