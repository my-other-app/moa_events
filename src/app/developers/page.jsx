import { DeveloperPage } from "@/components/developers/docspage";
import { docsMetadata } from "@/developers/seo";
import { getOpenApi } from "@/server/openapi";

/*
 * /developers: the Integrations API's developer docs, the overview
 * (feature-register/integrations-api-contract.md). SERVER-RENDERED and
 * static, regenerated at most once an hour: the addresses it quotes come
 * from the API's OpenAPI document when the API serves one, else from the
 * copy checked in with the site (src/server/openapi.js), so it never fails
 * for the API being down.
 */
export const revalidate = 3600;

export const metadata = docsMetadata("");

export default async function Developers() {
  const { doc, source } = await getOpenApi();
  return <DeveloperPage slug="" doc={doc} source={source} />;
}
