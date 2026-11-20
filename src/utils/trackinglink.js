import { API_BASE_URL } from "@/config";

/**
 * A tracking link on the site's own domain, /l/{code} (what a guest's
 * "I'm attending" poster prints), and where it goes: the API's own /l/{code},
 * the query kept. Pure, for the route and its tests.
 */

/** A tracking link's code: letters and digits (the API's are 8, lower case). */
export const LINK_CODE = /^[A-Za-z0-9]{4,32}$/;

/** The API's /l/{code} with the query the visitor came with; null for anything that isn't a code. */
export function trackingTarget(code, search = "", api = API_BASE_URL) {
  if (typeof code !== "string" || !LINK_CODE.test(code)) return null;
  const query = typeof search === "string" && search.startsWith("?") && search.length > 1 ? search : "";
  return `${api}/l/${code}${query}`;
}
