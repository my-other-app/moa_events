import { describe, expect, it } from "vitest";
import { creditPacksResponse, plansResponse, prepaidPlansResponse, pricedPlansResponse, quotaPlansResponse, trialPlansResponse } from "@/test/plansFixture";
import {
  addedFeatures,
  cheapestPaid,
  commonFeatures,
  contactUrl,
  featureSections,
  formatMoney,
  headlineLimits,
  limitCell,
  limitPhrase,
  limitRows,
  planLimitCell,
  longestTrial,
  loginUrl,
  parsePlans,
  planCta,
  planPrice,
  planSummary,
  plansJsonLd,
  plansPageUrl,
  signupUrl,
  startFreeLabel,
  startFreeUrl,
  cardPlans,
  freeAfterTrialLine,
  formatPaisa,
  messagesLine,
  CREDITS_MODEL,
  packChannelTitle,
  packPrice,
  packQuantity,
  packUnit,
  packsFinePrint,
  parseCreditPacks,
  promotionalNote,
  trialAllowancesLine,
  yearlyOffer,
} from "./pricing";

const CLUBS = "https://club-dashboard.myotherapp.in";
const data = parsePlans(plansResponse());
const plan = (key) => data.plans.find((p) => p.key === key);
const opts = { clubsUrl: CLUBS, contactEmail: "support@myotherapp.in" };

describe("reading the plans", () => {
  it("keeps the six plans in order, with prices in paise, limits, features and the yearly offer", () => {
    expect(data.currency).toBe("INR");
    expect(data.yearlyMonthsFree).toBe(2);
    expect(data.plans.map((p) => p.key)).toEqual(["free", "starter", "growth", "pro", "campus", "enterprise"]);
    expect(plan("growth")).toMatchObject({ name: "Growth", monthly: 69900, yearly: 699000, trialDays: 14, featured: true, contactSales: false });
    expect(plan("pro").limits.events_per_month).toBeNull();
    expect(plan("free").limits.coupons_per_event).toBe(0);
    expect(plan("enterprise")).toMatchObject({ contactSales: true, monthly: 0, yearly: 0 });
    for (const p of data.plans) expect(p.features.map((f) => f.key)).toEqual(plan("free").features.map((f) => f.key));
    expect(plan("free").features).toHaveLength(21);
  });

  it("goes by the plan's key and ignores its id", () => {
    const withIds = plansResponse();
    withIds.plans.forEach((p, i) => (p.id = 100 + i));
    const d = parsePlans(withIds);
    expect(d.plans[2].key).toBe("growth");
    expect(d.plans[2]).not.toHaveProperty("id");
    expect(planCta(d.plans[2], "monthly", opts).href).toBe(`${CLUBS}/signup?plan=growth&cycle=monthly`);
  });

  it("drops what can't be shown, and is null when no plan is left", () => {
    const d = parsePlans({
      currency: "inr!",
      yearly_months_free: 14,
      plans: [
        { key: "a", name: "A", price_monthly_paise: -5, price_yearly_paise: "100", trial_days: 1.5, limits: { events_per_month: -1, storage_gb: null, "bad key!": 3 }, features: [{ key: "x" }, { key: "y", label: "Y", included: "yes" }] },
        { key: "a", name: "Again" },
        { name: "No key" },
        { key: "b" },
        null,
      ],
    });
    expect(d.currency).toBe("INR");
    expect(d.yearlyMonthsFree).toBeNull();
    expect(d.plans).toHaveLength(1);
    expect(d.plans[0]).toMatchObject({ monthly: null, yearly: null, trialDays: 0, limits: { storage_gb: null }, features: [{ key: "y", label: "Y", included: false }] });
    expect(parsePlans({ plans: [] })).toBeNull();
    expect(parsePlans(null)).toBeNull();
    expect(parsePlans("<html>")).toBeNull();
  });
});

describe("money", () => {
  it("shows whole rupees from paise, with the Indian grouping", () => {
    expect(formatMoney(1499000)).toBe("₹14,990");
    expect(formatMoney(29900)).toBe("₹299");
    expect(formatMoney(0)).toBe("₹0");
    expect(formatMoney(10000000)).toBe("₹1,00,000");
  });

  it("monthly: the monthly price, billed monthly", () => {
    expect(planPrice(plan("growth"), "monthly")).toEqual({ kind: "paid", cycle: "monthly", perMonth: 69900, billed: 69900, wasPerMonth: null, savingPerYear: 0 });
  });

  it("yearly: the year's price over twelve to the nearest rupee, what it bills, what it beats and saves", () => {
    expect(planPrice(plan("growth"), "yearly")).toEqual({ kind: "paid", cycle: "yearly", perMonth: 58300, billed: 699000, wasPerMonth: 69900, savingPerYear: 139800 });
    expect(planPrice(plan("starter"), "yearly")).toMatchObject({ perMonth: 24900, billed: 299000, savingPerYear: 59800 });
    expect(planPrice(plan("pro"), "yearly")).toMatchObject({ perMonth: 124900, billed: 1499000, savingPerYear: 299800 });
    expect(planPrice(plan("campus"), "yearly")).toMatchObject({ perMonth: 333300, billed: 3999000, savingPerYear: 799800 });
  });

  it("a free plan is ₹0 on either cycle; a plan to talk about has no price", () => {
    expect(planPrice(plan("free"), "yearly")).toMatchObject({ kind: "free", cycle: "monthly", perMonth: 0 });
    expect(planPrice(plan("enterprise"), "monthly")).toEqual({ kind: "contact", cycle: null });
  });

  it("a plan sold on one cycle shows that one whichever is picked", () => {
    const yearlyOnly = { ...plan("pro"), monthly: 0 };
    expect(planPrice(yearlyOnly, "monthly")).toMatchObject({ kind: "paid", cycle: "yearly", perMonth: 124900, wasPerMonth: null, savingPerYear: 0 });
    const monthlyOnly = { ...plan("pro"), yearly: 0 };
    expect(planPrice(monthlyOnly, "yearly")).toMatchObject({ cycle: "monthly", perMonth: 149900 });
  });

  it("says the yearly offer, the cheapest paid plan and the longest trial", () => {
    expect(yearlyOffer(2)).toBe("2 months free");
    expect(yearlyOffer(1)).toBe("1 month free");
    expect(yearlyOffer(null)).toBeNull();
    expect(cheapestPaid(data)).toBe(29900);
    expect(longestTrial(data)).toBe(14);
    expect(cheapestPaid({ plans: [plan("free")] })).toBeNull();
  });
});

describe("limits in plain words", () => {
  it("says a number with what it counts, and Unlimited for no cap", () => {
    expect(limitPhrase("events_per_month", 15)).toBe("15 events a month");
    expect(limitPhrase("events_per_month", 1)).toBe("1 event a month");
    expect(limitPhrase("registrations_per_event", 1000)).toBe("1,000 people per event");
    expect(limitPhrase("registrations_per_event", 1)).toBe("1 person per event");
    expect(limitPhrase("registrations_per_month", 100000)).toBe("1,00,000 registrations a month");
    expect(limitPhrase("committee_seats", 10)).toBe("10 team seats");
    // Storage was never metered and is no longer a limit, even from an older API that still sends it.
    expect(limitPhrase("storage_gb", 5)).toBeNull();
    expect(limitPhrase("events_per_month", null)).toBe("Unlimited events");
    expect(limitPhrase("committee_seats", null)).toBe("Unlimited team seats");
    expect(limitPhrase("merch_items_per_event", 0)).toBeNull();
    expect(limitPhrase("merch_items_per_event", undefined)).toBeNull();
    expect(limitPhrase("judges_per_event", 3)).toBe("3 judges per event");
  });

  it("never says a number of ticket types or coupons: neither is in the product yet", () => {
    for (const v of [null, 0, 3]) {
      expect(limitPhrase("ticket_types_per_event", v)).toBeNull();
      expect(limitPhrase("coupons_per_event", v)).toBeNull();
    }
    for (const p of data.plans) expect(headlineLimits(p, Object.keys(p.limits)).join(" ")).not.toMatch(/ticket type|coupon/i);
    expect(limitRows(data.plans).map((r) => r.key)).not.toContain("ticket_types_per_event");
    expect(limitRows(data.plans).map((r) => r.key)).not.toContain("coupons_per_event");
  });

  it("fills the table's cells: a number, Unlimited, or nothing for none", () => {
    expect(limitCell("events_per_month", null)).toBe("Unlimited");
    expect(limitCell("registrations_per_month", 100000)).toBe("1,00,000");
    expect(limitCell("merch_items_per_event", 0)).toBeNull();
  });

  it("shows no limit for a feature the plan doesn't have", () => {
    // Starter counts merch items but has no merch store; Free has a template count but no website.
    expect(planLimitCell(plan("starter"), "merch_items_per_event")).toBeNull();
    expect(planLimitCell(plan("pro"), "merch_items_per_event")).toBe("100");
    expect(planLimitCell(plan("free"), "website_templates")).toBeNull();
    expect(planLimitCell(plan("starter"), "website_templates")).toBe("3");
    expect(planLimitCell(plan("growth"), "website_templates")).toBe("Unlimited");
  });

  it("leads a card with events, people per event, registrations, seats and announcements — never storage", () => {
    expect(headlineLimits(plan("growth"))).toEqual(["15 events a month", "1,000 people per event", "8,000 registrations a month", "10 team seats", "60 announcements a month"]);
    expect(headlineLimits(plan("campus"))).toEqual(["Unlimited events", "20,000 people per event", "1,50,000 registrations a month", "60 team seats", "Unlimited announcements"]);
    expect(headlineLimits(plan("enterprise"))).toEqual(["Unlimited events", "Unlimited people per event", "Unlimited registrations", "Unlimited team seats", "Unlimited announcements"]);
    for (const p of data.plans) expect(headlineLimits(p).join(" ")).not.toMatch(/storage|GB/);
  });

  it("lists every limit in the table, the known ones first, then any new one", () => {
    const rows = limitRows([{ limits: { storage_gb: 1, events_per_month: 2, judges: 3 } }]);
    expect(rows).toEqual([
      { key: "events_per_month", label: "Events a month" },
      { key: "judges", label: "Judges" },
    ]);
    expect(limitRows(data.plans).map((r) => r.label)).toEqual([
      "Events a month",
      "People per event",
      "Registrations a month",
      "Team seats",
      "Announcements a month",
      "Merch items per event",
      "Website templates",
    ]);
  });
});

describe("features", () => {
  it("says what each plan adds over the one before, and what every plan has", () => {
    expect(addedFeatures(data.plans, 0).map((f) => f.key)).toEqual(["checkin", "certificates", "regform", "reviews", "threads"]);
    expect(addedFeatures(data.plans, 1).map((f) => f.key)).toEqual(["tickets", "website"]);
    expect(addedFeatures(data.plans, 2).map((f) => f.key)).toEqual(["quiz", "polls", "qa", "networking", "links", "report"]);
    expect(addedFeatures(data.plans, 3).map((f) => f.key)).toEqual(["merch", "swag", "badges", "roles", "teams", "judging", "rounds"]);
    expect(addedFeatures(data.plans, 4).map((f) => f.key)).toEqual(["finance"]);
    expect(addedFeatures(data.plans, 5)).toEqual([]);
    expect(commonFeatures(data.plans).map((f) => f.label)).toEqual([
      "Check-in at the door",
      "Certificates",
      "Custom registration questions",
      "Ratings and reviews",
      "Threads to your followers",
    ]);
  });

  it("groups the 21 features for the table, and puts any new one under More", () => {
    const sections = featureSections(data);
    expect(sections.map((s) => [s.title, s.rows.map((r) => r.key)])).toEqual([
      ["Every event", ["checkin", "certificates", "regform", "reviews", "threads"]],
      ["Ticketing", ["tickets", "merch", "swag", "badges"]],
      ["Live room", ["quiz", "polls", "qa", "networking"]],
      ["Grow your club", ["website", "links", "report", "roles"]],
      ["Run big events", ["teams", "judging", "rounds"]],
      ["Money", ["finance"]],
    ]);
    const more = plansResponse();
    more.plans.forEach((p) => p.features.push({ key: "sso", label: "Single sign-on", included: p.key === "enterprise" }));
    expect(featureSections(parsePlans(more)).at(-1)).toEqual({ key: "more", title: "More", rows: [{ key: "sso", label: "Single sign-on" }] });
  });
});

describe("where the buttons go", () => {
  it("sends each plan to the dashboard's sign-up with the plan and the cycle", () => {
    expect(signupUrl(CLUBS, "growth", "yearly")).toBe("https://club-dashboard.myotherapp.in/signup?plan=growth&cycle=yearly");
    expect(signupUrl(`${CLUBS}/`, "free", "nonsense")).toBe("https://club-dashboard.myotherapp.in/signup?plan=free&cycle=monthly");
    expect(loginUrl(CLUBS)).toBe("https://club-dashboard.myotherapp.in/login");
    expect(plansPageUrl(CLUBS)).toBe("https://club-dashboard.myotherapp.in/signup");
    expect(contactUrl("support@myotherapp.in")).toBe("mailto:support@myotherapp.in?subject=MyOtherApp%20for%20our%20institution");
  });

  it("free starts free; a trial says so and what follows; others are chosen; contact sales is a talk", () => {
    expect(planCta(plan("free"), "yearly", opts)).toEqual({ label: "Start free", href: `${CLUBS}/signup?plan=free&cycle=monthly`, kind: "free", note: null });
    expect(planCta(plan("growth"), "monthly", opts)).toEqual({
      label: "Start 14-day trial",
      href: `${CLUBS}/signup?plan=growth&cycle=monthly`,
      kind: "paid",
      note: "Then ₹699 a month",
    });
    expect(planCta(plan("growth"), "yearly", opts)).toMatchObject({ href: `${CLUBS}/signup?plan=growth&cycle=yearly`, note: "Then ₹6,990 a year" });
    expect(planCta(plan("starter"), "yearly", opts)).toEqual({ label: "Choose Starter", href: `${CLUBS}/signup?plan=starter&cycle=yearly`, kind: "paid", note: null });
    expect(planCta(plan("enterprise"), "yearly", opts)).toEqual({
      label: "Talk to us",
      href: "mailto:support@myotherapp.in?subject=MyOtherApp%20for%20our%20institution",
      kind: "contact",
      note: null,
    });
  });
});

describe("for search engines", () => {
  it("is a SoftwareApplication with an offer per plan and cycle, the one you talk to us about left out", () => {
    const ld = plansJsonLd(data, { url: "https://myotherapp.in/pricing", siteUrl: "https://myotherapp.in", description: "Plans." });
    expect(ld).toMatchObject({ "@type": "SoftwareApplication", name: "MyOtherApp for clubs", url: "https://myotherapp.in/pricing", description: "Plans." });
    expect(ld.offers).toHaveLength(9);
    expect(ld.offers.map((o) => o.name)).not.toContain(expect.stringMatching(/Enterprise/));
    expect(ld.offers[0]).toMatchObject({ name: "Free", price: 0, priceCurrency: "INR" });
    expect(ld.offers.find((o) => o.name === "Growth, monthly")).toMatchObject({
      price: 699,
      priceSpecification: { "@type": "UnitPriceSpecification", price: 699, priceCurrency: "INR", billingDuration: "P1M", unitText: "MONTH" },
    });
    expect(ld.offers.find((o) => o.name === "Growth, yearly")).toMatchObject({ price: 6990, priceSpecification: { billingDuration: "P1Y", unitText: "YEAR" } });
    expect(plansJsonLd(null, {})).toBeNull();
  });

  it("sums a plan up in a line for crawlers", () => {
    expect(planSummary(plan("growth"))).toBe(
      "₹699 a month or ₹6,990 a year. For an active club with a following. 15 events a month, 1,000 people per event, 8,000 registrations a month, 10 team seats, 60 announcements a month."
    );
    expect(planSummary(plan("enterprise"))).toMatch(/^Talk to us\. For large fests and institutions\. Unlimited events/);
    expect(planSummary(plan("free"))).toMatch(/^Free\. For a club just starting out\. 2 events a month/);
  });
});


describe("the free trial", () => {
  const t = parsePlans(trialPlansResponse());

  it("reads the trial offer and Enterprise's trial, and drops a trial that wants a card", () => {
    expect(t.trial).toEqual({ days: 14, planKey: "pro", planName: "Pro" });
    expect(t.enterpriseTrialDays).toBe(30);
    expect(data.trial).toBeNull();
    const card = trialPlansResponse();
    card.trial.card_required = true;
    expect(parsePlans(card).trial).toBeNull();
  });

  it("starts free with the trial, and cards the tiers and Enterprise", () => {
    expect(startFreeLabel(t)).toBe("Start free: 14 days of Pro, no card");
    expect(startFreeLabel(data)).toBe("Start free");
    expect(startFreeUrl(CLUBS, t)).toBe(`${CLUBS}/signup?plan=pro&cycle=monthly`);
    expect(cardPlans(t).map((p) => p.key)).toEqual(["starter", "growth", "pro", "enterprise"]);
    expect(cardPlans(data).map((p) => p.key)).toEqual(data.plans.map((p) => p.key));
    expect(freeAfterTrialLine(t)).toMatch(/^After your trial, your club keeps Free for as long as it likes: 2 events a month/);
    expect(freeAfterTrialLine(data)).toBeNull();
    expect(longestTrial(t)).toBe(14);
  });

  it("puts the trial on the paid buttons, and Enterprise's on its talk", () => {
    const o = { ...opts, trial: t.trial, enterpriseTrialDays: t.enterpriseTrialDays };
    const g = t.plans.find((p) => p.key === "growth");
    expect(planCta(g, "yearly", o)).toEqual({ label: "Start free trial", href: `${CLUBS}/signup?plan=growth&cycle=yearly`, kind: "paid", note: "14 days of Pro free, then ₹6,990 a year" });
    expect(planCta(t.plans.find((p) => p.key === "enterprise"), "monthly", o)).toMatchObject({ label: "Talk to us", note: "30-day trial included" });
  });

  it("offers the trial and every price in INR to search engines, and nothing about storage", () => {
    const ld = plansJsonLd(t, { url: "https://myotherapp.in/pricing", siteUrl: "https://myotherapp.in" });
    expect(ld.offers[0]).toMatchObject({ "@type": "Offer", name: "Pro, 14-day free trial", price: 0, priceCurrency: "INR", eligibleDuration: { value: 14, unitCode: "DAY" } });
    const named = ld.offers.map((o) => [o.name, o.price]);
    expect(named).toEqual(
      expect.arrayContaining([
        ["Starter, monthly", 299],
        ["Growth, monthly", 699],
        ["Pro, monthly", 1499],
        ["Growth, yearly", 6990],
      ])
    );
    expect(ld.offers.every((o) => o.priceCurrency === "INR")).toBe(true);
    expect(JSON.stringify(ld)).not.toMatch(/storage|Campus/i);
  });
});


describe("the monthly messages (the backend's message_quotas)", () => {
  const q = parsePlans(quotaPlansResponse());
  const qp = (key) => q.plans.find((p) => p.key === key);

  it("never reads a per-message price, even from an API that still sends one: extra messages aren't billed", () => {
    expect(qp("growth")).not.toHaveProperty("emailOverage");
    expect(qp("growth")).not.toHaveProperty("whatsappOverage");
    expect([formatPaisa(10), formatPaisa(100), formatPaisa(150), formatPaisa(0)]).toEqual(["₹0.10", "₹1", "₹1.50", "₹0"]);
  });

  it("says a plan's emails and WhatsApp a month in one line", () => {
    expect(messagesLine(qp("starter"))).toBe("1,000 emails / 50 WhatsApp a month");
    expect(messagesLine(qp("pro"))).toBe("20,000 emails / 1,000 WhatsApp a month");
    expect(messagesLine(qp("free"))).toBe("200 emails a month");
    expect(messagesLine(qp("enterprise"))).toBe("Custom email and WhatsApp limits");
    expect(messagesLine(plan("growth"))).toBeNull();
  });

  it("compares the message limits, with no row for an extra message's price", () => {
    const labels = limitRows(q.plans).map((r) => r.label);
    expect(labels.slice(-2)).toEqual(["Emails a month", "WhatsApp messages a month"]);
    expect(labels.filter((l) => /extra/i.test(l))).toEqual([]);
    const row = (key) => q.plans.map((p) => planLimitCell(p, key));
    expect(row("emails_per_month")).toEqual(["200", "1,000", "5,000", "20,000", "Custom"]);
    expect(row("whatsapp_per_month")).toEqual([null, "50", "250", "1,000", "Custom"]);
    expect(row("email_overage")).toEqual([null, null, null, null, null]);
  });

  it("tells search engines and crawlers, and keeps the JSON-LD valid", () => {
    const ld = plansJsonLd(q, { url: "https://myotherapp.in/pricing", siteUrl: "https://myotherapp.in" });
    expect(ld.offers.find((o) => o.name === "Starter, monthly").description).toBe("1,000 emails / 50 WhatsApp a month");
    expect(ld.offers.find((o) => o.name === "Free").description).toBe("200 emails a month");
    // Valid JSON, every offer a priced Offer, nothing undefined.
    const round = JSON.parse(JSON.stringify(ld));
    expect(round).toEqual(ld);
    for (const o of round.offers) {
      expect(o["@type"]).toBe("Offer");
      expect(typeof o.price).toBe("number");
      if ("description" in o) expect(typeof o.description).toBe("string");
    }
    expect(planSummary(qp("growth"))).toMatch(/5,000 emails \/ 250 WhatsApp a month\.$/);
    expect(JSON.stringify(ld)).not.toMatch(/extra|per email|per WhatsApp/i);
  });
});


describe("the pricing of 2026-10-25 (the backend's pricing_adjust)", () => {
  const d = parsePlans(pricedPlansResponse());
  const dp = (key) => d.plans.find((p) => p.key === key);


  it("says each plan's promotional WhatsApp inside its WhatsApp, never on a row of its own", () => {
    expect(messagesLine(dp("pro"))).toBe("20,000 emails / 1,000 WhatsApp (up to 200 promotional) a month");
    expect(messagesLine(dp("starter"))).toBe("1,000 emails / 50 WhatsApp (up to 10 promotional) a month");
    expect(messagesLine(dp("free"))).toBe("200 emails a month");
    expect(promotionalNote(dp("enterprise"))).toBe("");
    const labels = limitRows(d.plans).map((r) => r.label);
    expect(labels).not.toContain("Whatsapp marketing per month");
    expect(labels.filter((l) => /promotional/i.test(l))).toEqual([]);
    const row = (key) => d.plans.map((p) => planLimitCell(p, key));
    expect(row("whatsapp_per_month")).toEqual([null, "50 (up to 10 promotional)", "250 (up to 50 promotional)", "1,000 (up to 200 promotional)", "Custom"]);
  });

  it("names AI actions as a limit, and none on a plan without AI assist", () => {
    expect(limitRows(d.plans).map((r) => r.label)).toContain("AI actions a month");
    expect(d.plans.map((p) => planLimitCell(p, "ai_actions_per_month"))).toEqual([null, "20", "150", "500", "Unlimited"]);
  });

  it("reads the free trial's own allowances and says them in a line", () => {
    expect(d.trial).toEqual({
      days: 14, planKey: "pro", planName: "Pro",
      allowances: { emails_per_month: 2000, whatsapp_per_month: 50, whatsapp_marketing_per_month: 10, ai_actions_per_month: 50 },
    });
    expect(trialAllowancesLine(d)).toBe("The 14-day Pro trial has everything in Pro, with 2,000 emails, 50 WhatsApp messages and 50 AI actions a month.");
    // An API from before the allowances: the trial reads as before, and nothing is said.
    expect(trialAllowancesLine(parsePlans(trialPlansResponse()))).toBeNull();
    const ld = plansJsonLd(d, { url: "https://myotherapp.in/pricing", siteUrl: "https://myotherapp.in" });
    expect(ld.offers[0].description).toBe(
      "14 days of Pro free for every new club, no card needed. The 14-day Pro trial has everything in Pro, with 2,000 emails, 50 WhatsApp messages and 50 AI actions a month",
    );
  });
});


describe("top-up packs (GET /api/v1/credit-packs)", () => {
  const packs = parseCreditPacks(creditPacksResponse());

  it("reads the owner's default packs, email first, each channel's in the API's order", () => {
    expect(packs).toMatchObject({ currency: "INR", includesGst: true, validityMonths: 12 });
    expect(packs.channels.map((c) => c.channel)).toEqual(["email", "whatsapp"]);
    expect(packs.channels[0].packs.map((p) => [p.quantity, p.price])).toEqual([[1000, 9900], [5000, 44900], [20000, 159900]]);
    expect(packs.channels[1].packs.map((p) => [p.quantity, p.price])).toEqual([[100, 15000], [500, 69900], [2000, 259900]]);
  });

  it("says each pack's size, price and what a message comes to", () => {
    const [email, whatsapp] = packs.channels;
    expect(email.packs.map((p) => [packQuantity(p), packPrice(p), packUnit(p)])).toEqual([
      ["1,000 emails", "₹99", "about ₹0.10 each"],
      ["5,000 emails", "₹449", "about ₹0.09 each"],
      ["20,000 emails", "₹1,599", "about ₹0.08 each"],
    ]);
    expect(whatsapp.packs.map((p) => [packQuantity(p), packPrice(p), packUnit(p)])).toEqual([
      ["100 WhatsApp messages", "₹150", "₹1.50 each"],
      ["500 WhatsApp messages", "₹699", "about ₹1.40 each"],
      ["2,000 WhatsApp messages", "₹2,599", "about ₹1.30 each"],
    ]);
    expect([packChannelTitle("email"), packChannelTitle("whatsapp")]).toEqual(["Email credits", "WhatsApp credits"]);
    expect(packQuantity({ channel: "email", quantity: 1, price: 100 })).toBe("1 email");
    expect(packPrice({ channel: "email", quantity: 1, price: 9950 })).toBe("₹99.50");
    expect(packUnit({ channel: "email", quantity: 1000, price: 100 })).toBe("under ₹0.01 each");
  });

  it("puts GST and how long credits last in the small print, and says how credits are used", () => {
    expect(packsFinePrint(packs)).toBe("Prices include GST. Credits last 12 months from purchase. Buy them any time from Billing in your clubs dashboard.");
    expect(packsFinePrint({ ...packs, includesGst: null, validityMonths: null })).toBe("Buy them any time from Billing in your clubs dashboard.");
    expect(packsFinePrint({ ...packs, includesGst: false, validityMonths: 1 })).toMatch(/^Prices are before GST\. Credits last 1 month from purchase\./);
    expect(CREDITS_MODEL.join(" ")).toMatch(/plan's own .* first, then the credits you've bought, the earliest to expire first/);
    expect(CREDITS_MODEL.join(" ")).toMatch(/announcements and reminders pause; tickets, certificates and payment messages always go/);
  });

  it("reads defensively: unknown channels, nonsense, repeats and empty answers", () => {
    const d = creditPacksResponse();
    d.packs.push(
      { id: 90, channel: "sms", quantity: 100, price_paise: 1000 },
      { id: 91, channel: "email", quantity: 0, price_paise: 1000 },
      { id: 92, channel: "email", quantity: 10, price_paise: -5 },
      { id: 93, channel: "email", quantity: 1.5, price_paise: 100 },
      { ...d.packs[0], id: 94 },
      "nonsense",
      null,
    );
    d.currency = "rupees";
    const out = parseCreditPacks(d);
    expect(out.currency).toBe("INR");
    expect(out.channels[0].packs).toHaveLength(3);
    expect(out.channels.flatMap((c) => c.packs).some((p) => p.channel === "sms")).toBe(false);
    // One channel only: the other is left out, not shown empty.
    const emailOnly = creditPacksResponse();
    emailOnly.packs = emailOnly.packs.filter((p) => p.channel === "email");
    expect(parseCreditPacks(emailOnly).channels.map((c) => c.channel)).toEqual(["email"]);
    for (const nothing of [null, undefined, "<html>", [], {}, { packs: [] }, { packs: [{ channel: "sms", quantity: 1, price_paise: 1 }] }]) {
      expect(parseCreditPacks(nothing)).toBeNull();
    }
  });

  it("the prepaid plans answer (overage prices null) shows no extra-message price anywhere", () => {
    const d = parsePlans(prepaidPlansResponse());
    const ld = plansJsonLd(d, { url: "https://myotherapp.in/pricing", siteUrl: "https://myotherapp.in" });
    expect(JSON.stringify(ld)).not.toMatch(/extra|per email|per WhatsApp/i);
    expect(limitRows(d.plans).map((r) => r.label).filter((l) => /extra/i.test(l))).toEqual([]);
    for (const p of d.plans) expect(planSummary(p)).not.toMatch(/extra/i);
  });
});
