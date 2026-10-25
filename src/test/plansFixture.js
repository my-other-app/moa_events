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

/**
 * The answer once the backend has the free trial (migration trial_pricing):
 * 14 days of Pro for every new club, Campus withdrawn (folded into
 * Enterprise), no plan trials of their own, no storage, and Enterprise's
 * 30-day trial.
 */
export function trialPlansResponse() {
  const d = plansResponse();
  d.plans = d.plans.filter((p) => p.key !== "campus");
  for (const p of d.plans) {
    p.trial_days = 0;
    delete p.limits.storage_gb;
  }
  d.trial = { days: 14, plan_key: "pro", plan_name: "Pro", card_required: false, then_plan_key: "free" };
  d.enterprise_trial_days = 30;
  return d;
}

/** The owner's monthly message limits (migration message_quotas): emails, WhatsApp. Enterprise is null: set per club. */
const MESSAGES = { free: [200, 0], starter: [1000, 50], growth: [5000, 250], pro: [20000, 1000], enterprise: [null, null] };

/**
 * The answer once the backend has the message quotas: each plan's emails and
 * WhatsApp a month, and the price of an extra one (₹0.10 an email, ₹1 a
 * WhatsApp message), on top of the free trial's answer.
 */
export function quotaPlansResponse() {
  const d = trialPlansResponse();
  for (const p of d.plans) {
    const [emails, whatsapp] = MESSAGES[p.key] ?? [null, null];
    p.limits.emails_per_month = emails;
    p.limits.whatsapp_per_month = whatsapp;
    p.email_overage_paise = 10;
    p.whatsapp_overage_paise = 100;
  }
  return d;
}
