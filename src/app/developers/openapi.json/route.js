import { PRIVATE_HEADERS, privateDocsResponse } from "@/developers/gate";
import { requestDocsAccess } from "@/server/devdocs";
import { getOpenApi } from "@/server/openapi";

/*
 * /developers/openapi.json: the Integrations API's OpenAPI 3.1 document,
 * for "Download OpenAPI": the API's own when it serves one, else the copy
 * the site keeps (src/server/openapi.js). Private, like every docs page but
 * /developers: without a good docs cookie it is the docs' 404
 * (src/developers/gate.js). Reading the cookie makes it dynamic: made for
 * each request, never at build, never kept by a browser or a shared cache.
 * (Not force-dynamic: that would also stop the document's hourly fetch
 * from being kept.)
 */
export async function GET(request) {
  if (!(await requestDocsAccess(request))) return privateDocsResponse();
  const { doc, source } = await getOpenApi();
  return new Response(`${JSON.stringify(doc, null, 2)}\n`, {
    headers: { "Content-Type": "application/json; charset=utf-8", ...PRIVATE_HEADERS, "X-OpenAPI-Source": source },
  });
}
