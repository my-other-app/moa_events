import "server-only";

/**
 * The shapes the signed-in and transactional pages' addresses take, checked
 * on the server so anything else is a real 404 rather than a page that
 * fails in the browser. Their content isn't looked up here: a ticket opens
 * only with its holder's token (in the browser), and the quiz and the
 * survey work for any event, public or not.
 */
const EVENT_ID = /^\d{1,12}$/;
/** A ticket ("MOA-1A2B3-XY7QZ", or an older number), or a registration's id (a UUID). */
const KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** A waiting list's claim link: about 32 URL-safe characters (the API's docs/TICKETING.md §4). */
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export const isEventId = (v) => EVENT_ID.test(String(v ?? ""));
export const isKey = (v) => KEY.test(String(v ?? ""));
export const isClaimToken = (v) => TOKEN.test(String(v ?? ""));
/** A registration request's status link (/requests/{token}): the same kind of URL-safe secret. */
export const isRequestToken = (v) => TOKEN.test(String(v ?? ""));

/** One query value as a string ("" when absent; the first when repeated). */
export const queryValue = (v) => (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "");
