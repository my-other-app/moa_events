import { DOCS_ROOT } from "@/content/developers/nav";
import { postmanCollection } from "@/developers/postman";
import { SITE_URL } from "@/config";
import { getOpenApi } from "@/server/openapi";

/*
 * /developers/postman_collection.json: a Postman collection (v2.1) made
 * from the OpenAPI document (src/developers/postman.js), for "Postman
 * collection". Made at build, regenerated at most once an hour, so it
 * follows the API's document when the API serves one.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const { doc, source } = await getOpenApi();
  return new Response(`${JSON.stringify(postmanCollection(doc, { docUrl: `${SITE_URL}${DOCS_ROOT}/reference` }), null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "X-OpenAPI-Source": source,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
