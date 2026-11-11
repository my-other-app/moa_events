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

  it("is OpenAPI 3.1, marked as written from the contract, for the partner surface", () => {
    expect(COPY.openapi).toBe("3.1.0");
    expect(isOpenApi(COPY)).toBe(true);
    expect(COPY.info["x-generated-from"]).toBe("contract");
    expect(COPY.servers[0].url).toBe("https://api.myotherapp.in/partner/v1");
  });

  it("has every resource of the contract", () => {
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
      "GET /webhook-endpoints",
      "POST /webhook-endpoints",
      "PATCH /webhook-endpoints/{endpoint_id}",
      "DELETE /webhook-endpoints/{endpoint_id}",
      "POST /webhook-endpoints/{endpoint_id}/rotate-secret",
      "POST /webhook-endpoints/{endpoint_id}/test",
      "GET /webhook-endpoints/{endpoint_id}/deliveries",
      "POST /webhook-deliveries/{delivery_id}/retry",
      "GET /openapi.json",
    ])
      expect(have).toContain(want);
    expect(ops).toHaveLength(32);
  });

  it("has the contract's 15 webhook types, each with a signed example body", () => {
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
    ]);
    for (const h of hooks) {
      expect(h.requestBody.example).toMatchObject({ type: h.path, club_id: "311", origin: { type: expect.any(String) }, data: { object: expect.any(Object) } });
      expect(h.parameters.map((p) => p.name)).toEqual(["MOA-Signature", "MOA-Event-Id"]);
    }
  });

  it("resolves every $ref, declares every path parameter, and has unique operation ids", () => {
    for (const ref of refs(COPY)) expect([ref, lookup(COPY, ref)]).toEqual([ref, expect.anything()]);
    const ids = ops.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const op of ops) {
      for (const [, name] of op.path.matchAll(/\{([^}]+)\}/g)) expect(op.parameters.some((p) => p.in === "path" && p.name === name)).toBe(true);
    }
  });

  it("names a known scope on every call but /me and the document itself, and an Idempotency-Key on every POST and DELETE", () => {
    const known = scopeList(COPY).map((s) => s.name);
    expect(known).toEqual(expect.arrayContaining(["club:read", "events:publish", "attendees:read", "webhooks:manage", "clubs:create"]));
    expect(known).toHaveLength(13);
    for (const op of ops) {
      if (op.path === "/openapi.json") expect(op.scopes).toBeNull();
      else if (op.path === "/me" || (op.method === "GET" && op.path === "/clubs")) expect(op.scopes).toEqual([]);
      else {
        expect(op.scopes.length).toBeGreaterThan(0);
        for (const s of op.scopes) expect(known).toContain(s);
      }
      const takesKey = op.parameters.some((p) => p.name === "Idempotency-Key");
      if (op.method === "POST" || op.method === "DELETE") expect([op.id, takesKey]).toEqual([op.id, true]);
      if (op.method === "PATCH") expect(op.parameters.some((p) => p.name === "If-Match") || op.path.startsWith("/webhook-endpoints")).toBe(true);
    }
  });

  it("uses only the error codes the Errors page explains, and shows each of them somewhere", () => {
    const documented = ERROR_CODES.map(([code]) => code);
    const used = new Set();
    for (const op of ops) for (const r of op.responses) for (const e of r.errors) used.add(e.code);
    for (const code of used) expect(documented).toContain(code);
    expect([...used].sort()).toEqual([...documented].sort());
    // And the status each is sent with is the one the Errors page gives.
    for (const op of ops) for (const r of op.responses) for (const e of r.errors) expect([e.code, r.status]).toEqual([e.code, String(ERROR_CODES.find(([c]) => c === e.code)[1])]);
  });

  it("is for partner apps only where the contract says (GET and POST /clubs)", () => {
    const partner = ops.filter((o) => o.audience === "partner").map((o) => `${o.method} ${o.path}`);
    expect(partner).toEqual(["GET /clubs", "POST /clubs"]);
    expect(ops.find((o) => o.path === "/openapi.json").audience).toBe("public");
    expect(ops.find((o) => o.path === "/events" && o.method === "POST").audience).toBe("all");
  });

  it("keeps money in paise and refuses paid registrations with the checkout address", () => {
    expect(COPY.components.schemas.Money.properties.currency.const).toBe("INR");
    const reg = ops.find((o) => o.id === "createRegistration");
    const conflict = reg.responses.find((r) => r.status === "409");
    expect(conflict.errors.map((e) => e.code)).toEqual(["PAYMENT_REQUIRED", "EVENT_FULL", "REGISTRATION_CLOSED", "ALREADY_EXISTS"]);
    const example = COPY.paths["/events/{event_id}/registrations"].post.responses["409"].content["application/json"].examples.PAYMENT_REQUIRED.value;
    expect(example.error.details.checkout_url).toMatch(/^https:\/\/myotherapp\.in\/events\//);
    expect(COPY.components.schemas.ExternalPayment.properties.status.const).toBe("paid_externally");
  });

  it("gives the guides their addresses", () => {
    expect(apiContext(COPY)).toMatchObject({
      baseUrl: "https://api.myotherapp.in/partner/v1",
      version: "1.0.0",
      authorizeUrl: "https://api.myotherapp.in/partner/v1/oauth/authorize",
      tokenUrl: "https://api.myotherapp.in/partner/v1/oauth/token",
      revokeUrl: "https://api.myotherapp.in/partner/v1/oauth/revoke",
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
    expect(typeLabel(COPY, COPY.components.schemas.Event.properties.price)).toBe('Price');
    expect(typeLabel(COPY, COPY.components.schemas.Price)).toBe('Money or "free"');
    expect(typeLabel(COPY, COPY.components.schemas.Event.properties.ticket_types)).toBe("array of TicketType");
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
    const event = fieldRows(COPY, { $ref: "#/components/schemas/Registration" }).map((r) => r.name);
    expect(event).toEqual(expect.arrayContaining(["approval", "approval.state", "ticket.code", "person", "payment"]));
    expect(event).not.toContain("person.email"); // Person is its own object
  });

  it("makes an example where the document has none", () => {
    expect(exampleFor(GENERATED, { $ref: "#/components/schemas/ThingIn" })).toEqual({ note: "hi", name: "string" });
    const thing = exampleFor(GENERATED, { $ref: "#/components/schemas/Thing" });
    expect(thing).toMatchObject({ id: "string", when: "2026-11-12T10:00:00+05:30", tags: ["string"], kind: "a", place: { city: "string" } });
  });

  it("lists a generated document's operations, with path-level parameters, its tags and objects", () => {
    const ops = listOperations(GENERATED);
    expect(ops.map((o) => [o.method, o.path, o.anchor])).toEqual([
      ["GET", "/things/{thing_id}", "op-get_thing_things__thing_id__get"],
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
    expect(errorCodes(COPY, COPY.components.responses.Forbidden).map((e) => e.code)).toEqual(["FORBIDDEN_SCOPE", "NOT_ALLOCATED"]);
    expect(errorCodes(GENERATED, GENERATED.paths["/things/{thing_id}"].get.responses[422])).toEqual([]);
  });

  it("is not fooled by what isn't a document", () => {
    for (const bad of [null, "x", {}, { openapi: "2.0", paths: { "/a": {} } }, { openapi: "3.1.0", paths: {} }, { openapi: "3.1.0" }]) expect(isOpenApi(bad)).toBe(false);
    expect(listOperations({ openapi: "3.1.0", paths: { "/a": { get: "nope" }, "/b": null } })).toEqual([]);
  });
});

describe("curl for an operation", () => {
  it("fills the path, sends the key, an Idempotency-Key and the example body, quoting it for the shell", () => {
    const op = listOperations(COPY).find((o) => o.id === "createRegistration");
    const curl = curlFor(op, { baseUrl: "https://api.myotherapp.in/partner/v1" });
    expect(curl.split(" \\\n  ")).toEqual([
      "curl -X POST https://api.myotherapp.in/partner/v1/events/8812/registrations",
      '-H "Authorization: Bearer $MOA_KEY"',
      '-H "Idempotency-Key: $(uuidgen)"',
      '-H "Content-Type: application/json"',
      expect.stringMatching(/^-d '\{\n {2}"person"/),
    ]);
    const withQuote = { ...op, requestBody: { example: { name: "Asha's club" } } };
    expect(curlFor(withQuote)).toContain(`-d '{\n  "name": "Asha'\\''s club"\n}'`);
    const doc = listOperations(COPY).find((o) => o.path === "/openapi.json");
    expect(curlFor(doc)).toBe("curl https://api.myotherapp.in/partner/v1/openapi.json");
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
    expect(c.item.map((f) => f.name)).toEqual(["Account", "Club", "Events", "Registrations", "Check-ins", "Certificates", "Webhook endpoints", "Partner apps", "Meta"]);
    const reg = requests.find((r) => r.name === "Register someone");
    expect(reg.request.method).toBe("POST");
    expect(reg.request.url.path).toEqual(["events", ":event_id", "registrations"]);
    expect(reg.request.url.variable).toEqual([{ key: "event_id", value: "8812", description: "The event's id." }]);
    expect(reg.request.header).toEqual(expect.arrayContaining([expect.objectContaining({ key: "Idempotency-Key", value: "{{$guid}}" }), { key: "Content-Type", value: "application/json" }]));
    expect(JSON.parse(reg.request.body.raw).person.name).toBe("Asha Rao");
    expect(reg.request.description).toContain("https://myotherapp.in/developers/reference#op-createRegistration");
    const list = requests.find((r) => r.name === "List events");
    expect(list.request.url.query.every((q) => q.disabled)).toBe(true);
    expect(requests.find((r) => r.name === "This document").request.auth).toEqual({ type: "noauth" });
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
