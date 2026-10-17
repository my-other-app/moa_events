import PLANS from "./plans.json";

/**
 * GET /api/v1/plans answers for the tests (and nothing else: the pages never
 * carry prices of their own). plans.json is the backend's answer for its
 * seeded plans, verbatim: Free, Starter, Growth (featured, 14-day trial),
 * Pro (14-day trial), Campus and Enterprise (talk to us), each with the
 * same 21-feature catalog in the same order.
 */
export function plansResponse() {
  return structuredClone(PLANS);
}
