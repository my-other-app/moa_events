/**
 * A Postman collection (v2.1) made from the OpenAPI document: one folder per
 * tag, one request per operation, with the base URL and the key as the
 * collection's variables ({{baseUrl}}, {{moaKey}}), the key sent as a
 * bearer token, a fresh Idempotency-Key ({{$guid}}) on every request that
 * takes one, path parameters as Postman's :variables and each body the
 * operation's example. Served at /developers/postman_collection.json.
 */
import { apiContext, groupByTag, listOperations } from "./openapi";

export const POSTMAN_SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

const text = (s) => (typeof s === "string" ? s : "");

function requestOf(op, docUrl) {
  const segments = op.path.split("/").filter(Boolean).map((seg) => seg.replace(/^\{(.+)\}$/, ":$1"));
  const query = op.parameters
    .filter((p) => p.in === "query")
    .map((p) => ({ key: p.name, value: p.example === undefined || p.example === null ? "" : String(p.example), description: p.description, disabled: true }));
  const variable = op.parameters
    .filter((p) => p.in === "path")
    .map((p) => ({ key: p.name, value: p.example === undefined || p.example === null ? "" : String(p.example), description: p.description }));
  const header = [];
  if (op.parameters.some((p) => p.in === "header" && p.name === "Idempotency-Key")) header.push({ key: "Idempotency-Key", value: "{{$guid}}", description: "A new key for each request; send the same one again only to retry it." });
  if (op.parameters.some((p) => p.in === "header" && p.name === "If-Match")) header.push({ key: "If-Match", value: "", description: "The ETag you read, to change it only if nobody else has.", disabled: true });
  const request = {
    method: op.method,
    header,
    url: {
      raw: `{{baseUrl}}/${segments.join("/")}${query.length ? `?${query.map((q) => `${q.key}=${q.value}`).join("&")}` : ""}`,
      host: ["{{baseUrl}}"],
      path: segments,
      ...(query.length ? { query } : {}),
      ...(variable.length ? { variable } : {}),
    },
    description: [op.description, op.scopes?.length ? `Scopes: ${op.scopes.join(", ")}.` : "", `${docUrl}#${op.anchor}`].filter(Boolean).join("\n\n"),
  };
  if (op.audience === "public") request.auth = { type: "noauth" };
  if (op.requestBody && op.requestBody.example !== undefined) {
    header.push({ key: "Content-Type", value: "application/json" });
    request.body = { mode: "raw", raw: JSON.stringify(op.requestBody.example, null, 2), options: { raw: { language: "json" } } };
  }
  return { name: op.summary, request, response: [] };
}

/** The collection for a document. `docUrl`: the reference page each request links back to. */
export function postmanCollection(doc, { docUrl = "https://myotherapp.in/developers/reference" } = {}) {
  const ctx = apiContext(doc);
  const operations = listOperations(doc);
  const title = text(doc?.info?.title) || "MyOtherApp Integrations API";
  return {
    info: {
      name: `${title}${ctx.version ? ` ${ctx.version}` : ""}`,
      description: `${text(doc?.info?.description)}\n\nSet the moaKey variable to a test key (moa_test_…) to start.`.trim(),
      schema: POSTMAN_SCHEMA,
    },
    auth: { type: "bearer", bearer: [{ key: "token", value: "{{moaKey}}", type: "string" }] },
    variable: [
      { key: "baseUrl", value: ctx.baseUrl, type: "string" },
      { key: "moaKey", value: "moa_test_your_key_here", type: "string" },
    ],
    item: groupByTag(doc, operations).map((group) => ({
      name: group.name,
      ...(group.description ? { description: group.description } : {}),
      item: group.operations.map((op) => requestOf(op, docUrl)),
    })),
  };
}
