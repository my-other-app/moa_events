import { SitePage } from "@/components/discover/chrome";
import { AboutView } from "@/components/discover/aboutpage";
import { ABOUT } from "@/content/about";
import { pageMetadata } from "@/seo/metadata";
import { readOr } from "@/server/build";
import { getHome } from "@/server/discover";

/*
 * About. SERVER-RENDERED, statically regenerated (ISR, at most once a
 * minute, as the home page whose numbers it shows): its words are in
 * @/content/about, its live numbers (upcoming events, clubs, cities) are
 * the home page's.
 */
export const revalidate = 60;

export const metadata = pageMetadata({ absoluteTitle: ABOUT.title, description: ABOUT.description, path: ABOUT.path });

export default async function About() {
  const home = await readOr(getHome(), null);
  return (
    <SitePage>
      <AboutView stats={home?.stats || null} />
    </SitePage>
  );
}
