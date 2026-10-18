/**
 * Addresses as the router shim (src/lib/router.jsx) takes them: a string, or
 * react-router's {pathname, search, hash}. Pure, so server code may use it.
 */

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
