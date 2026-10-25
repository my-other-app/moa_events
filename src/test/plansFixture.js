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

/** The owner's pricing of 2026-10-25 (migration pricing_adjust): promotional WhatsApp capped at 20%, AI actions, ₹1.50. */
const PROMOTIONAL = { free: 0, starter: 10, growth: 50, pro: 200, enterprise: null };
const AI_ACTIONS = { free: 0, starter: 20, growth: 150, pro: 500, enterprise: null };

/**
 * The answer once the backend has pricing_adjust: ₹1.50 a WhatsApp extra,
 * each plan's cap on promotional WhatsApp and its AI actions, and the free
 * trial's own allowances (2,000 emails, 50 WhatsApp, 10 of them
 * promotional, 50 AI actions a month), on top of the message quotas.
 */
export function pricedPlansResponse() {
  const d = quotaPlansResponse();
  for (const p of d.plans) {
    p.limits.whatsapp_marketing_per_month = PROMOTIONAL[p.key] ?? null;
    p.limits.ai_actions_per_month = AI_ACTIONS[p.key] ?? null;
    p.whatsapp_overage_paise = 150;
    if (p.key !== "free") p.features.push({ key: "ai_assist", label: "AI assist: event drafts, writing and feedback summaries", included: true });
    else p.features.push({ key: "ai_assist", label: "AI assist: event drafts, writing and feedback summaries", included: false });
  }
  d.trial.limits = { emails_per_month: 2000, whatsapp_per_month: 50, whatsapp_marketing_per_month: 10, ai_actions_per_month: 50 };
  return d;
}
