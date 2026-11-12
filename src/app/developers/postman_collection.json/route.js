import { DOCS_ROOT } from "@/content/developers/nav";
import { PRIVATE_HEADERS, privateDocsResponse } from "@/developers/gate";
import { postmanCollection } from "@/developers/postman";
import { SITE_URL } from "@/config";
import { requestDocsAccess } from "@/server/devdocs";
import { getOpenApi } from "@/server/openapi";

/*
 * /developers/postman_collection.json: a Postman collection (v2.1) made
 * from the OpenAPI document (src/developers/postman.js), for "Postman
 * collection". Private, as /developers/openapi.json is: the docs' 404
 * without a good docs cookie; dynamic (it reads the cookie), never made at
 * build, never kept by a browser or a shared cache.
 */
export async function GET(request) {
  if (!(await requestDocsAccess(request))) return privateDocsResponse();
  const { doc, source } = await getOpenApi();
  return new Response(`${JSON.stringify(postmanCollection(doc, { docUrl: `${SITE_URL}${DOCS_ROOT}/reference` }), null, 2)}\n`, {
    headers: { "Content-Type": "application/json; charset=utf-8", ...PRIVATE_HEADERS, "X-OpenAPI-Source": source },
  });
}
