import { SitePage } from "@/components/discover/chrome";
import { PricingView } from "@/components/discover/pricingpage";
import { SITE_URL } from "@/config";
import { PRICING_PAGE } from "@/content/forclubs";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { pageMetadata } from "@/seo/metadata";
import { readOr } from "@/server/build";
import { getPlans } from "@/server/discover";
import { plansJsonLd } from "@/utils/pricing";

/*
 * Pricing. SERVER-RENDERED, statically regenerated (ISR, every five
 * minutes) from the public plans (GET /api/v1/plans): every card and the
 * whole comparison table are in the HTML, with the plans as a
 * SoftwareApplication and an Offer per plan and cycle. The monthly/yearly
 * switch is the island.
 */
export const revalidate = 300;

export const metadata = pageMetadata({ absoluteTitle: PRICING_PAGE.title, description: PRICING_PAGE.description, path: PRICING_PAGE.path });

export default async function Pricing() {
  const plans = await readOr(getPlans(), null);
  return (
    <SitePage>
      {plans ? <JsonLd data={plansJsonLd(plans, { url: `${SITE_URL}${PRICING_PAGE.path}`, siteUrl: SITE_URL, description: PRICING_PAGE.description })} /> : null}
      <PricingView plans={plans} />
    </SitePage>
  );
}
