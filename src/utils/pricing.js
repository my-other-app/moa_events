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

/** The free trial every new club starts with: `{days, planKey, planName}`, or null when the API offers none. */
function parseTrial(t) {
  const o = obj(t);
  const days = count(o?.days);
  const planKey = str(o?.plan_key);
  const planName = str(o?.plan_name);
  if (!days || !planKey || !KEY.test(planKey) || !planName || o.card_required === true) return null;
  return { days, planKey, planName };
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
];
const LIMIT_BY_KEY = new Map(LIMITS.map((l) => [l.key, l]));

/**
 * Limits the API sends that are never shown: ticket types and coupons are
 * not in the product yet, so no page may promise a number of them; storage
 * was never metered and is no longer a limit (an older API still sends it).
 */
export const HIDDEN_LIMITS = new Set(["ticket_types_per_event", "coupons_per_event", "storage_gb"]);

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
  const needs = LIMIT_BY_KEY.get(key)?.needs;
  if (needs && !includes(plan, needs)) return null;
  return limitCell(key, plan.limits[key]);
}

/** The table's limit rows: the known ones in order, then any the API adds, by key; never the hidden ones. */
export function limitRows(plans) {
  const keys = new Set(plans.flatMap((p) => Object.keys(p.limits)).filter((k) => !HIDDEN_LIMITS.has(k)));
  const known = LIMITS.filter((l) => keys.has(l.key));
  const extra = [...keys].filter((k) => !LIMIT_BY_KEY.has(k)).map(limitSpec);
  return [...known, ...extra].map(({ key, row }) => ({ key, label: row }));
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
      description: `${data.trial.days} days of ${data.trial.planName} free for every new club, no card needed`,
      price: 0,
      priceCurrency: currency,
      url,
      availability: "https://schema.org/InStock",
      eligibleDuration: { "@type": "QuantitativeValue", value: data.trial.days, unitCode: "DAY" },
    });
  }
  for (const p of data.plans) {
    const kind = planKind(p);
    if (kind === "free") offers.push(offer(p.name, 0, "P1M"));
    if (kind !== "paid") continue;
    if (p.monthly > 0) offers.push(offer(`${p.name}, monthly`, p.monthly, "P1M"));
    if (p.yearly > 0) offers.push(offer(`${p.name}, yearly`, p.yearly, "P1Y"));
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
  const limits = headlineLimits(plan).join(", ");
  const sentence = (t) => (/[.!?…]$/.test(t) ? t : `${t}.`);
  return [price, plan.tagline, limits ? `${limits.charAt(0).toUpperCase()}${limits.slice(1)}` : null].filter(Boolean).map(sentence).join(" ");
}
