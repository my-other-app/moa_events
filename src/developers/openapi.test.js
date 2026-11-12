// @vitest-environment node
import { describe, expect, it } from "vitest";
import COPY from "@/content/developers/openapi.json";
import { ERROR_CODES } from "@/content/developers/pages";
import {
  apiContext,
  audienceOf,
  curlFor,
  deref,
  errorCodes,
  exampleFor,
  fieldRows,
  groupByTag,
  isOpenApi,
  listOperations,
  listWebhooks,
  lookup,
  objectsOf,
  scopeList,
  scopesOf,
  typeLabel,
} from "./openapi";
import { POSTMAN_SCHEMA, postmanCollection } from "./postman";
import { highlight, inlineParts, plain } from "./text";

/** Every $ref anywhere in a value. */
function refs(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => refs(n, out));
  else if (node && typeof node === "object") {
    if (typeof node.$ref === "string") out.push(node.$ref);
    Object.values(node).forEach((n) => refs(n, out));
  }
  return out;
}

describe("the OpenAPI copy (src/content/developers/openapi.json)", () => {
  const ops = listOperations(COPY);
  const hooks = listWebhooks(COPY);
  const documented = new Map(ERROR_CODES.map(([code, status]) => [code, String(status)]));

  it("is OpenAPI 3.1, marked with the backend commit it was dumped from, for the partner surface", () => {
    expect(COPY.openapi).toBe("3.1.0");
    expect(isOpenApi(COPY)).toBe(true);
    expect(COPY.info["x-generated-from"]).toBe("moa_backend 4984fbb (feat/api-webhooks)");
    expect(COPY.info["x-generated-note"]).toContain("https://api.myotherapp.in/partner/v1/openapi.json");
    expect(Object.keys(COPY.paths).every((p) => p.startsWith("/partner/v1/"))).toBe(true);
  });

  it("has every resource of the contract, and the webhook endpoints", () => {
    const have = ops.map((o) => `${o.method} ${o.path}`);
    for (const want of [
      "GET /me",
      "GET /club",
      "PATCH /club",
      "GET /clubs",
      "POST /clubs",
      "GET /events",
      "POST /events",
      "GET /events/{event_id}",
      "PATCH /events/{event_id}",
      "POST /events/{event_id}/publish",
      "POST /events/{event_id}/cancel",
      "GET /events/{event_id}/registrations",
      "POST /events/{event_id}/registrations",
      "GET /registrations/{registration_id}",
      "PATCH /registrations/{registration_id}",
      "POST /registrations/{registration_id}/cancel",
      "POST /checkins",
      "DELETE /checkins/{checkin_id}",
      "GET /events/{event_id}/checkins",
      "GET /events/{event_id}/certificates",
      "POST /events/{event_id}/certificates",
      "GET /certificate-jobs/{job_id}",
      "GET /certificates/{number}",
      "GET /webhook-event-types",
      "GET /webhook-endpoints",
      "POST /webhook-endpoints",
      "GET /webhook-endpoints/{endpoint_id}",
      "PATCH /webhook-endpoints/{endpoint_id}",
      "DELETE /webhook-endpoints/{endpoint_id}",
      "POST /webhook-endpoints/{endpoint_id}/rotate-secret",
      "POST /webhook-endpoints/{endpoint_id}/test",
      "GET /webhook-endpoints/{endpoint_id}/deliveries",
      "GET /webhook-deliveries/{delivery_id}",
      "POST /webhook-deliveries/{delivery_id}/retry",
    ])
      expect(have).toContain(want);
    expect(ops).toHaveLength(34);
  });

  it("has the contract's 15 webhook types and the test, each body's object the GET's own schema", () => {
    expect(hooks.map((h) => h.path)).toEqual([
      "event.created",
      "event.updated",
      "event.published",
      "event.cancelled",
      "registration.created",
      "registration.updated",
      "registration.approved",
      "registration.declined",
      "registration.cancelled",
      "checkin.created",
      "checkin.deleted",
      "certificate.issued",
      "payment.completed",
      "payment.refunded",
      "club.updated",
      "webhook.test",
    ]);
    const objects = Object.fromEntries(hooks.map((h) => [h.path, h.object]));
    expect(objects).toMatchObject({ "event.updated": "EventOut", "registration.created": "RegistrationOut", "checkin.deleted": "CheckinOut", "certificate.issued": "CertificateOut", "payment.refunded": "WebhookPayment", "club.updated": "ClubOut" });
    expect(deref(COPY, COPY.components.schemas.WebhookPayment.properties.status).enum).toEqual(["captured", "refunded", "partially_refunded"]);
    for (const h of hooks) {
      expect(h.requestBody.example).toMatchObject({ type: h.path, origin: expect.any(Object), data: { object: expect.any(Object) } });
      expect(h.parameters.map((p) => p.name)).toEqual(["MOA-Signature", "MOA-Event-Id", "MOA-Event-Type", "MOA-Delivery-Id", "MOA-Delivery-Attempt"]);
      expect(lookup(COPY, `#/components/schemas/${h.object}`)).toBeTruthy();
      // Every field the example's object has is one its schema names (the GET's shape).
      const props = Object.keys(deref(COPY, { $ref: `#/components/schemas/${h.object}` }).properties);
      for (const key of Object.keys(h.requestBody.example.data.object)) expect([h.path, key, props.includes(key)]).toEqual([h.path, key, true]);
    }
  });

  it("resolves every $ref, declares every path parameter, and has unique operation ids and anchors", () => {
    for (const ref of refs(COPY)) expect([ref, lookup(COPY, ref)]).toEqual([ref, expect.anything()]);
    for (const key of ["id", "anchor"]) {
      const all = ops.map((o) => o[key]);
      expect(new Set(all).size).toBe(all.length);
    }
    for (const op of ops) {
      for (const [, name] of op.path.matchAll(/\{([^}]+)\}/g)) expect(op.parameters.some((p) => p.in === "path" && p.name === name)).toBe(true);
    }
  });

  it("names a known scope on every call but /me and GET /clubs, and an Idempotency-Key on every POST and DELETE", () => {
    const known = scopeList(COPY).map((s) => s.name);
    expect(known).toEqual(expect.arrayContaining(["club:read", "events:publish", "attendees:read", "webhooks:manage", "clubs:create"]));
    expect(known).toHaveLength(13);
    for (const op of ops) {
      if (op.path === "/me" || (op.method === "GET" && op.path === "/clubs")) expect(op.scopes).toEqual([]);
      else {
        expect(op.scopes.length).toBeGreaterThan(0);
        for (const s of op.scopes) expect(known).toContain(s);
      }
      if (op.method === "POST" || op.method === "DELETE") expect([op.path, op.parameters.some((p) => p.name === "Idempotency-Key")]).toEqual([op.path, true]);
      if (op.method === "PATCH" && !op.path.startsWith("/webhook-endpoints")) expect(op.parameters.some((p) => p.name === "If-Match")).toBe(true);
    }
    const scopes = (m, path) => ops.find((o) => o.method === m && o.path === path).scopes;
    // A write scope reads too; cancelling is publishing's.
    expect(scopes("GET", "/events")).toEqual(["events:read", "events:write"]);
    expect(scopes("POST", "/events/{event_id}/cancel")).toEqual(["events:publish"]);
  });

  it("names only error codes the Errors page explains, with the status it gives them", () => {
    const named = new Set();
    for (const op of ops) {
      for (const r of op.responses) {
        for (const e of r.errors) {
          named.add(e.code);
          expect([e.code, r.status]).toEqual([e.code, documented.get(e.code)]);
        }
        for (const code of /^[45]/.test(r.status) ? r.description.match(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g) || [] : []) {
          named.add(code);
          expect([code, documented.has(code)]).toEqual([code, true]);
        }
      }
    }
    expect(named.size).toBeGreaterThanOrEqual(10);
  });

  it("keeps money in paise and payments outside MyOtherApp as their own kind", () => {
    expect(deref(COPY, COPY.components.schemas.Money.properties.currency).const).toBe("INR");
    expect(deref(COPY, COPY.components.schemas.ExternalPayment.properties.status).const).toBe("paid_externally");
    const body = listOperations(COPY).find((o) => o.method === "POST" && o.path === "/events/{event_id}/registrations").requestBody;
    expect(body.schemaName).toBe("RegistrationCreate");
    expect(fieldRows(COPY, body.schema, { open: true }).map((r) => r.name)).toEqual(expect.arrayContaining(["payment", "payment.status", "payment.amount", "send_confirmation"]));
  });

  it("gives the guides their addresses: /partner/v1 under the API, OAuth beside it", () => {
    expect(apiContext(COPY)).toMatchObject({
      baseUrl: "https://api.myotherapp.in/partner/v1",
      version: "1.0.0",
      authorizeUrl: "https://api.myotherapp.in/partner/oauth/authorize",
      tokenUrl: "https://api.myotherapp.in/partner/oauth/token",
      revokeUrl: "https://api.myotherapp.in/partner/oauth/revoke",
      openapiUrl: "https://api.myotherapp.in/partner/v1/openapi.json",
      clientCredentials: true,
    });
  });
});

/* A document shaped the way FastAPI writes one: anyOf with null, no examples, $refs within $refs, a loop. */
const GENERATED = {
  openapi: "3.1.0",
  info: { title: "Generated", version: "1.2.0" },
  servers: [{ url: "/partner/v1" }],
  paths: {
    "/things/{thing_id}": {
      parameters: [{ name: "thing_id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        operationId: "get_thing_things__thing_id__get",
        summary: "Get Thing",
        security: [{ HTTPBearer: ["things:read"] }],
        responses: {
          200: { description: "Successful Response", content: { "application/json": { schema: { $ref: "#/components/schemas/Thing" } } } },
          422: { description: "Validation Error", content: { "application/json": { schema: { $ref: "#/components/schemas/HTTPValidationError" } } } },
        },
      },
    },
    "/things": {
      post: {
        summary: "Create Thing",
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/ThingIn" } } }, required: true },
        responses: { 201: { description: "Created", content: { "application/json": { schema: { $ref: "#/components/schemas/Thing" } } } } },
      },
    },
  },
  components: {
    securitySchemes: { HTTPBearer: { type: "http", scheme: "bearer" } },
    schemas: {
      Thing: {
        type: "object",
        title: "Thing",
        properties: {
          id: { type: "string" },
          when: { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] },
          parent: { anyOf: [{ $ref: "#/components/schemas/Thing" }, { type: "null" }] },
          tags: { type: "array", items: { type: "string" } },
          kind: { type: "string", enum: ["a", "b"] },
          place: { type: "object", properties: { city: { type: ["string", "null"] } } },
        },
        required: ["id"],
      },
      ThingIn: { allOf: [{ $ref: "#/components/schemas/Base" }, { type: "object", properties: { name: { type: "string" } }, required: ["name"] }] },
      Base: { type: "object", properties: { note: { type: "string", default: "hi" } } },
      HTTPValidationError: { type: "object", properties: { detail: { type: "array", items: { type: "object" } } } },
      Loop: { $ref: "#/components/schemas/Loop" },
    },
  },
};

describe("reading any OpenAPI document", () => {
  it("follows $refs, and never round a loop", () => {
    expect(deref(GENERATED, { $ref: "#/components/schemas/Loop" })).toEqual({});
    expect(lookup(GENERATED, "#/components/schemas/Nope")).toBeNull();
    expect(lookup(GENERATED, "https://elsewhere/x.json")).toBeNull();
  });

  it("says types in words", () => {
    const p = GENERATED.components.schemas.Thing.properties;
    expect(typeLabel(GENERATED, p.when)).toBe("string (date-time) or null");
    expect(typeLabel(GENERATED, p.parent)).toBe("Thing or null");
    expect(typeLabel(GENERATED, p.tags)).toBe("array of string");
    expect(typeLabel(GENERATED, p.place.properties.city)).toBe("string or null");
    expect(typeLabel(COPY, COPY.components.schemas.EventOut.properties.object)).toBe('"event"');
    expect(typeLabel(COPY, COPY.components.schemas.EventOut.properties.ticket_types)).toBe("array of TicketTypeOut");
    expect(typeLabel(COPY, COPY.components.schemas.EventCreate.properties.price)).toBe("Money or null");
  });

  it("lists a schema's fields, opening inline objects but not named ones, and allOf merged", () => {
    const rows = fieldRows(GENERATED, { $ref: "#/components/schemas/Thing" });
    expect(rows.map((r) => r.name)).toEqual(["id", "when", "parent", "tags", "kind", "place", "place.city"]);
    expect(rows.find((r) => r.name === "id").required).toBe(true);
    expect(rows.find((r) => r.name === "kind").values).toEqual(["a", "b"]);
    const input = fieldRows(GENERATED, { $ref: "#/components/schemas/ThingIn" });
    expect(input.map((r) => [r.name, r.required])).toEqual([
      ["note", false],
      ["name", true],
    ]);
    const reg = fieldRows(COPY, { $ref: "#/components/schemas/RegistrationOut" }).map((r) => r.name);
    expect(reg).toEqual(expect.arrayContaining(["status", "ticket", "payment", "person", "external_id"]));
    expect(reg).not.toContain("ticket.qr_url"); // TicketOut is its own object
    expect(fieldRows(COPY, { $ref: "#/components/schemas/RegistrationOut" }, { open: true }).map((r) => r.name)).toContain("ticket.qr_url");
  });

  it("makes an example where the document has none", () => {
    expect(exampleFor(GENERATED, { $ref: "#/components/schemas/ThingIn" })).toEqual({ note: "hi", name: "string" });
    const thing = exampleFor(GENERATED, { $ref: "#/components/schemas/Thing" });
    expect(thing).toMatchObject({ id: "string", when: "2026-11-12T10:00:00+05:30", tags: ["string"], kind: "a", place: { city: "string" } });
  });

  it("lists a generated document's operations, with path-level parameters, its tags and objects", () => {
    const ops = listOperations(GENERATED);
    expect(ops.map((o) => [o.method, o.path, o.anchor])).toEqual([
      ["GET", "/things/{thing_id}", "op-get-things-thing_id"],
      ["POST", "/things", "op-post-things"],
    ]);
    expect(ops[0].parameters).toEqual([expect.objectContaining({ name: "thing_id", in: "path", required: true })]);
    expect(ops[0].scopes).toEqual(["things:read"]);
    expect(ops[1].scopes).toEqual([]);
    expect(ops[1].requestBody.example).toEqual({ note: "hi", name: "string" });
    expect(groupByTag(GENERATED, ops).map((g) => [g.name, g.operations.length])).toEqual([["Other", 2]]);
    expect(objectsOf(GENERATED, ops).map((o) => o.name)).toEqual(["Thing", "ThingIn", "Base", "HTTPValidationError"]);
    expect(apiContext(GENERATED)).toMatchObject({ baseUrl: "https://api.myotherapp.in/partner/v1", version: "1.2.0" });
    expect(listWebhooks(GENERATED)).toEqual([]);
    expect(scopesOf(GENERATED, GENERATED.paths["/things"].post)).toEqual([]);
    expect(audienceOf(GENERATED, GENERATED.paths["/things"].post)).toBe("all");
  });

  it("reads error codes off a response's examples, and nothing off one without", () => {
    const forbidden = { description: "Refused", content: { "application/json": { examples: { a: { value: { error: { code: "FORBIDDEN_SCOPE", message: "Needs events:write." } } }, b: { summary: "Off", value: { error: { code: "NOT_ALLOCATED", message: "Off." } } } } } } };
    expect(errorCodes(GENERATED, forbidden).map((e) => [e.code, e.summary])).toEqual([
      ["FORBIDDEN_SCOPE", ""],
      ["NOT_ALLOCATED", "Off"],
    ]);
    expect(errorCodes(GENERATED, GENERATED.paths["/things/{thing_id}"].get.responses[422])).toEqual([]);
  });

  it("is not fooled by what isn't a document", () => {
    for (const bad of [null, "x", {}, { openapi: "2.0", paths: { "/a": {} } }, { openapi: "3.1.0", paths: {} }, { openapi: "3.1.0" }]) expect(isOpenApi(bad)).toBe(false);
    expect(listOperations({ openapi: "3.1.0", paths: { "/a": { get: "nope" }, "/b": null } })).toEqual([]);
  });
});

describe("curl for an operation", () => {
  it("fills the path, sends the key, an Idempotency-Key and the example body, quoting it for the shell", () => {
    const op = listOperations(COPY).find((o) => o.method === "POST" && o.path === "/events/{event_id}/registrations");
    const curl = curlFor(op, { baseUrl: apiContext(COPY).baseUrl });
    const SEP = " \\\n  ";
    expect(curl.split(SEP).slice(0, 4)).toEqual([
      "curl -X POST https://api.myotherapp.in/partner/v1/events/8812/registrations",
      '-H "Authorization: Bearer $MOA_KEY"',
      '-H "Idempotency-Key: $(uuidgen)"',
      '-H "Content-Type: application/json"',
    ]);
    const data = curl.split(SEP)[4];
    expect(data.startsWith("-d '{\n")).toBe(true);
    expect(JSON.parse(data.slice(4, -1)).person.email).toMatch(/@/);
    const withQuote = { ...op, requestBody: { example: { name: "Asha's club" } } };
    expect(curlFor(withQuote)).toContain(`-d '{\n  "name": "Asha'\\''s club"\n}'`);
    const me = listOperations(COPY).find((o) => o.path === "/me");
    expect(curlFor(me, { baseUrl: apiContext(COPY).baseUrl })).toBe(`curl https://api.myotherapp.in/partner/v1/me${SEP}-H "Authorization: Bearer $MOA_KEY"`);
    expect(curlFor({ ...me, audience: "public" })).toBe("curl https://api.myotherapp.in/partner/v1/me");
  });
});

describe("the Postman collection", () => {
  it("has every operation, in a folder per tag, with the key and base URL as variables", () => {
    const c = postmanCollection(COPY);
    expect(c.info.schema).toBe(POSTMAN_SCHEMA);
    expect(c.info.name).toBe("MyOtherApp Integrations API 1.0.0");
    expect(c.auth).toEqual({ type: "bearer", bearer: [{ key: "token", value: "{{moaKey}}", type: "string" }] });
    expect(c.variable.find((v) => v.key === "baseUrl").value).toBe("https://api.myotherapp.in/partner/v1");
    const requests = c.item.flatMap((f) => f.item);
    expect(requests).toHaveLength(listOperations(COPY).length);
    expect(c.item.map((f) => f.name)).toEqual(["Account", "Club", "Partner apps", "Events", "Registrations", "Check-ins", "Certificates", "Webhook endpoints"]);
    const reg = requests.find((r) => r.name === "Register someone");
    expect(reg.request.method).toBe("POST");
    expect(reg.request.url.path).toEqual(["events", ":event_id", "registrations"]);
    expect(reg.request.url.variable).toEqual([expect.objectContaining({ key: "event_id", value: "8812" })]);
    expect(reg.request.header).toEqual(expect.arrayContaining([expect.objectContaining({ key: "Idempotency-Key", value: "{{$guid}}" }), { key: "Content-Type", value: "application/json" }]));
    expect(JSON.parse(reg.request.body.raw).person.email).toMatch(/@/);
    expect(reg.request.description).toContain("https://myotherapp.in/developers/reference#op-post-events-event_id-registrations");
    const list = requests.find((r) => r.name === "List events");
    expect(list.request.url.query.every((q) => q.disabled)).toBe(true);
    expect(list.request.url.raw.startsWith("{{baseUrl}}/events?")).toBe(true);
    // JSON all the way down.
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});

describe("the docs' text", () => {
  it("reads code, bold and links in a line", () => {
    expect(inlineParts("Send `If-Match` or **not**, see [Errors](/developers/errors).")).toEqual([
      { text: "Send " },
      { code: "If-Match" },
      { text: " or " },
      { strong: "not" },
      { text: ", see " },
      { link: "Errors", href: "/developers/errors" },
      { text: "." },
    ]);
    expect(plain("A `code` and [a link](/x)")).toBe("A code and a link");
  });

  it("colours code without losing a character, in every language", async () => {
    const ex = await import("@/content/developers/examples");
    const samples = [
      [ex.VERIFY_NODE, "js"],
      [ex.VERIFY_NODE_USE, "js"],
      [ex.VERIFY_PYTHON, "python"],
      [ex.VERIFY_PHP, "php"],
      [ex.quickStart("https://api.myotherapp.in/partner/v1").createEvent, "bash"],
      [ex.WEBHOOK_BODY, "json"],
      [ex.ERROR_EXAMPLE, "http"],
      ["it's # not a comment\n# but this is", "bash"],
    ];
    for (const [code, lang] of samples) expect(highlight(code, lang).map((r) => r.text).join("")).toBe(code);
    const json = highlight('{"a": "b", "n": 1, "t": true}', "json");
    expect(json.filter((r) => r.kind).map((r) => [r.kind, r.text])).toEqual([
      ["key", '"a"'],
      ["str", '"b"'],
      ["key", '"n"'],
      ["num", "1"],
      ["key", '"t"'],
      ["kw", "true"],
    ]);
    expect(highlight("x = 1 # note", "python").at(-1)).toEqual({ text: "# note", kind: "com" });
    expect(highlight("curl -d '{\n \"a\": 1\n}'", "bash").find((r) => r.kind === "str").text).toBe("'{\n \"a\": 1\n}'");
  });
});
