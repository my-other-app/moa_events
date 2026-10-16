/**
 * What the link-preview and sitemap functions share. Files under api/_lib
 * are not functions themselves (Vercel skips names starting with "_").
 * No dependencies: global fetch only.
 */
export const SITE_URL = "https://myotherapp.in";
export const SITE_NAME = "MyOtherApp";
export const API_URL = (process.env.MOA_API_URL || "https://api.myotherapp.in").replace(/\/+$/, "");
export const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;

/** A good answer is kept at the edge for ten minutes and served stale for a day while it refreshes. */
export const CACHE = "public, s-maxage=600, stale-while-revalidate=86400";
/** An answer made without the API (it failed): try again soon. */
export const CACHE_SHORT = "public, s-maxage=60, stale-while-revalidate=600";

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for HTML, attribute values included. */
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** GET a JSON document from the API: {status, data}; data is null unless the answer was a 200. Throws on a network failure or timeout. */
export async function fetchJson(path, { timeoutMs = 4000, fetchImpl = globalThis.fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${API_URL}${path}`, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: await res.json() };
  } finally {
    clearTimeout(timer);
  }
}
