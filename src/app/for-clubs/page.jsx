import { SitePage } from "@/components/discover/chrome";
import { ForClubsView } from "@/components/discover/forclubspage";
import { SITE_URL } from "@/config";
import { FOR_CLUBS } from "@/content/forclubs";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { pageMetadata } from "@/seo/metadata";
import { stableHome } from "@/seo/stabilize";
import { readOr } from "@/server/build";
import { getHome, getPlans } from "@/server/discover";
import { plansJsonLd } from "@/utils/pricing";

/*
 * For clubs. SERVER-RENDERED, statically regenerated (ISR, at most once a
 * minute, for the live numbers; the plans are read every five): what clubs
 * get, how to get on, the plans (cards, from /api/v1/plans), the questions
 * and the live numbers are in the HTML, with the plans' structured data.
 * The billing switch is the island; the drawings are client components
 * (small to describe, big to draw).
 */
export const revalidate = 60;

export const metadata = pageMetadata({ absoluteTitle: FOR_CLUBS.title, description: FOR_CLUBS.description, path: FOR_CLUBS.path });

export default async function ForClubs() {
  const [plans, home] = await Promise.all([readOr(getPlans(), null), readOr(getHome(), null)]);
  return (
    <SitePage>
      {plans ? <JsonLd data={plansJsonLd(plans, { url: `${SITE_URL}${FOR_CLUBS.path}`, siteUrl: SITE_URL, description: FOR_CLUBS.description })} /> : null}
      <ForClubsView plans={plans} home={home ? stableHome(home) : null} />
    </SitePage>
  );
}
