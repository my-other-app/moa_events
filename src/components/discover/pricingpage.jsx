import { Link } from "@/lib/router";
import { commonFeatures, yearlyOffer } from "@/utils/pricing";
import { ClubFaq, ClubsCta } from "./clubsparts";
import { Pricing } from "./pricing";
import Icon from "./icons";

const COMMON_SHOWN = 7;

/**
 * The plans on a page of their own: the cards, every limit and feature side
 * by side, the questions, and the way in. Rendered on the server
 * (src/app/pricing/page.jsx) from the plans it read (`plans`, null when it
 * couldn't: the cards then load in the browser); /pricing#compare lands on
 * the table, which is in the HTML.
 */
export function PricingView({ plans = null }) {
  const offer = yearlyOffer(plans?.yearlyMonthsFree);
  const common = plans ? commonFeatures(plans.plans).slice(0, COMMON_SHOWN) : [];

  return (
    <div className="dc-wrap">
      <section className="pr-hero" aria-labelledby="pr-title">
        <p className="dc-eyebrow">Pricing for clubs</p>
        <h1 id="pr-title">
          Plans for <span className="dc-hl">every club.</span>
        </h1>
        <p className="pr-hero-lede">Start free, and move up when your events grow.{offer ? ` Pay yearly and get ${offer}.` : ""}</p>
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

      <ClubFaq yearlyMonthsFree={plans?.yearlyMonthsFree ?? null} />
      <ClubsCta />
    </div>
  );
}
