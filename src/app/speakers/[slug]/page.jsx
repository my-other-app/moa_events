import { notFound, permanentRedirect } from "next/navigation";
import { SitePage } from "@/components/discover/chrome";
import { SpeakerView } from "@/components/speakers/speakerpage";
import { isDemoSpeakerPage, unlessDemo } from "@/seo/demo";
import { speakerMetadata } from "@/seo/metadata";
import { JsonLd } from "@/seo/JsonLd.jsx";
import { stableSpeakerPage } from "@/seo/stabilize";
import { speakerStructuredData } from "@/seo/structured";
import { speakerPagePath } from "@/seo/urls";
import { getSpeakerPage } from "@/server/speakers";

/*
 * /speakers/{slug}: a speaker's page (feature-register/speakers-contract.md).
 * SERVER-RENDERED, statically regenerated (ISR): made on its first visit,
 * made again at most once a minute. Their name, headline, photo, bio, links,
 * city, topics and talks (upcoming, then past; published, listed events
 * only) are in the HTML, with ProfilePage (a Person) and BreadcrumbList
 * structured data; Follow is the island.
 *
 * A speaker whose every talk is a made-up demo club's says noindex, follow
 * (src/seo/demo.js), as those events do.
 *
 * A profile merged into another answers {redirect_slug}: a 308 to that one's
 * page. Hidden, unknown, or an API without speakers (404) → not-found.jsx.
 */
export const revalidate = 60;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = await getSpeakerPage(slug);
  if (!page || page.redirect) return { title: "Speaker not found", robots: { index: false, follow: true } };
  return unlessDemo(speakerMetadata(page), isDemoSpeakerPage(page));
}

export default async function SpeakerRoute({ params }) {
  const { slug } = await params;
  const page = await getSpeakerPage(slug);
  if (!page) notFound();
  if (page.redirect) permanentRedirect(speakerPagePath(page.redirect));
  if (page.slug !== slug) permanentRedirect(speakerPagePath(page.slug));
  return (
    <SitePage>
      <JsonLd data={speakerStructuredData(page)} />
      <SpeakerView page={stableSpeakerPage(page)} />
    </SitePage>
  );
}
