/**
 * What search engines and link previews read off the developer docs: each
 * page's metadata (its canonical on https://myotherapp.in/developers/...)
 * and its structured data (a TechArticle about the API, and the
 * Home › Developers › page breadcrumbs). Pure.
 */
import { SITE_NAME, SITE_URL } from "@/config";
import { DOCS_PUBLISHED, DOCS_ROOT, DOCS_UPDATED, docsPage } from "@/content/developers/nav";
import { breadcrumbJsonLd } from "@/seo/jsonld";
import { pageMetadata } from "@/seo/metadata";
import { absoluteUrl } from "@/seo/urls";

export const OVERVIEW_TITLE = "Integrations API for developers";

/** A docs page's metadata; null for a slug that isn't one. */
export function docsMetadata(slug) {
  const page = docsPage(slug);
  if (!page) return null;
  return pageMetadata({ title: page.slug ? `${page.title} · Developers` : OVERVIEW_TITLE, description: page.description, path: page.path, type: "article" });
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
