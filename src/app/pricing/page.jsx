import ClientPage from "../_client/pages";
import { PRICING_PAGE } from "@/content/forclubs";
import { pageMetadata } from "@/seo/metadata";

/* Pricing. CLIENT PAGE (@/components/discover/pricingpage). */
export const metadata = pageMetadata({ absoluteTitle: PRICING_PAGE.title, description: PRICING_PAGE.description, path: PRICING_PAGE.path });

export default function Pricing() {
  return <ClientPage name="pricing" />;
}
