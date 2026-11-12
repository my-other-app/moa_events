import { notFound } from "next/navigation";
import { DeveloperPage } from "@/components/developers/docspage";
import { DOCS_SLUGS } from "@/content/developers/nav";
import { PRIVATE_METADATA, docsMetadata } from "@/developers/seo";
import { docsAccess } from "@/server/devdocs";
import { getOpenApi } from "@/server/openapi";

/*
 * /developers/{page}: the private developer docs (getting access, quick
 * start, authentication, scopes, the API reference, webhooks, syncing,
 * idempotency, errors, rate limits, test mode, money and personal data,
 * the changelog), for people with a docs link (src/developers/gate.js).
 *
 * src/proxy.js has turned away anyone without one already; this page
 * checks again on the server before it renders a word, so a request that
 * reached it some other way still gets the docs' 404 (./not-found.jsx),
 * with a title that names nothing. Reading the docs cookie makes the page
 * dynamic: no generateStaticParams, nothing made at build, nothing in any
 * public HTML. Any other address under /developers is the same 404.
 */
const known = (page) => Boolean(page) && DOCS_SLUGS.includes(page);

export async function generateMetadata({ params }) {
  const { page } = await params;
  if (!known(page) || !(await docsAccess())) return PRIVATE_METADATA;
  return docsMetadata(page);
}

export default async function DeveloperDoc({ params }) {
  const { page } = await params;
  if (!(await docsAccess()) || !known(page)) notFound();
  const { doc, source } = await getOpenApi();
  return <DeveloperPage slug={page} doc={doc} source={source} />;
}
