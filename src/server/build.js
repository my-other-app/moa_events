import "server-only";

/**
 * Static pages (the home page, /about, /pricing, ...) are made once by
 * `next build`, then regenerated in the background (ISR). A read that
 * fails at run time throws: Next keeps serving the last good copy, or shows
 * the error page when there is none. At build time there is no last copy
 * and a throw would fail the deploy, so the page is made without the data
 * instead, and replaced by a real one within its revalidate time.
 */
export const isBuilding = () => process.env.NEXT_PHASE === "phase-production-build";

/** `promise`'s value; at build time only, `fallback` when it fails. */
export async function readOr(promise, fallback) {
  try {
    return await promise;
  } catch (e) {
    if (isBuilding()) {
      console.warn(`[build] made a page without its data: ${e?.message || e}`);
      return fallback;
    }
    throw e;
  }
}
