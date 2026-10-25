/**
 * The clubs' plans, as GET /api/v1/plans sends them, and everything the
 * pricing pages say about them: a price for the month or the year, a limit
 * in plain words, where each plan's button goes and the structured data a
 * search engine reads. Pure functions and no imports, because the
 * link-preview function under /api runs these on Node too.
 *
 * Prices arrive in paise and are only ever shown in whole rupees with the
 * Indian grouping (₹14,990). A limit of null means unlimited; 0 means none.
 */

const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** A whole number of zero or more, or undefined. */
const count = (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined);
const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/i;

/* ---------- reading the response ---------- */

function parseFeature(f) {
  const o = obj(f);
  const key = str(o?.key);
  const label = str(o?.label);
  if (!key || !label) return null;
  return { key, label, included: o.included === true };
}

function parsePlan(p) {
  const o = obj(p);
  const key = str(o?.key);
  const name = str(o?.name);
  if (!key || !KEY.test(key) || !name) return null;
  const limits = {};
  for (const [k, v] of Object.entries(obj(o.limits) || {})) {
    if (!KEY.test(k)) continue;
    if (v === null) limits[k] = null;
    else if (count(v) !== undefined) limits[k] = v;
  }
  const seen = new Set();
  const features = (Array.isArray(o.features) ? o.features : []).map(parseFeature).filter((f) => f && !seen.has(f.key) && seen.add(f.key));
  return {
    key,
    name,
    tagline: str(o.tagline),
    monthly: count(o.price_monthly_paise) ?? null,
    yearly: count(o.price_yearly_paise) ?? null,
    trialDays: count(o.trial_days) ?? 0,
    contactSales: o.contact_sales === true,
    featured: o.featured === true,
    // No per-message price is read (`email_overage_paise`, `whatsapp_overage_paise`):
    // extra messages are no longer billed; clubs buy top-up packs instead (parseCreditPacks).
    limits,
    features,
  };
}

/**
 * The plans response, read defensively: a plan without a key or a name is
 * dropped, as is a second plan with the same key; nonsense prices and limits
 * are left out, and so is anything else a plan carries (its `id`, say).
 * Null when there is no plan left to show.
 */
export function parsePlans(d) {
  const o = obj(d);
  if (!o) return null;
  const seen = new Set();
  const plans = (Array.isArray(o.plans) ? o.plans : []).map(parsePlan).filter((p) => p && !seen.has(p.key) && seen.add(p.key));
  if (!plans.length) return null;
  const free = count(o.yearly_months_free);
  return {
    currency: typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : "INR",
    yearlyMonthsFree: free && free < 12 ? free : null,
    trial: parseTrial(o.trial),
    enterpriseTrialDays: count(o.enterprise_trial_days) || null,
    plans,
  };
}

/** The trial's own monthly allowances, by limit key, as the API names them. */
const TRIAL_ALLOWANCES = ["emails_per_month", "whatsapp_per_month", "whatsapp_marketing_per_month", "ai_actions_per_month"];

/**
 * The free trial every new club starts with: `{days, planKey, planName}`,
 * with `allowances` (its own monthly emails, WhatsApp and AI actions; the
 * plan's features stay) when the API sends them, or null when it offers none.
 */
function parseTrial(t) {
  const o = obj(t);
  const days = count(o?.days);
  const planKey = str(o?.plan_key);
  const planName = str(o?.plan_name);
  if (!days || !planKey || !KEY.test(planKey) || !planName || o.card_required === true) return null;
  const limits = obj(o.limits) || {};
  const allowances = {};
  for (const k of TRIAL_ALLOWANCES) if (count(limits[k]) !== undefined) allowances[k] = limits[k];
  return Object.keys(allowances).length ? { days, planKey, planName, allowances } : { days, planKey, planName };
}

/* ---------- money ---------- */

const moneyFormats = new Map();

/** "₹14,990" from 1499000 paise: whole rupees, the Indian grouping. */
export function formatMoney(paise, currency = "INR") {
  const rupees = Math.round((Number(paise) || 0) / 100);
  if (!moneyFormats.has(currency)) {
    let f;
    try {
      f = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } catch {
      f = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    moneyFormats.set(currency, f);
  }
  return moneyFormats.get(currency).format(rupees);
}

const paisaFormats = new Map();

/** "₹0.10", "₹1", "₹1.50" from paise: a per-message price, to the paisa. */
export function formatPaisa(paise, currency = "INR") {
  const value = (Number(paise) || 0) / 100;
  const exact = !Number.isInteger(value);
  const key = `${currency}:${exact}`;
  if (!paisaFormats.has(key)) {
    const digits = exact ? 2 : 0;
    let f;
    try {
      f = new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    } catch {
      f = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    paisaFormats.set(key, f);
  }
  return paisaFormats.get(key).format(value);
}

/** 1000 → "1,000", 150000 → "1,50,000". */
export const formatNumber = (n) => new Intl.NumberFormat("en-IN").format(n);

/** "free" (₹0), "paid", or "contact" (talk to us: no price on the page). */
export function planKind(plan) {
  if (plan.contactSales) return "contact";
  if (plan.monthly > 0 || plan.yearly > 0) return "paid";
  if (plan.monthly === 0) return "free";
  return "contact";
}

/**
 * What a plan costs on the cycle picked. A yearly price is shown per month
 * (the year's price over twelve, to the nearest rupee) beside what it bills,
 * with the monthly price it beats and the saving over a year. A plan sold on
 * only one cycle shows that one whichever is picked.
 *
 *   {kind, cycle, perMonth, billed, wasPerMonth, savingPerYear}, all in paise
 */
export function planPrice(plan, cycle = "monthly") {
  const kind = planKind(plan);
  if (kind === "contact") return { kind, cycle: null };
  if (kind === "free") return { kind, cycle: "monthly", perMonth: 0, billed: 0, wasPerMonth: null, savingPerYear: 0 };
  const monthly = plan.monthly > 0;
  const yearly = plan.yearly > 0;
  const c = cycle === "yearly" ? (yearly ? "yearly" : "monthly") : monthly ? "monthly" : "yearly";
  if (c === "monthly") return { kind, cycle: c, perMonth: plan.monthly, billed: plan.monthly, wasPerMonth: null, savingPerYear: 0 };
  const perMonth = Math.round(plan.yearly / 12 / 100) * 100;
  const saving = monthly ? plan.monthly * 12 - plan.yearly : 0;
  return {
    kind,
    cycle: c,
    perMonth,
    billed: plan.yearly,
    wasPerMonth: monthly && plan.monthly > perMonth ? plan.monthly : null,
    savingPerYear: saving > 0 ? saving : 0,
  };
}

/** "2 months free", "1 month free"; null when the API says nothing about it. */
export function yearlyOffer(months) {
  return months > 0 ? `${months} ${months === 1 ? "month" : "months"} free` : null;
}

/** The cheapest paid plan's monthly price (paise), for "Paid plans from ₹299 a month"; null when there is none. */
export function cheapestPaid(data) {
  const prices = (data?.plans || []).filter((p) => planKind(p) === "paid" && p.monthly > 0).map((p) => p.monthly);
  return prices.length ? Math.min(...prices) : null;
}

/** The longest free trial on offer, in days (0 for none): the free trial every new club gets, or a plan's own. */
export function longestTrial(data) {
  return Math.max(data?.trial?.days || 0, ...(data?.plans || []).filter((p) => planKind(p) === "paid").map((p) => p.trialDays));
}

/** "Start free: 14 days of Pro, no card", or plain "Start free" with no trial on offer. */
export function startFreeLabel(data) {
  const t = data?.trial;
  return t ? `Start free: ${t.days} days of ${t.planName}, no card` : "Start free";
}

/** Where every "Start free" goes: the sign-up, with the trial's plan named (the dashboard offers it first). */
export function startFreeUrl(clubsUrl, data) {
  return signupUrl(clubsUrl, data?.trial?.planKey || "pro", "monthly");
}

/** The plans that get a card: with a free trial on offer, the paid tiers and Enterprise (Free is what a club keeps after). */
export function cardPlans(data) {
  const plans = data?.plans || [];
  if (!data?.trial) return plans;
  const paid = plans.filter((p) => planKind(p) !== "free");
  return paid.length ? paid : plans;
}

/** The free plan, when there is one. */
export function freePlan(data) {
  return (data?.plans || []).find((p) => planKind(p) === "free") || null;
}

/** "After your trial, your club keeps Free: 2 events a month, 100 people per event and 2 team seats, enough to run small events." */
export function freeAfterTrialLine(data) {
  const free = freePlan(data);
  if (!data?.trial || !free) return null;
  const limits = headlineLimits(free, ["events_per_month", "registrations_per_event", "committee_seats"]);
  const what = limits.length > 1 ? `${limits.slice(0, -1).join(", ")} and ${limits[limits.length - 1]}` : limits[0];
  return `After your trial, your club keeps ${free.name} for as long as it likes${what ? `: ${what}` : ""}, enough to run small events. Published events, tickets and data keep working.`;
}

/**
 * "The 14-day Pro trial has everything in Pro, with 2,000 emails, 50 WhatsApp
 * messages and 50 AI actions a month.", or null when the API doesn't say
 * what the trial allows.
 */
export function trialAllowancesLine(data) {
  const t = data?.trial;
  const a = t?.allowances;
  if (!a) return null;
  const parts = [
    ["emails_per_month", "email", "emails"],
    ["whatsapp_per_month", "WhatsApp message", "WhatsApp messages"],
    ["ai_actions_per_month", "AI action", "AI actions"],
  ]
    .filter(([k]) => a[k] > 0)
    .map(([k, one, many]) => `${formatNumber(a[k])} ${a[k] === 1 ? one : many}`);
  if (!parts.length) return null;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `The ${t.days}-day ${t.planName} trial has everything in ${t.planName}, with ${list} a month.`;
}

/* ---------- limits in plain words ---------- */

/**
 * Every limit the pages show, in the order the comparison lists them:
 * `row` labels it in the table, `one`/`many` follow a number on a card, and
 * `unlimited` stands in when there is no cap. `needs` is the feature a limit
 * belongs to: a plan without the merch store has no merch items to count.
 */
export const LIMITS = [
  { key: "events_per_month", row: "Events a month", one: "event a month", many: "events a month", unlimited: "Unlimited events" },
  { key: "registrations_per_event", row: "People per event", one: "person per event", many: "people per event", unlimited: "Unlimited people per event" },
  { key: "registrations_per_month", row: "Registrations a month", one: "registration a month", many: "registrations a month", unlimited: "Unlimited registrations" },
  { key: "committee_seats", row: "Team seats", one: "team seat", many: "team seats", unlimited: "Unlimited team seats" },
  { key: "announcements_per_month", row: "Announcements a month", one: "announcement a month", many: "announcements a month", unlimited: "Unlimited announcements" },
  { key: "merch_items_per_event", row: "Merch items per event", one: "merch item per event", many: "merch items per event", unlimited: "Unlimited merch items", needs: "merch" },
  { key: "website_templates", row: "Website templates", one: "website template", many: "website templates", unlimited: "Every website template", needs: "website" },
  { key: "ai_actions_per_month", row: "AI actions a month", one: "AI action a month", many: "AI actions a month", unlimited: "Unlimited AI actions", needs: "ai_assist" },
  { key: "emails_per_month", row: "Emails a month", one: "email a month", many: "emails a month", unlimited: "Unlimited emails" },
  { key: "whatsapp_per_month", row: "WhatsApp messages a month", one: "WhatsApp message a month", many: "WhatsApp messages a month", unlimited: "Unlimited WhatsApp messages" },
];

/**
 * The monthly message limits: every email and WhatsApp message a club sends
 * (tickets, certificates, reminders, announcements). Past them a club uses
 * the credits it bought (top-up packs); with none left, announcements and
 * reminders pause while tickets, certificates and payment messages still go.
 */
export const MESSAGE_LIMITS = ["emails_per_month", "whatsapp_per_month"];

const LIMIT_BY_KEY = new Map(LIMITS.map((l) => [l.key, l]));

/**
 * Limits the API sends that are never shown: ticket types and coupons are
 * not in the product yet, so no page may promise a number of them; storage
 * was never metered and is no longer a limit (an older API still sends it).
 */
export const HIDDEN_LIMITS = new Set(["ticket_types_per_event", "coupons_per_event", "storage_gb", "whatsapp_marketing_per_month"]);

/**
 * " (up to 200 promotional)": a plan's cap on promotional (marketing)
 * WhatsApp messages, said inside its WhatsApp limit rather than on a row of
 * its own (which is why it is in HIDDEN_LIMITS). Empty when the plan has no
 * cap, or no WhatsApp to cap.
 */
export function promotionalNote(plan) {
  const w = plan.limits.whatsapp_per_month;
  const m = plan.limits.whatsapp_marketing_per_month;
  if (!(w > 0) || m === null || m === undefined) return "";
  return m > 0 ? ` (up to ${formatNumber(m)} promotional)` : " (no promotional)";
}

/** The limits a card leads with, in this order. */
export const HEADLINE_LIMITS = ["events_per_month", "registrations_per_event", "registrations_per_month", "committee_seats", "announcements_per_month"];

const humanize = (key) => {
  const s = key.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** How a limit reads, for one the API adds before this page knows its words. */
const limitSpec = (key) => LIMIT_BY_KEY.get(key) || { key, row: humanize(key), one: humanize(key).toLowerCase(), many: humanize(key).toLowerCase(), unlimited: `Unlimited ${humanize(key).toLowerCase()}` };

/** "15 events a month", "1,000 people per event", "Unlimited events"; null for none (0), not stated, or hidden. */
export function limitPhrase(key, value) {
  if (HIDDEN_LIMITS.has(key)) return null;
  const spec = limitSpec(key);
  if (value === null) return spec.unlimited;
  if (!(value > 0)) return null;
  return `${formatNumber(value)} ${value === 1 ? spec.one : spec.many}`;
}

/** A table cell: "Unlimited", "1,000", or null for none or not stated (the table shows a dash). */
export function limitCell(key, value) {
  if (value === null) return "Unlimited";
  if (!(value > 0)) return null;
  return formatNumber(value);
}

/** The few limits a card leads with, in plain words (skipping any a plan doesn't state or allows none of). */
export function headlineLimits(plan, keys = HEADLINE_LIMITS) {
  return keys.filter((k) => k in plan.limits).map((k) => limitPhrase(k, plan.limits[k])).filter(Boolean);
}

/**
 * A plan's limit as the table shows it: "Unlimited", "1,000", or
 * null (a dash) for none, not stated, or a limit on a feature the plan
 * doesn't have.
 */
export function planLimitCell(plan, key) {
  // Enterprise's message limits are set club by club (unlimited until they are).
  if (MESSAGE_LIMITS.includes(key) && planKind(plan) === "contact" && (plan.limits[key] === null || plan.limits[key] === undefined)) return "Custom";
  const needs = LIMIT_BY_KEY.get(key)?.needs;
  if (needs && !includes(plan, needs)) return null;
  const cell = limitCell(key, plan.limits[key]);
  return cell && key === "whatsapp_per_month" ? `${cell}${promotionalNote(plan)}` : cell;
}

/** The table's limit rows: the known ones in order, then any the API adds, by key; never the hidden ones. */
export function limitRows(plans) {
  const keys = new Set(plans.flatMap((p) => Object.keys(p.limits)).filter((k) => !HIDDEN_LIMITS.has(k)));
  const known = LIMITS.filter((l) => keys.has(l.key));
  const extra = [...keys].filter((k) => !LIMIT_BY_KEY.has(k)).map(limitSpec);
  return [...known, ...extra].map(({ key, row }) => ({ key, label: row }));
}

/**
 * A plan's monthly messages in one line: "1,000 emails / 50 WhatsApp (up to
 * 10 promotional) a month", "200 emails a month" (no WhatsApp), "Custom
 * email and WhatsApp limits" (Enterprise), or null when the plan states
 * neither.
 */
export function messagesLine(plan) {
  if (!MESSAGE_LIMITS.some((k) => k in plan.limits)) return null;
  const e = plan.limits.emails_per_month;
  const w = plan.limits.whatsapp_per_month;
  const none = (v) => v === null || v === undefined;
  if (planKind(plan) === "contact" && none(e) && none(w)) return "Custom email and WhatsApp limits";
  const email = none(e) ? "Unlimited emails" : e > 0 ? `${formatNumber(e)} ${e === 1 ? "email" : "emails"}` : null;
  const whatsapp = none(w) ? "unlimited WhatsApp" : w > 0 ? `${formatNumber(w)} WhatsApp${promotionalNote(plan)}` : null;
  if (email && whatsapp) return `${email} / ${whatsapp} a month`;
  if (email) return `${email} a month`;
  return whatsapp ? `${whatsapp.charAt(0).toUpperCase()}${whatsapp.slice(1)} a month` : null;
}

/* ---------- features ---------- */

/** Every feature any plan lists, once, in the order the API sends them. */
export function featureCatalog(plans) {
  const seen = new Map();
  for (const p of plans) for (const f of p.features) if (!seen.has(f.key)) seen.set(f.key, f.label);
  return [...seen].map(([key, label]) => ({ key, label }));
}

/** How the comparison groups the feature catalog, by key. */
export const FEATURE_GROUPS = [
  { key: "every_event", title: "Every event", features: ["checkin", "certificates", "regform", "reviews", "threads"] },
  { key: "ticketing", title: "Ticketing", features: ["tickets", "badges", "merch", "swag"] },
  { key: "live", title: "Live room", features: ["quiz", "polls", "qa", "networking"] },
  { key: "grow", title: "Grow your club", features: ["website", "links", "report", "roles"] },
  { key: "big", title: "Run big events", features: ["teams", "judging", "rounds"] },
  { key: "money", title: "Money", features: ["finance"] },
];

/**
 * The feature rows in sections, each in the catalog's own order; a feature
 * the API adds before this page knows where it goes ends up under "More".
 */
export function featureSections(data) {
  const catalog = featureCatalog(data.plans);
  const groupOf = new Map(FEATURE_GROUPS.flatMap((g) => g.features.map((k) => [k, g.key])));
  const sections = FEATURE_GROUPS.map((g) => ({ key: g.key, title: g.title, rows: catalog.filter((f) => groupOf.get(f.key) === g.key) }));
  sections.push({ key: "more", title: "More", rows: catalog.filter((f) => !groupOf.has(f.key)) });
  return sections.filter((s) => s.rows.length);
}

export const includes = (plan, key) => plan.features.some((f) => f.key === key && f.included);

/** What a plan adds over the one before it (the first plan: what it includes). */
export function addedFeatures(plans, index) {
  const plan = plans[index];
  if (!plan) return [];
  const before = index > 0 ? plans[index - 1] : null;
  return plan.features.filter((f) => f.included && !(before && includes(before, f.key)));
}

/** The features every plan includes, for "Every plan comes with …". */
export function commonFeatures(plans) {
  if (!plans.length) return [];
  return plans[0].features.filter((f) => f.included && plans.every((p) => includes(p, f.key)));
}

/* ---------- where the buttons go ---------- */

const base = (url) => String(url || "").replace(/\/+$/, "");

/** The clubs dashboard's sign-up for a plan on a cycle. */
export const signupUrl = (clubsUrl, plan = "free", cycle = "monthly") =>
  `${base(clubsUrl)}/signup?plan=${encodeURIComponent(plan)}&cycle=${cycle === "yearly" ? "yearly" : "monthly"}`;

export const loginUrl = (clubsUrl) => `${base(clubsUrl)}/login`;

/** The dashboard's sign-up, where every plan is listed: where to look when this page can't show them. */
export const plansPageUrl = (clubsUrl) => `${base(clubsUrl)}/signup`;

/** An email to us about a plan for a whole institution. */
export const contactUrl = (email) => `mailto:${email}?subject=${encodeURIComponent("MyOtherApp for our institution")}`;

/**
 * A plan's button: "Start free", "Start free trial", "Choose Pro", or
 * "Talk to us"; its link (the sign-up with the plan and the cycle picked, or
 * an email), and the line under it (what a paid plan costs after the trial;
 * Enterprise's trial).
 *
 * `trial` is the free trial every new club starts with (parsePlans'
 * `trial`): with one, a paid plan's button starts it and the plan is picked
 * at sign-up, billed only from the trial's end. `enterpriseTrialDays` is the
 * trial the team gives with Enterprise.
 */
export function planCta(plan, cycle, { clubsUrl, contactEmail, currency = "INR", trial = null, enterpriseTrialDays = null }) {
  const price = planPrice(plan, cycle);
  if (price.kind === "contact") {
    return { label: "Talk to us", href: contactUrl(contactEmail), kind: "contact", note: enterpriseTrialDays ? `${enterpriseTrialDays}-day trial included` : null };
  }
  if (price.kind === "free") return { label: "Start free", href: signupUrl(clubsUrl, plan.key, "monthly"), kind: "free", note: null };
  const then = `${formatMoney(price.billed, currency)} a ${price.cycle === "yearly" ? "year" : "month"}`;
  if (trial) {
    return {
      label: "Start free trial",
      href: signupUrl(clubsUrl, plan.key, price.cycle),
      kind: "paid",
      note: `${trial.days} days of ${trial.planName} free, then ${then}`,
    };
  }
  const own = plan.trialDays > 0;
  return {
    label: own ? `Start ${plan.trialDays}-day trial` : `Choose ${plan.name}`,
    href: signupUrl(clubsUrl, plan.key, price.cycle),
    kind: "paid",
    note: own ? `Then ${then}` : null,
  };
}

/* ---------- for search engines ---------- */

/**
 * schema.org SoftwareApplication with one Offer per plan and cycle that has
 * a price (a plan you talk to us about has none, so it is left out).
 */
export function plansJsonLd(data, { url, siteUrl, description }) {
  if (!data?.plans?.length) return null;
  const currency = data.currency;
  const offer = (name, paise, duration) => {
    const price = Math.round(paise) / 100;
    return {
      "@type": "Offer",
      name,
      price,
      priceCurrency: currency,
      url,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price,
        priceCurrency: currency,
        billingDuration: duration,
        unitText: duration === "P1Y" ? "YEAR" : "MONTH",
      },
    };
  };
  const offers = [];
  if (data.trial) {
    // The free trial: the trial's plan at no charge for its days, no card.
    offers.push({
      "@type": "Offer",
      name: `${data.trial.planName}, ${data.trial.days}-day free trial`,
      description: [`${data.trial.days} days of ${data.trial.planName} free for every new club, no card needed`, trialAllowancesLine(data)]
        .filter(Boolean)
        .join(". ")
        .replace(/\.$/, ""),
      price: 0,
      priceCurrency: currency,
      url,
      availability: "https://schema.org/InStock",
      eligibleDuration: { "@type": "QuantitativeValue", value: data.trial.days, unitCode: "DAY" },
    });
  }
  for (const p of data.plans) {
    const kind = planKind(p);
    // What a month's messages include: plain text on each offer.
    const about = messagesLine(p) ?? "";
    const described = (o) => (about ? { ...o, description: about } : o);
    if (kind === "free") offers.push(described(offer(p.name, 0, "P1M")));
    if (kind !== "paid") continue;
    if (p.monthly > 0) offers.push(described(offer(`${p.name}, monthly`, p.monthly, "P1M")));
    if (p.yearly > 0) offers.push(described(offer(`${p.name}, yearly`, p.yearly, "P1Y")));
  }
  const out = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "MyOtherApp for clubs",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url,
    publisher: { "@type": "Organization", name: "MyOtherApp", url: siteUrl },
  };
  if (description) out.description = description;
  if (offers.length) out.offers = offers;
  return out;
}

/** One line per plan, for the preview page a crawler reads: "Growth — ₹699 a month or ₹6,990 a year. …". */
export function planSummary(plan, currency = "INR") {
  const kind = planKind(plan);
  const price =
    kind === "contact"
      ? "Talk to us"
      : kind === "free"
        ? "Free"
        : [plan.monthly > 0 ? `${formatMoney(plan.monthly, currency)} a month` : null, plan.yearly > 0 ? `${formatMoney(plan.yearly, currency)} a year` : null]
            .filter(Boolean)
            .join(" or ");
  const limits = [...headlineLimits(plan), messagesLine(plan)].filter(Boolean).join(", ");
  const sentence = (t) => (/[.!?…]$/.test(t) ? t : `${t}.`);
  return [price, plan.tagline, limits ? `${limits.charAt(0).toUpperCase()}${limits.slice(1)}` : null]
    .filter(Boolean)
    .map(sentence)
    .join(" ");
}

/* ---------- top-up packs ---------- */

/** The channels a pack can be for, in the order the page lists them. */
export const PACK_CHANNELS = ["email", "whatsapp"];

const PACK_CHANNEL_WORDS = {
  email: { title: "Email credits", one: "email", many: "emails" },
  whatsapp: { title: "WhatsApp credits", one: "WhatsApp message", many: "WhatsApp messages" },
};

function parsePack(p) {
  const o = obj(p);
  const channel = str(o?.channel);
  const quantity = count(o?.quantity);
  const price = count(o?.price_paise);
  if (!PACK_CHANNELS.includes(channel) || !quantity || !price) return null;
  return { channel, quantity, price, sortOrder: Number.isInteger(o.sort_order) ? o.sort_order : 0 };
}

/**
 * The top-up packs, as GET /api/v1/credit-packs sends them:
 * `{currency, includesGst, validityMonths, channels: [{channel, packs}]}`,
 * the channels email then WhatsApp and each one's packs in the API's order
 * (sort_order, then size). Read defensively like the plans: a pack for a
 * channel this page doesn't know, with no quantity or no price, or the same
 * as one before it is dropped. Null when there is no pack left to show (or
 * the API has no packs at all): the page then shows no packs.
 */
export function parseCreditPacks(d) {
  const o = obj(d);
  if (!o) return null;
  const seen = new Set();
  const packs = (Array.isArray(o.packs) ? o.packs : [])
    .map(parsePack)
    .filter((p) => {
      const key = `${p?.channel}:${p?.quantity}:${p?.price}`;
      return p && !seen.has(key) && seen.add(key);
    });
  const channels = PACK_CHANNELS.map((channel) => ({
    channel,
    packs: packs.filter((p) => p.channel === channel).sort((a, b) => a.sortOrder - b.sortOrder || a.quantity - b.quantity),
  })).filter((c) => c.packs.length);
  if (!channels.length) return null;
  return {
    currency: typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency) ? o.currency : "INR",
    /** True: the prices include GST (as the plans' do). Null when the API doesn't say. */
    includesGst: typeof o.prices_include_gst === "boolean" ? o.prices_include_gst : null,
    validityMonths: count(o.validity_months) || null,
    channels,
  };
}

/** "Email credits", "WhatsApp credits". */
export const packChannelTitle = (channel) => PACK_CHANNEL_WORDS[channel]?.title ?? channel;

/** "1,000 emails", "100 WhatsApp messages". */
export function packQuantity(pack) {
  const w = PACK_CHANNEL_WORDS[pack.channel];
  return `${formatNumber(pack.quantity)} ${pack.quantity === 1 ? w.one : w.many}`;
}

/** A pack's price, to the paisa: "₹99", "₹1,599". */
export const packPrice = (pack, currency = "INR") => formatPaisa(pack.price, currency);

/**
 * What one message in the pack comes to: "₹1.50 each" when it divides to the
 * paisa, otherwise "about ₹0.09 each" (rounded to the paisa).
 */
export function packUnit(pack, currency = "INR") {
  const paise = Math.round(pack.price / pack.quantity);
  if (paise < 1) return `under ${formatPaisa(1, currency)} each`;
  const each = formatPaisa(paise, currency);
  return pack.price % pack.quantity === 0 ? `${each} each` : `about ${each} each`;
}

/** How bought credits are used, in one sentence each. */
export const CREDITS_MODEL = [
  "Each month your plan's own emails and WhatsApp messages go first, then the credits you've bought, the earliest to expire first.",
  "With none left, announcements and reminders pause; tickets, certificates and payment messages always go.",
];

/** The small print under the packs: "Prices include GST. Credits last 12 months from purchase. …". */
export function packsFinePrint(data) {
  const parts = [];
  if (data.includesGst === true) parts.push("Prices include GST.");
  else if (data.includesGst === false) parts.push("Prices are before GST.");
  const m = data.validityMonths;
  if (m) parts.push(`Credits last ${formatNumber(m)} ${m === 1 ? "month" : "months"} from purchase.`);
  parts.push("Buy them any time from Billing in your clubs dashboard.");
  return parts.join(" ");
}
