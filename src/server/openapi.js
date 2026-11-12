import "server-only";
import COPY from "@/content/developers/openapi.json";
import { isOpenApi, listOperations, listWebhooks } from "@/developers/openapi";
import { postmanCollection } from "@/developers/postman";
import { apiGet } from "./api";

/**
 * The OpenAPI document the developer docs are made from: the API's own
 * (GET /partner/v1/openapi.json, read at most once an hour through Next's
 * data cache) when it answers with one this site can read, else the copy
 * checked in at src/content/developers/openapi.json (written from the
 * contract). So a build never depends on production: a 404 (an API without
 * the partner surface yet), an error, a timeout or a document that doesn't
 * read all give the copy. After a failure, the copy is used without asking
 * again for a minute, so a build's many pages don't each wait on a down API.
 *
 *   getOpenApi() → {doc, source: "api" | "copy"}
 */
export const OPENAPI_PATH = "/partner/v1/openapi.json";
export const OPENAPI_REVALIDATE = 3600;
const QUIET_AFTER_FAILURE_MS = 60_000;

let failedAt = 0;

/** True when every part of the docs can be made from `doc`: the reference, the webhooks and the Postman collection. */
export function readable(doc) {
  if (!isOpenApi(doc)) return false;
  try {
    return listOperations(doc).length > 0 && Array.isArray(listWebhooks(doc)) && Boolean(postmanCollection(doc).item);
  } catch {
    return false;
  }
}

export const copy = () => ({ doc: COPY, source: "copy" });

export async function getOpenApi({ now = Date.now() } = {}) {
  if (failedAt && now - failedAt < QUIET_AFTER_FAILURE_MS) return copy();
  try {
    const { data } = await apiGet(OPENAPI_PATH, { revalidate: OPENAPI_REVALIDATE, timeoutMs: 4000 });
    if (data && readable(data)) {
      failedAt = 0;
      return { doc: data, source: "api" };
    }
  } catch {
    // Down, slow or not JSON: the copy.
  }
  failedAt = now;
  return copy();
}

/** For the tests: forget a failure. */
export function resetOpenApiMemo() {
  failedAt = 0;
}
