import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { SITE_URL } from "@/config";
import { PRICING_PAGE } from "@/content/forclubs";
import { useJsonLd, usePageSeo } from "@/utils/meta";
import { usePlans } from "@/utils/plans";
import { commonFeatures, plansJsonLd, yearlyOffer } from "@/utils/pricing";
import { SitePage } from "./chrome";
import { ClubFaq, ClubsCta } from "./clubsparts";
import { Pricing } from "./pricing";
import Icon from "./icons";
import "@/styles/discover.css";
import "@/styles/pages.css";
import "@/styles/forclubs.css";
import "@/styles/pricing.css";

const COMMON_SHOWN = 7;

/**
 * The plans on a page of their own: the cards, every limit and feature side
 * by side, the questions, and the way in. /pricing#compare lands on the
 * table once the plans are in.
 */
export default function PricingPage() {
  usePageSeo({ title: PRICING_PAGE.title, description: PRICING_PAGE.description, path: PRICING_PAGE.path });
  const plans = usePlans();
  useJsonLd(plans.data ? plansJsonLd(plans.data, { url: `${SITE_URL}${PRICING_PAGE.path}`, siteUrl: SITE_URL, description: PRICING_PAGE.description }) : null);
  const { hash } = useLocation();

  useEffect(() => {
    if (plans.status !== "ready" || hash.length < 2) return;
    let id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    document.getElementById(id)?.scrollIntoView?.();
  }, [plans.status, hash]);

  const offer = yearlyOffer(plans.data?.yearlyMonthsFree);
  const common = plans.data ? commonFeatures(plans.data.plans).slice(0, COMMON_SHOWN) : [];

  return (
    <SitePage>
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

        <Pricing plans={plans} compare="table" />

        <ClubFaq yearlyMonthsFree={plans.data?.yearlyMonthsFree ?? null} />
        <ClubsCta />
      </div>
    </SitePage>
  );
}
