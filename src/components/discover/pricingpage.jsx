import { Link } from "@/lib/router";
import { CLUBS_URL } from "@/config";
import { commonFeatures, startFreeLabel, startFreeUrl, yearlyOffer } from "@/utils/pricing";
import { ClubFaq, ClubsCta } from "./clubsparts";
import { CreditPacks } from "./creditpacks";
import { Pricing } from "./pricing";
import Icon from "./icons";

const COMMON_SHOWN = 7;

/**
 * The plans on a page of their own: the cards, every limit and feature side
 * by side, the top-up packs, the questions, and the way in. Rendered on the
 * server (src/app/pricing/page.jsx) from the plans it read (`plans`, null
 * when it couldn't: the cards then load in the browser) and the packs
 * (`packs`, parseCreditPacks' result; null: no packs section);
 * /pricing#compare lands on the table and /pricing#top-ups on the packs,
 * both in the HTML.
 */
export function PricingView({ plans = null, packs = null }) {
  const offer = yearlyOffer(plans?.yearlyMonthsFree);
  const common = plans ? commonFeatures(plans.plans).slice(0, COMMON_SHOWN) : [];
  const trial = plans?.trial ?? null;

  return (
    <div className="dc-wrap">
      <section className="pr-hero" aria-labelledby="pr-title">
        <p className="dc-eyebrow">Pricing for clubs</p>
        <h1 id="pr-title">
          Plans for <span className="dc-hl">every club.</span>
        </h1>
        <p className="pr-hero-lede">
          {trial
            ? `Every new club gets ${trial.days} days of ${trial.planName} free, no card needed. Then pick the plan that fits, or keep a free plan for small events.`
            : "Start free, and move up when your events grow."}
          {offer ? ` Pay yearly and get ${offer}.` : ""}
        </p>
        <div className="pr-hero-cta">
          <a className="dc-btn dc-btn--accent" href={startFreeUrl(CLUBS_URL, plans)}>
            {startFreeLabel(plans)} <Icon name="arrowRight" size={16} />
          </a>
          {trial ? <p>Billing starts only if you pick a plan, and only when the trial ends.</p> : null}
        </div>
        {common.length ? (
          <div className="pr-hero-common">
            <p>Every plan comes with</p>
            <ul>
              {common.map((f) => (
                <li key={f.key}>
                  <Icon name="check" size={14} />
                  {f.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="pr-hero-more">
          New here?{" "}
          <Link className="dc-link" to="/for-clubs">
            See everything clubs get <Icon name="arrowRight" size={14} />
          </Link>
        </p>
      </section>

      <Pricing data={plans} compare="table" />

      <CreditPacks data={packs} />

      <ClubFaq yearlyMonthsFree={plans?.yearlyMonthsFree ?? null} />
      <ClubsCta />
    </div>
  );
}
