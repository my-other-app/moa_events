/**
 * Reading an OpenAPI 3.1 document for the developer docs (/developers): its
 * operations and webhooks, their scopes, parameters, bodies, examples and
 * error codes, the schemas' fields, and the addresses the guides quote.
 * Pure functions of the document, so the reference page, the Postman
 * collection and the tests share them.
 *
 * The document is the API's own (GET /partner/v1/openapi.json) when it can
 * be read, else the copy in src/content/developers/openapi.json. Either may
 * be shaped the way a generator writes it (FastAPI: anyOf with null, no
 * examples), so nothing here assumes more than OpenAPI says: $refs are
 * followed (never round a loop), missing examples are made from the
 * schema, and an odd value is skipped rather than trusted.
 */

export const METHODS = ["get", "post", "put", "patch", "delete"];
export const DEFAULT_BASE_URL = "https://api.myotherapp.in/partner/v1";
const API_ORIGIN = "https://api.myotherapp.in";
const MAX_DEPTH = 6;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v : "");

/** True for a document this module can read: OpenAPI 3.x with at least one path. */
export function isOpenApi(doc) {
  return isObj(doc) && /^3\.\d+/.test(str(doc.openapi)) && isObj(doc.paths) && Object.keys(doc.paths).length > 0;
}

/** The object a local $ref ("#/components/schemas/Event") points at, or null. */
export function lookup(doc, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  let node = doc;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObj(node) || !(key in node)) return null;
    node = node[key];
  }
  return node;
}

/** The name a $ref gives its schema ("Event"), or null. */
export const refName = (ref) => (typeof ref === "string" && ref.startsWith("#/components/schemas/") ? ref.slice("#/components/schemas/".length) : null);

/** `node` with its $ref (and any $refs that leads to) followed; siblings of a $ref win, as 3.1 says. */
export function deref(doc, node, seen = new Set()) {
  let out = node;
  while (isObj(out) && typeof out.$ref === "string") {
    if (seen.has(out.$ref)) return {};
    seen.add(out.$ref);
    const { $ref, ...rest } = out;
    const target = lookup(doc, $ref);
    out = isObj(target) ? { ...target, ...rest } : rest;
  }
  return isObj(out) ? out : {};
}

/** A schema's alternatives with null taken out: [schemas], and whether null is one of them. */
function alternatives(doc, schema) {
  const list = schema.oneOf || schema.anyOf;
  if (!Array.isArray(list)) return null;
  let nullable = false;
  const rest = [];
  for (const s of list) {
    const d = deref(doc, s);
    if (d.type === "null" || (Array.isArray(d.type) && d.type.length === 1 && d.type[0] === "null")) nullable = true;
    else rest.push(s);
  }
  return { rest, nullable };
}

/** allOf merged into one object schema (properties and required joined). */
function merged(doc, schema, seen) {
  if (!Array.isArray(schema.allOf)) return schema;
  const out = { ...schema, properties: { ...(schema.properties || {}) }, required: [...(schema.required || [])] };
  delete out.allOf;
  for (const part of schema.allOf) {
    const d = merged(doc, deref(doc, part, new Set(seen)), seen);
    Object.assign(out.properties, d.properties || {});
    out.required.push(...(d.required || []));
    if (!out.type && d.type) out.type = d.type;
    if (!out.description && d.description) out.description = d.description;
  }
  return out;
}

/** The schema to read, $refs followed and allOf merged. */
export function schemaOf(doc, node) {
  return merged(doc, deref(doc, node), new Set());
}

/**
 * A schema's type in words, as the reference tables print it: "string
 * (date-time)", "integer", "Event", "array of Registration", "Money or
 * "free"", with "or null" when it may be empty.
 */
export function typeLabel(doc, node, depth = 0) {
  if (!isObj(node)) return "any";
  const name = refName(node.$ref);
  if (name) return name;
  const schema = deref(doc, node);
  if (depth > MAX_DEPTH) return "object";
  const alts = alternatives(doc, schema);
  if (alts) {
    const names = alts.rest.map((s) => typeLabel(doc, s, depth + 1));
    const label = [...new Set(names)].join(" or ") || "null";
    return alts.nullable && alts.rest.length ? `${label} or null` : label;
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter(Boolean);
  const nullable = types.includes("null");
  const main = types.filter((t) => t !== "null");
  let label;
  if (main.includes("array") || (!main.length && schema.items)) label = `array of ${typeLabel(doc, schema.items || {}, depth + 1)}`;
  else if (main.length) label = main.map((t) => (t === "string" && schema.format ? `string (${schema.format})` : t)).join(" or ");
  else if (schema.properties || Array.isArray(schema.allOf)) label = "object";
  else label = "any";
  return nullable ? `${label} or null` : label;
}

/** The object schema behind a field, if there is one to open up: its alternatives' first object, or its items'. */
function objectBehind(doc, node, depth) {
  if (depth > MAX_DEPTH) return null;
  const schema = schemaOf(doc, node);
  const alts = alternatives(doc, schema);
  if (alts) {
    for (const s of alts.rest) {
      const hit = objectBehind(doc, s, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (isObj(schema.properties) && Object.keys(schema.properties).length) return schema;
  return null;
}

/**
 * A schema's fields as table rows: [{name, type, required, description,
 * values, readOnly}], nested objects opened as "venue.name" (an array's as
 * "ticket_types[].name") up to `depth` levels; a named schema (a $ref)
 * below the top is not opened (its own table, in the reference's objects,
 * says what is in it), unless `open` names it.
 */
export function fieldRows(doc, node, { depth = 2, prefix = "", open = false } = {}) {
  const schema = schemaOf(doc, node);
  const props = isObj(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const rows = [];
  for (const [name, raw] of Object.entries(props)) {
    const prop = deref(doc, raw);
    const values = Array.isArray(prop.enum) ? prop.enum.filter((v) => v !== null) : [];
    const full = `${prefix}${name}`;
    rows.push({
      name: full,
      type: typeLabel(doc, raw),
      required: required.has(name),
      description: str(prop.description) || describeAlternatives(doc, prop),
      values,
      readOnly: Boolean(prop.readOnly),
      default: prop.default,
    });
    if (depth <= 0) continue;
    const named = Boolean(refName(raw?.$ref)) || namedAlternative(raw);
    if (named && !open) continue;
    const s = schemaOf(doc, raw);
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (types.includes("array") && s.items) {
      if (refName(s.items.$ref) && !open) continue;
      const inner = objectBehind(doc, s.items, 0);
      if (inner) rows.push(...fieldRows(doc, inner, { depth: depth - 1, prefix: `${full}[].`, open }));
      continue;
    }
    const inner = objectBehind(doc, raw, 0);
    if (inner) rows.push(...fieldRows(doc, inner, { depth: depth - 1, prefix: `${full}.`, open }));
  }
  return rows;
}

const namedAlternative = (raw) => {
  const list = isObj(raw) ? raw.anyOf || raw.oneOf : null;
  return Array.isArray(list) && list.some((s) => refName(s?.$ref));
};

function describeAlternatives(doc, prop) {
  const alts = alternatives(doc, prop);
  if (!alts) return "";
  for (const s of alts.rest) {
    const d = deref(doc, s);
    if (str(d.description)) return d.description;
  }
  return "";
}

const PLACEHOLDER = { "date-time": "2026-11-12T10:00:00+05:30", date: "2026-11-12", email: "asha.rao@example.com", uri: "https://example.com", uuid: "6f1c2a7e-3b9d-4e8a-9c41-2d5f7b0e8a13" };

/** An example value for a schema: its own example (or examples[0], default, const, first enum), else one made from its type. */
export function exampleFor(doc, node, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  const schema = schemaOf(doc, node);
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const alts = alternatives(doc, schema);
  if (alts) return alts.rest.length ? exampleFor(doc, alts.rest[0], depth + 1) : null;
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).filter((t) => t && t !== "null");
  const type = types[0] || (schema.properties ? "object" : schema.items ? "array" : null);
  if (type === "object") {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties || {})) out[k] = exampleFor(doc, v, depth + 1);
    return out;
  }
  if (type === "array") return schema.items ? [exampleFor(doc, schema.items, depth + 1)] : [];
  if (type === "string") return PLACEHOLDER[schema.format] || "string";
  if (type === "integer") return 0;
  if (type === "number") return 0;
  if (type === "boolean") return false;
  return null;
}

/** A media type's example: `example`, else the first of `examples`, else one made from its schema. */
export function mediaExample(doc, media) {
  if (!isObj(media)) return undefined;
  if (media.example !== undefined) return media.example;
  if (isObj(media.examples)) {
    const first = Object.values(media.examples)[0];
    const ex = deref(doc, first);
    if (ex.value !== undefined) return ex.value;
  }
  return media.schema ? exampleFor(doc, media.schema) : undefined;
}

const jsonOf = (content) => (isObj(content) ? content["application/json"] || Object.values(content).find((m) => isObj(m) && m.schema) || null : null);

/** The error codes a response names in its examples: [{code, message, summary}]. */
export function errorCodes(doc, response) {
  const media = jsonOf(deref(doc, response).content);
  if (!media) return [];
  const out = [];
  const add = (value, summary) => {
    const code = value?.error?.code;
    if (typeof code === "string" && !out.some((e) => e.code === code)) out.push({ code, message: str(value.error.message), summary: str(summary) });
  };
  if (isObj(media.examples)) for (const ex of Object.values(media.examples)) add(deref(doc, ex).value, deref(doc, ex).summary);
  if (media.example !== undefined) add(media.example);
  return out;
}

/** The scopes an operation needs (the union of its security requirements' lists); null when it is public. */
export function scopesOf(doc, operation) {
  const security = Array.isArray(operation.security) ? operation.security : Array.isArray(doc.security) ? doc.security : [];
  if (Array.isArray(operation.security) && operation.security.length === 0) return null;
  const out = [];
  for (const req of security) {
    if (!isObj(req)) continue;
    for (const list of Object.values(req)) for (const s of Array.isArray(list) ? list : []) if (typeof s === "string" && !out.includes(s)) out.push(s);
  }
  for (const s of Array.isArray(operation["x-scopes"]) ? operation["x-scopes"] : []) if (typeof s === "string" && !out.includes(s)) out.push(s);
  return out;
}

/** Who may call an operation: "public", "partner" (partner apps only), or "all" (API keys and partner apps). */
export function audienceOf(doc, operation) {
  if (Array.isArray(operation.security) && operation.security.length === 0) return "public";
  const security = Array.isArray(operation.security) ? operation.security : Array.isArray(doc.security) ? doc.security : [];
  const schemes = doc.components?.securitySchemes || {};
  const kinds = new Set();
  for (const req of security) for (const name of Object.keys(isObj(req) ? req : {})) kinds.add(deref(doc, schemes[name]).type);
  if (operation["x-partner-only"] === true) return "partner";
  return kinds.size === 1 && kinds.has("oauth2") ? "partner" : "all";
}

/**
 * The leading segments every path shares ("/partner/v1" when the document
 * names its paths in full under a bare origin), so the docs can show
 * "/events" under ".../partner/v1". Never a whole path, never a {param}.
 */
export function pathPrefix(doc) {
  const paths = Object.keys(isObj(doc?.paths) ? doc.paths : {}).map((p) => p.split("/").filter(Boolean));
  if (!paths.length) return "";
  const shortest = Math.min(...paths.map((p) => p.length));
  const out = [];
  for (let i = 0; i < shortest - 1; i += 1) {
    const seg = paths[0][i];
    if (seg.startsWith("{") || !paths.every((p) => p[i] === seg)) break;
    out.push(seg);
  }
  return out.length ? `/${out.join("/")}` : "";
}

/** Ids to show in a path when the document gives no example, by the parameter's name. */
const SAMPLE_IDS = { event_id: "8812", registration_id: "120394", checkin_id: "90211", job_id: "cj_7731", number: "MOA-CERT-2026-0004812", endpoint_id: "4b7e2c1a-9f3d-4e6b-8a52-0c1d2e3f4a5b", delivery_id: "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", code: "MOA-7K2P-QX9D" };

/** "createEvent", or one made from the method and path ("post-events-event_id-publish"), safe as an id. */
const slugOf = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");

function parametersOf(doc, pathItem, operation) {
  const byKey = new Map();
  for (const raw of [...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []), ...(Array.isArray(operation.parameters) ? operation.parameters : [])]) {
    const p = deref(doc, raw);
    if (!str(p.name) || !str(p.in)) continue;
    byKey.set(`${p.in}:${p.name}`, p);
  }
  return [...byKey.values()].map((p) => ({
    name: p.name,
    in: p.in,
    required: Boolean(p.required) || p.in === "path",
    description: str(p.description),
    type: typeLabel(doc, p.schema || {}),
    values: Array.isArray(deref(doc, p.schema).enum) ? deref(doc, p.schema).enum : [],
    example: p.example !== undefined ? p.example : isObj(p.examples) ? deref(doc, Object.values(p.examples)[0]).value : exampleFor(doc, p.schema || {}),
  }));
}

function responsesOf(doc, operation) {
  const out = [];
  for (const [status, raw] of Object.entries(isObj(operation.responses) ? operation.responses : {})) {
    const r = deref(doc, raw);
    const media = jsonOf(r.content);
    out.push({
      status,
      description: str(r.description),
      schema: media?.schema || null,
      schemaName: refName(media?.schema?.$ref),
      example: media ? mediaExample(doc, media) : undefined,
      errors: /^[45]/.test(status) ? errorCodes(doc, r) : [],
      headers: Object.keys(isObj(r.headers) ? r.headers : {}),
    });
  }
  return out.sort((a, b) => a.status.localeCompare(b.status));
}

function operationOf(doc, { path, method, pathItem, operation, kind, prefix = "" }) {
  const media = jsonOf(deref(doc, operation.requestBody).content);
  const shown = prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
  // Anchors come from the method and path, never a generator's operationId, so a link stays put whichever document is shown.
  const id = slugOf(operation.operationId || `${method}-${shown}`) || `${method}-op`;
  const params = parametersOf(doc, pathItem, operation).map((p) => (p.in === "path" && (p.example === undefined || p.example === null || p.example === "string") && SAMPLE_IDS[p.name] ? { ...p, example: SAMPLE_IDS[p.name] } : p));
  return {
    kind,
    id,
    anchor: kind === "webhook" ? `wh-${slugOf(path).replace(/\./g, "-")}` : `op-${slugOf(`${method}-${shown.replace(/[{}]/g, "")}`.toLowerCase())}`,
    method: method.toUpperCase(),
    path: shown,
    fullPath: path,
    tag: Array.isArray(operation.tags) && operation.tags[0] ? String(operation.tags[0]) : kind === "webhook" ? "Webhooks" : "Other",
    summary: str(operation.summary) || `${method.toUpperCase()} ${path}`,
    description: str(operation.description),
    deprecated: Boolean(operation.deprecated),
    scopes: kind === "webhook" ? [] : scopesOf(doc, operation),
    audience: kind === "webhook" ? "webhook" : audienceOf(doc, operation),
    parameters: params,
    requestBody: media
      ? {
          required: Boolean(deref(doc, operation.requestBody).required),
          schema: media.schema || null,
          schemaName: refName(media.schema?.$ref),
          example: mediaExample(doc, media),
        }
      : null,
    responses: responsesOf(doc, operation),
    object: str(operation["x-object"]) || null,
  };
}

/** Every operation in the document's paths, in its order: see operationOf for the shape. */
export function listOperations(doc) {
  const out = [];
  const prefix = pathPrefix(doc);
  for (const [path, raw] of Object.entries(isObj(doc?.paths) ? doc.paths : {})) {
    const pathItem = deref(doc, raw);
    for (const method of METHODS) {
      if (isObj(pathItem[method])) out.push(operationOf(doc, { path, method, pathItem, operation: pathItem[method], kind: "operation", prefix }));
    }
  }
  return out;
}

/** A webhook's description without its closing "data.object is a …" (the reference says that itself). */
export const whenSent = (description) => String(description || "").replace(/\s*data\.object is an? [A-Za-z]+\.\s*$/, "");

/** Every webhook the document describes (OpenAPI 3.1 `webhooks`), by its name ("event.created"). */
export function listWebhooks(doc) {
  const out = [];
  for (const [name, raw] of Object.entries(isObj(doc?.webhooks) ? doc.webhooks : {})) {
    const item = deref(doc, raw);
    for (const method of METHODS) {
      if (isObj(item[method])) out.push(operationOf(doc, { path: name, method, pathItem: item, operation: item[method], kind: "webhook" }));
    }
  }
  return out;
}

/** How a tag is shown: the API's lowercase names in words ("checkins" → "Check-ins"); anything else as it is, capitalised. */
const TAG_LABELS = { auth: "Account", club: "Club", clubs: "Partner apps", events: "Events", registrations: "Registrations", checkins: "Check-ins", certificates: "Certificates", webhooks: "Webhook endpoints", "webhook endpoints": "Webhook endpoints" };
export const tagLabel = (name) => TAG_LABELS[String(name).toLowerCase()] || String(name).charAt(0).toUpperCase() + String(name).slice(1);

/** Operations grouped by their first tag, in the document's tag order (then any others): [{name, label, description, slug, operations}]. */
export function groupByTag(doc, operations) {
  const declared = Array.isArray(doc?.tags) ? doc.tags.filter((t) => isObj(t) && str(t.name)) : [];
  const names = [...declared.map((t) => t.name), ...operations.map((o) => o.tag)].filter((n, i, all) => all.indexOf(n) === i);
  return names
    .map((name) => ({
      name,
      label: tagLabel(name),
      slug: `tag-${slugOf(tagLabel(name).toLowerCase())}`,
      description: str(declared.find((t) => t.name === name)?.description),
      operations: operations.filter((o) => o.tag === name),
    }))
    .filter((g) => g.operations.length);
}

/** The named schemas the operations return or take, in the document's order: [{name, description, rows}]. */
export function objectsOf(doc, operations) {
  const used = new Set();
  const visit = (node, depth = 0) => {
    if (!isObj(node) || depth > MAX_DEPTH) return;
    const name = refName(node.$ref);
    if (name) {
      if (used.has(name)) return;
      used.add(name);
    }
    const s = deref(doc, node);
    for (const list of [s.anyOf, s.oneOf, s.allOf]) if (Array.isArray(list)) list.forEach((x) => visit(x, depth + 1));
    if (s.items) visit(s.items, depth + 1);
    for (const p of Object.values(isObj(s.properties) ? s.properties : {})) visit(p, depth + 1);
  };
  for (const op of operations) {
    if (op.object && isObj(doc?.components?.schemas?.[op.object])) visit({ $ref: `#/components/schemas/${op.object}` });
    if (op.requestBody?.schema) visit(op.requestBody.schema);
    for (const r of op.responses) if (r.schema) visit(r.schema);
  }
  const all = Object.keys(isObj(doc?.components?.schemas) ? doc.components.schemas : {});
  return all
    .filter((name) => used.has(name))
    .map((name) => {
      const schema = schemaOf(doc, { $ref: `#/components/schemas/${name}` });
      return { name, anchor: `obj-${slugOf(name)}`, description: str(schema.description), rows: fieldRows(doc, { $ref: `#/components/schemas/${name}` }, { depth: 2, open: false }), enum: Array.isArray(schema.enum) ? schema.enum : null };
    });
}

/** Every scope the document knows, with its words: components.x-scopes, else the OAuth flows' scopes, else those operations use. */
export function scopeList(doc, operations = listOperations(doc)) {
  const out = new Map();
  const add = (name, description = "") => {
    if (typeof name !== "string" || !name) return;
    if (!out.has(name) || (!out.get(name) && description)) out.set(name, str(description));
  };
  for (const [k, v] of Object.entries(isObj(doc?.components?.["x-scopes"]) ? doc.components["x-scopes"] : {})) add(k, v);
  for (const scheme of Object.values(isObj(doc?.components?.securitySchemes) ? doc.components.securitySchemes : {})) {
    for (const flow of Object.values(isObj(scheme?.flows) ? scheme.flows : {})) for (const [k, v] of Object.entries(isObj(flow?.scopes) ? flow.scopes : {})) add(k, v);
  }
  for (const op of operations) for (const s of op.scopes || []) add(s);
  return [...out.entries()].map(([name, description]) => ({
    name,
    description,
    operations: operations.filter((o) => (o.scopes || []).includes(name)).map((o) => ({ method: o.method, path: o.path, anchor: o.anchor, summary: o.summary })),
  }));
}

/**
 * The addresses the guides quote, from the document: the API's base URL
 * (its first server, made absolute), and the partner OAuth endpoints (its
 * oauth2 scheme's; the revocation URL from x-revocationUrl, else beside
 * the token URL).
 */
export function apiContext(doc) {
  const server = str(doc?.servers?.[0]?.url).replace(/\/+$/, "");
  const prefix = pathPrefix(doc);
  const origin = /^https:\/\//.test(server) ? server : server.startsWith("/") ? `${API_ORIGIN}${server}` : server ? null : prefix ? API_ORIGIN : null;
  const baseUrl = origin ? `${origin}${prefix}` : DEFAULT_BASE_URL;
  const schemes = Object.values(isObj(doc?.components?.securitySchemes) ? doc.components.securitySchemes : {});
  const oauth = schemes.find((s) => s?.type === "oauth2") || {};
  const code = oauth.flows?.authorizationCode || {};
  const client = oauth.flows?.clientCredentials || null;
  const tokenUrl = str(code.tokenUrl) || `${baseUrl}/oauth/token`;
  return {
    baseUrl,
    version: str(doc?.info?.version),
    authorizeUrl: str(code.authorizationUrl) || `${baseUrl}/oauth/authorize`,
    tokenUrl,
    refreshUrl: str(code.refreshUrl) || tokenUrl,
    revokeUrl: str(doc?.info?.["x-oauth"]?.revocation_endpoint) || str(oauth["x-revocationUrl"]) || tokenUrl.replace(/\/token$/, "/revoke"),
    clientCredentials: Boolean(client),
    openapiUrl: `${baseUrl}/openapi.json`,
  };
}

/** A path with its {params} filled in from the parameters' examples. */
export function filledPath(op) {
  return op.path.replace(/\{([^}]+)\}/g, (all, name) => {
    const p = op.parameters.find((x) => x.in === "path" && x.name === name);
    return p && p.example !== undefined && p.example !== null ? encodeURIComponent(String(p.example)) : all;
  });
}

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** A curl command for an operation, its body the request's example. */
export function curlFor(op, { baseUrl = DEFAULT_BASE_URL, token = "$MOA_KEY" } = {}) {
  const url = `${baseUrl}${filledPath(op)}`;
  const lines = [op.method === "GET" ? `curl ${url}` : `curl -X ${op.method} ${url}`];
  if (op.audience !== "public") lines.push(`-H "Authorization: Bearer ${token}"`);
  if (op.parameters.some((p) => p.in === "header" && p.name === "Idempotency-Key")) lines.push(`-H "Idempotency-Key: $(uuidgen)"`);
  if (op.requestBody && op.requestBody.example !== undefined) {
    lines.push(`-H "Content-Type: application/json"`);
    lines.push(`-d ${shellQuote(JSON.stringify(op.requestBody.example, null, 2))}`);
  }
  return lines.join(" \\\n  ");
}

/** The success response to show first: the lowest 2xx. */
export const successOf = (op) => op.responses.find((r) => /^2/.test(r.status)) || null;

/** Pretty JSON for an example (undefined → null). */
export const pretty = (value) => JSON.stringify(value === undefined ? null : value, null, 2);
