/**
 * The old event addresses, printed on posters and tickets (QR codes), in
 * emails and in the app's share links, kept working forever:
 *
 *   /{id or slug}            → /events/{slug}
 *   /{ref}/live              → /events/{slug}/live
 *   /{ref}/compete           → /events/{slug}/compete
 *   /register/{ref}          → /events/{slug}/register
 *   /events/{id}             → /events/{slug}            (next.config rewrites it to /{id})
 *   /events/{old slug}[/sub] → /events/{slug}[/sub]
 *
 * each a 308 that keeps the query (?ref=, utm_*); the browser keeps the
 * #fragment. The site's own words always win over an old /{ref} (they have
 * their own routes); RESERVED lists the first words that are never an
 * event, so they are never looked up.
 */
import { eventPagePath } from "./urls";

const REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export const RESERVED = new Set([
  "events",
  "clubs",
  "threads",
  "about",
  "privacy",
  "terms",
  "for-clubs",
  "pricing",
  "me",
  "play",
  "feedback",
  "tickets",
  "certificates",
  "register",
  "api",
  "assets",
  "media",
  "og",
  "sitemaps",
  "sitemap",
  "robots",
  "brand",
  "_next",
]);

export const SUBS = new Set(["", "register", "live", "compete"]);

/** True when `ref` may be an old event address worth looking up. */
export const isLegacyRef = (ref) => REF.test(String(ref || "")) && !RESERVED.has(String(ref).toLowerCase());

/** "?a=1&b=2" from Next's searchParams object (a value may be a list); "" for none. */
export function queryOf(searchParams) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams || {})) {
    if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
    else if (v !== undefined && v !== null) out.append(k, String(v));
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** Where an old address goes once its event is found: the event's page (or a page under it), with the query. */
export const legacyDestination = (event, sub = "", search = "") => `${eventPagePath(event, sub)}${search}`;
