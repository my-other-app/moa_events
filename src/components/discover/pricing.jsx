"use client";

import { useState } from "react";
import { Link } from "@/lib/router";
import { usePlans } from "@/utils/plans";
import { CLUBS_URL, CONTACT_EMAIL } from "@/config";
import {
  addedFeatures,
  cardPlans,
  featureSections,
  freeAfterTrialLine,
  freePlan,
  formatMoney,
  headlineLimits,
  includes,
  limitRows,
  messagesLine,
  overageLine,
  planCta,
  planLimitCell,
  planPrice,
  plansPageUrl,
  signupUrl,
  yearlyOffer,
} from "@/utils/pricing";
import Icon from "./icons";

/** A card lists everything its plan adds up to this many, and otherwise five and "and N more". */
const ADDS_ALL = 6;
const ADDS_SOME = 5;

/** Monthly or yearly: two buttons, the one in force pressed. The yearly one says what it saves. */
export function CycleSwitch({ cycle, onChange, offer }) {
  return (
    <div className="pr-cycle" role="group" aria-label="Billing period">
      <button type="button" aria-pressed={cycle === "monthly"} onClick={() => onChange("monthly")}>
        Monthly
      </button>
      <button type="button" aria-pressed={cycle === "yearly"} onClick={() => onChange("yearly")}>
        Yearly
        {offer ? <span className="pr-cycle-offer">{offer}</span> : null}
      </button>
    </div>
  );
}

/** The big number on a card and the line under it: what is billed, and the saving on a year. */
function PlanPrice({ plan, cycle, currency, enterpriseTrialDays = null }) {
  const p = planPrice(plan, cycle);
  if (p.kind === "contact") {
    return (
      <>
        <p className="pr-price">
          <span className="pr-amount">Custom</span>
        </p>
        <p className="pr-billed">
          {enterpriseTrialDays ? "Custom pricing, a trial included: talk to us" : "A plan and a price made for your institution"}
        </p>
      </>
    );
  }
  let billed;
  if (p.kind === "free") billed = "Free, with no time limit";
  else if (p.cycle === "yearly")
    billed = (
      <>
        {formatMoney(p.billed, currency)} billed yearly
        {p.savingPerYear ? <span className="pr-save">Save {formatMoney(p.savingPerYear, currency)}</span> : null}
      </>
    );
  else billed = "Billed monthly";
  return (
    <>
      <p className="pr-price">
        {p.wasPerMonth ? (
          <s className="pr-was">
            <span className="dc-sr">Was </span>
            {formatMoney(p.wasPerMonth, currency)}
          </s>
        ) : null}
        <span className="pr-amount">{formatMoney(p.perMonth, currency)}</span>
        <span className="pr-per">/month</span>
      </p>
      <p className="pr-billed">{billed}</p>
    </>
  );
}

/** A link inside the site or to a spot on this page; the router handles the first. */
function More({ href, children }) {
  return href.startsWith("#") ? (
    <a className="pr-plan-more" href={href}>
      {children}
    </a>
  ) : (
    <Link className="pr-plan-more" to={href}>
      {children}
    </Link>
  );
}

function PlanCard({ plans, index, cycle, currency, moreHref, trial = null, enterpriseTrialDays = null }) {
  const plan = plans[index];
  const cta = planCta(plan, cycle, { clubsUrl: CLUBS_URL, contactEmail: CONTACT_EMAIL, currency, trial, enterpriseTrialDays });
  // The limits a card leads with, then the month's emails and WhatsApp, and what more of them costs.
  const limits = [...headlineLimits(plan), messagesLine(plan)].filter(Boolean);
  const extra = overageLine(plan, currency);
  const adds = addedFeatures(plans, index);
  const shown = adds.length > ADDS_ALL ? adds.slice(0, ADDS_SOME) : adds;
  const before = index > 0 ? plans[index - 1].name : null;
  const headingId = `pr-plan-${plan.key}`;
  const button = plan.featured ? "dc-btn dc-btn--accent" : cta.kind === "paid" ? "dc-btn" : "dc-btn dc-btn--ghost";
  return (
    <li className={`pr-plan${plan.featured ? " is-featured" : ""}`} aria-labelledby={headingId}>
      {plan.featured ? <p className="pr-plan-flag">Most popular</p> : null}
      <h3 id={headingId} className="pr-plan-name">
        {plan.name}
      </h3>
      {plan.tagline ? <p className="pr-plan-tagline">{plan.tagline}</p> : null}
      <PlanPrice plan={plan} cycle={cycle} currency={currency} enterpriseTrialDays={enterpriseTrialDays} />
      <a className={`${button} dc-btn--block pr-plan-cta`} href={cta.href} aria-describedby={headingId}>
        {cta.label}
      </a>
      <p className={`pr-plan-note${cta.note ? "" : " is-empty"}`}>{cta.note || "\u00a0"}</p>
      {limits.length ? (
        <ul className="pr-plan-limits" aria-label={`${plan.name} limits`}>
          {limits.map((l) => (
            <li key={l}>
              <Icon name="check" size={16} />
              {l}
            </li>
          ))}
        </ul>
      ) : null}
      {extra ? <p className="pr-plan-extra">{extra}</p> : null}
      {shown.length ? (
        <div className="pr-plan-adds">
          <p>{before ? `Everything in ${before}, plus:` : "Includes:"}</p>
          <ul>
            {shown.map((f) => (
              <li key={f.key}>{f.label}</li>
            ))}
          </ul>
          {adds.length > shown.length ? (
            <More href={moreHref}>
              and {adds.length - shown.length} more <Icon name="arrowRight" size={14} />
            </More>
          ) : null}
        </div>
      ) : before ? (
        <div className="pr-plan-adds">
          <p>Everything in {before}</p>
        </div>
      ) : null}
    </li>
  );
}

/** A short price for the table's header: "₹583/mo", "₹0", "Custom". */
function ShortPrice({ plan, cycle, currency }) {
  const p = planPrice(plan, cycle);
  if (p.kind === "contact") return <span className="pr-th-price">Custom</span>;
  return (
    <span className="pr-th-price">
      {formatMoney(p.perMonth, currency)}
      {p.kind === "paid" ? (
        <>
          <span aria-hidden="true">/mo</span>
          <span className="dc-sr"> a month</span>
        </>
      ) : null}
    </span>
  );
}

const Dash = () => (
  <>
    <span className="pr-dash" aria-hidden="true">
      —
    </span>
    <span className="dc-sr">Not included</span>
  </>
);

/**
 * Every limit and feature, plan by plan. On a desk the plans' row stays at
 * the top while the rows scroll under it; on a phone the table scrolls
 * sideways with the row names held at the left.
 */
export function CompareTable({ data, cycle }) {
  const { plans, currency } = data;
  const rows = limitRows(plans);
  const sections = featureSections(data);
  const cols = plans.length + 1;
  const cell = (p, extra = "") => `${p.featured ? "is-featured" : ""} ${extra}`.trim() || undefined;
  return (
    <section id="compare" className="pr-compare" aria-labelledby="pr-compare-title">
      <div className="pr-compare-head">
        <h2 id="pr-compare-title">Compare every plan</h2>
        <p>Every limit and every feature, side by side{cycle === "yearly" ? ", at the yearly price per month" : ""}.</p>
      </div>
      <div className="pr-table-wrap" role="region" aria-label="Plan comparison" tabIndex={0}>
        <table className="pr-table">
          <thead>
            <tr>
              <td className="pr-table-corner">
                <span className="pr-scroll-hint" aria-hidden="true">
                  Swipe to see every plan <Icon name="arrowRight" size={14} />
                </span>
              </td>
              {plans.map((p) => (
                <th key={p.key} scope="col" className={cell(p)}>
                  <span className="pr-th-name">{p.name}</span>
                  <ShortPrice plan={p} cycle={cycle} currency={currency} />
                </th>
              ))}
            </tr>
          </thead>
          {rows.length ? (
            <tbody>
              <tr className="pr-table-group">
                <th scope="colgroup" colSpan={cols}>
                  <span>Limits</span>
                </th>
              </tr>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  {plans.map((p) => {
                    const v = planLimitCell(p, r.key, currency);
                    return (
                      <td key={p.key} className={cell(p, v === "Unlimited" ? "is-unlimited" : "")}>
                        {v ?? <Dash />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ) : null}
          {sections.map((s) => (
            <tbody key={s.key}>
              <tr className="pr-table-group">
                <th scope="colgroup" colSpan={cols}>
                  <span>{s.title}</span>
                </th>
              </tr>
              {s.rows.map((f) => (
                <tr key={f.key}>
                  <th scope="row">{f.label}</th>
                  {plans.map((p) => (
                    <td key={p.key} className={cell(p)}>
                      {includes(p, f.key) ? (
                        <>
                          <Icon name="check" size={18} className="pr-tick" />
                          <span className="dc-sr">Included</span>
                        </>
                      ) : (
                        <Dash />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>
            <tr>
              <td />
              {plans.map((p) => {
                const cta = planCta(p, cycle, { clubsUrl: CLUBS_URL, contactEmail: CONTACT_EMAIL, currency, trial: data.trial, enterpriseTrialDays: data.enterpriseTrialDays });
                return (
                  <td key={p.key} className={cell(p)}>
                    <a className={`dc-btn dc-btn--sm ${p.featured ? "dc-btn--accent" : cta.kind === "paid" ? "" : "dc-btn--ghost"}`} href={cta.href}>
                      {cta.label}
                      <span className="dc-sr">, {p.name}</span>
                    </a>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function Loading() {
  return (
    <div className="pr-loading" aria-busy="true">
      <p className="dc-sr" role="status">
        Pricing is loading…
      </p>
      <ul className="pr-plans" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="pr-plan pr-plan--skel">
            <span className="dc-skel" style={{ width: "40%", height: 26 }} />
            <span className="dc-skel" style={{ width: "80%", height: 14, marginTop: 10 }} />
            <span className="dc-skel" style={{ width: "55%", height: 48, marginTop: 22 }} />
            <span className="dc-skel" style={{ width: "100%", height: 44, marginTop: 22 }} />
            {[0, 1, 2, 3].map((j) => (
              <span key={j} className="dc-skel" style={{ width: `${70 - j * 8}%`, height: 14, marginTop: 14 }} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** When the plans can't be had: say so calmly and point to where they can be seen. */
function Unavailable({ onRetry }) {
  return (
    <div className="pr-unavailable" role="status">
      <span className="dc-feature-icon" aria-hidden="true">
        <Icon name="creditCard" size={20} />
      </span>
      <div>
        <h3>Pricing is loading…</h3>
        <p>It&rsquo;s taking longer than it should. Every plan and its price is also on the sign-up page of the clubs dashboard.</p>
        <div className="pr-unavailable-actions">
          <a className="dc-btn" href={plansPageUrl(CLUBS_URL)}>
            See plans in the dashboard
          </a>
          <button type="button" className="dc-btn dc-btn--ghost" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The plans: a monthly/yearly switch, a card for each plan (the featured
 * one marked "Most popular") and, with `compare="table"`, the full
 * comparison under them; otherwise a link to it, and on a phone the cards
 * keep to their limits (the rest is a tap away). Prices only ever come from
 * the API.
 *
 * `data` is parsePlans' result as the server read it: the whole block is
 * rendered on the server, and this island only switches the cycle. Null
 * when the server couldn't read them: the browser asks itself.
 */
export function Pricing({ data = null, compare = "table", moreHref = "#compare", compareHref = "/pricing#compare" }) {
  const plans = usePlans(data);
  const [cycle, setCycle] = useState("monthly");
  if (plans.status === "loading") return <Loading />;
  if (plans.status !== "ready" || !plans.data) return <Unavailable onRetry={plans.retry} />;
  const shown = plans.data;
  const offer = yearlyOffer(shown.yearlyMonthsFree);
  const hasYearly = shown.plans.some((p) => p.yearly > 0 && p.monthly > 0);
  // With the free trial on offer, the cards are the tiers and Enterprise;
  // Free is what a club keeps after the trial, said under them.
  const cards = cardPlans(shown);
  const afterTrial = freeAfterTrialLine(shown);
  const free = freePlan(shown);
  return (
    <div className={`pr-pricing${compare === "table" ? "" : " pr-pricing--brief"}`}>
      {hasYearly ? <CycleSwitch cycle={cycle} onChange={setCycle} offer={offer} /> : null}
      <ul className={`pr-plans pr-plans--${cards.length}`}>
        {cards.map((p, i) => (
          <PlanCard
            key={p.key}
            plans={cards}
            index={i}
            cycle={cycle}
            currency={shown.currency}
            moreHref={compare === "table" ? moreHref : compareHref}
            trial={shown.trial}
            enterpriseTrialDays={shown.enterpriseTrialDays}
          />
        ))}
      </ul>
      {afterTrial && free ? (
        <div className="pr-free-after" role="note">
          <span className="dc-feature-icon" aria-hidden="true">
            <Icon name="check" size={18} />
          </span>
          <p>
            <strong>Free after the trial.</strong> {afterTrial}
          </p>
          <a className="dc-btn dc-btn--ghost dc-btn--sm" href={signupUrl(CLUBS_URL, shown.trial.planKey, "monthly")}>
            Start free
          </a>
        </div>
      ) : null}
      {shown.currency === "INR" ? <p className="pr-fineprint">Prices are in Indian rupees.</p> : null}
      {compare === "table" ? (
        <CompareTable data={shown} cycle={cycle} />
      ) : (
        <p className="pr-compare-link">
          <Link className="dc-btn dc-btn--ghost" to={compareHref}>
            Compare every plan in detail <Icon name="arrowRight" size={16} />
          </Link>
        </p>
      )}
    </div>
  );
}
