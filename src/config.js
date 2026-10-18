/**
 * The site's settings. Values the browser needs are NEXT_PUBLIC_* (Next
 * writes them into the client bundle at build time, so each must be read as
 * `process.env.NEXT_PUBLIC_…` literally). Server code may also read the
 * non-public API_BASE_URL (src/server/api.js). Every variable is listed in
 * the README.
 */

const clean = (v) => (typeof v === "string" && v.trim() ? v.trim().replace(/\/+$/, "") : null);

/** The API's origin, without /api/v1 (every call names its own path). */
export const DEFAULT_API_BASE_URL = "https://api.myotherapp.in";
export const API_BASE_URL = clean(process.env.NEXT_PUBLIC_API_BASE_URL) || DEFAULT_API_BASE_URL;

/** Where "Get the app" sends people. The App Store button shows only once its link is set. */
export const PLAY_STORE_URL = clean(process.env.NEXT_PUBLIC_PLAY_STORE_URL) || "https://play.google.com/store/apps/details?id=app.myotherapp.com";
export const APP_STORE_URL = clean(process.env.NEXT_PUBLIC_APP_STORE_URL) || null;

/** The clubs' own dashboard, for "For clubs". */
export const CLUBS_URL = "https://clubs-next.myotherapp.in";

export const CONTACT_EMAIL = "support@myotherapp.in";

export const SITE_NAME = "MyOtherApp";

/** The site's own address: canonical links and the links people share start here. */
export const SITE_URL = "https://myotherapp.in";
