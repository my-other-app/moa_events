import { notFound } from "next/navigation";
import { DeveloperPage } from "@/components/developers/docspage";
import { DOCS_SLUGS } from "@/content/developers/nav";
import { docsMetadata } from "@/developers/seo";
import { getOpenApi } from "@/server/openapi";

/*
 * /developers/{page}: the developer docs' other pages (getting access,
 * quick start, authentication, scopes, the API reference, webhooks,
 * syncing, idempotency, errors, rate limits, test mode, money and personal
 * data, the changelog). Every one made at build time and regenerated at
 * most once an hour from the OpenAPI document (src/server/openapi.js);
 * any other address under /developers is a 404.
 */
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS_SLUGS.map((page) => ({ page }));
}

export async function generateMetadata({ params }) {
  const { page } = await params;
  return docsMetadata(page) || {};
}

export default async function DeveloperDoc({ params }) {
  const { page } = await params;
  if (!page || !DOCS_SLUGS.includes(page)) notFound();
  const { doc, source } = await getOpenApi();
  return <DeveloperPage slug={page} doc={doc} source={source} />;
}
