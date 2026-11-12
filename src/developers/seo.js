/**
 * What search engines and link previews read off the developer docs. Only
 * the overview (https://myotherapp.in/developers) is public and indexed,
 * with its canonical and its structured data (a TechArticle about the API,
 * and the Home › Developers breadcrumbs). Every other page is private
 * (src/developers/gate.js): noindex, nofollow, no canonical, and a title
 * that says nothing at all to anyone without the docs link. Pure.
 */
import { SITE_NAME, SITE_URL } from "@/config";
import { DOCS_PUBLISHED, DOCS_ROOT, DOCS_UPDATED, docsPage } from "@/content/developers/nav";
import { breadcrumbJsonLd } from "@/seo/jsonld";
import { pageMetadata } from "@/seo/metadata";
import { absoluteUrl } from "@/seo/urls";

export const OVERVIEW_TITLE = "Integrations API for developers";

/** Never indexed, never followed: every private docs page, and the 404 they all give without access. */
export const PRIVATE_ROBOTS = { index: false, follow: false };

/** What a private address says without access: the same for every one, real or not. */
export const PRIVATE_METADATA = { title: "Not found", robots: PRIVATE_ROBOTS };

/** A docs page's metadata; null for a slug that isn't one. The private pages' is for people with access only. */
export function docsMetadata(slug) {
  const page = docsPage(slug);
  if (!page) return null;
  if (!page.slug) return pageMetadata({ title: OVERVIEW_TITLE, description: page.description, path: page.path, type: "article" });
  return { ...pageMetadata({ title: `${page.title} · Developers`, description: page.description, path: page.path, type: "article", canonical: false }), robots: PRIVATE_ROBOTS };
}

/** The trail the page shows and its BreadcrumbList says: [[name, path or null for here]]. */
export function docsTrail(page) {
  return page.slug
    ? [
        ["Home", "/"],
        ["Developers", DOCS_ROOT],
        [page.title, null],
      ]
    : [
        ["Home", "/"],
        ["Developers", null],
      ];
}

export function docsStructuredData(page) {
  const url = absoluteUrl(page.path);
  return [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: page.heading || page.title,
      description: page.description,
      url,
      mainEntityOfPage: url,
      inLanguage: "en-IN",
      datePublished: DOCS_PUBLISHED,
      dateModified: DOCS_UPDATED,
      proficiencyLevel: "Expert",
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      about: { "@type": "WebAPI", name: `${SITE_NAME} Integrations API`, documentation: absoluteUrl(DOCS_ROOT), provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL } },
    },
    breadcrumbJsonLd(docsTrail(page).map(([name, path]) => [name, absoluteUrl(path || page.path)])),
  ];
}
