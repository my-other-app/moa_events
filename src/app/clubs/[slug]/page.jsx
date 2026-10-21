import { notFound, permanentRedirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { ClubView } from "@/components/discover/clubpage";
import { isDemoClubPage, unlessDemo } from "@/seo/demo";
import { clubMetadata } from "@/seo/metadata";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { stableClubPage } from "@/seo/stabilize";
import { clubStructuredData } from "@/seo/structured";
import { getClubPage } from "@/server/discover";
import { preconnectMedia } from "@/server/hints";

/*
 * /clubs/{slug}: a club's page. SERVER-RENDERED, statically regenerated
 * (ISR, every minute at most): who they are, their upcoming and past
 * events, posts, team and partners are in the HTML, with the club's
 * Organization (its upcoming events inside) and BreadcrumbList structured
 * data, and its own RSS feed advertised. Follow, the visit count and "Show
 * more" are client islands. Unknown → ./not-found.jsx (a real 404).
 * A made-up demo club says noindex, follow (src/seo/demo.js).
 */
export const revalidate = 60;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await getClubPage(slug);
  if (!data) return { title: "Club not found", robots: { index: false, follow: true } };
  return unlessDemo(clubMetadata(data), isDemoClubPage(data));
}

export default async function ClubRoute({ params }) {
  const { slug } = await params;
  const data = await getClubPage(slug);
  if (!data) notFound();
  if (data.club.slug && data.club.slug !== slug) permanentRedirect(`/clubs/${encodeURIComponent(data.club.slug)}`);
  preconnectMedia(data.club.cover, data.club.logo, ...data.upcoming.map((e) => e.poster));
  return (
    <SitePage>
      <JsonLd data={clubStructuredData(data)} />
      <ClubView data={stableClubPage(data)} />
    </SitePage>
  );
}
