import { getOpenApi } from "@/server/openapi";

/*
 * /developers/openapi.json: the Integrations API's OpenAPI 3.1 document,
 * for "Download OpenAPI": the API's own when it serves one, else the copy
 * the site keeps (src/server/openapi.js). Made at build, regenerated at
 * most once an hour.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const { doc, source } = await getOpenApi();
  return new Response(`${JSON.stringify(doc, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      "X-OpenAPI-Source": source,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
