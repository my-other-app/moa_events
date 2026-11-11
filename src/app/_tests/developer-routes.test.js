// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import COPY from "@/content/developers/openapi.json";
import { DOCS_PAGES, DOCS_SLUGS } from "@/content/developers/nav";
import { developerDocs } from "@/content/developers/pages";
import { apiContext, listOperations, listWebhooks, objectsOf } from "@/developers/openapi";
import { RESERVED } from "@/seo/legacy";
import { validateBreadcrumbs } from "@/seo/validate";
import { fakeFetch, outcome } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";

/*
 * /developers and its pages on the server: every page's words, menu,
 * breadcrumbs and structured data in the HTML, each its own canonical and
 * indexed; the reference has every operation, webhook and object of the
 * OpenAPI document; the document is the API's when it serves a readable
 * one and the site's copy otherwise (down, 404, nonsense), so a build
 * never fails for the API; and the two downloads.
 */
const OPENAPI = "/partner/v1/openapi.json";
const params = (page) => ({ params: Promise.resolve({ page }) });

let fetch;
const serve = (table) => {
  fetch = fakeFetch(table);
  vi.stubGlobal("fetch", fetch);
};

async function load(file) {
  vi.resetModules();
  return import(file);
}

async function render(page) {
  if (!page.slug) {
    const route = await load("../developers/page.jsx");
    return { route, meta: route.metadata, out: html(await route.default(), page.path) };
  }
  const route = await load("../developers/[page]/page.jsx");
  return { route, meta: await route.generateMetadata(params(page.slug)), out: html(await route.default(params(page.slug)), page.path) };
}

const unescape = (s) => s.replace(/<!-- -->/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

beforeEach(() => serve({ [OPENAPI]: { status: 404, body: { detail: "Not Found" } } }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("every developer docs page", () => {
  it.each(DOCS_PAGES.map((p) => [p.path, p]))("%s: renders on the server, indexed, with its canonical, menu, breadcrumbs and sections", async (path, page) => {
    const { route, meta, out } = await render(page);
    expect(route.revalidate).toBe(3600);
    expect(meta.alternates.canonical).toBe(`https://myotherapp.in${path}`);
    expect(meta.openGraph).toMatchObject({ url: `https://myotherapp.in${path}`, locale: "en_IN" });
    expect(meta.description).toBe(page.description);
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toBe(page.slug ? `${page.title} · Developers` : "Integrations API for developers");

    expect(out).toContain(`<h1 id="dv-title">${(page.heading || page.title).replace(/'/g, "&#x27;")}</h1>`);
    // The menu, twice (beside the page on a desk, "Developer docs" above it on a phone), this page marked as the one you're on.
    expect(out.match(/aria-label="Developer docs"/g)).toHaveLength(2);
    expect(out.match(/aria-current="page"/g).length).toBeGreaterThanOrEqual(2);
    for (const other of DOCS_PAGES) expect(out).toContain(`href="${other.path}"`);
    // Breadcrumbs, seen and structured.
    expect(out).toContain('aria-label="Breadcrumb"');
    const ld = jsonLdOf(out);
    const crumbs = ld.find((x) => x["@type"] === "BreadcrumbList");
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(page.slug ? ["Home", "Developers", page.title] : ["Home", "Developers"]);
    expect(ld.find((x) => x["@type"] === "TechArticle")).toMatchObject({ url: `https://myotherapp.in${path}`, inLanguage: "en-IN", headline: page.heading || page.title });
    // Every section, by its id, and in the menu's "on this page".
    const content = developerDocs(apiContext(COPY))[page.slug];
    for (const s of content.sections) {
      expect(out).toContain(`id="${s.id}"`);
      expect(out).toContain(`href="#${s.id}"`);
    }
    // The site's frame, with the footer's link here.
    expect(out).toContain('href="/developers"');
    expect(out).toContain(">Developers</a>");
    // Only the OpenAPI document is read, once at most.
    expect(fetch.calls.length).toBeLessThanOrEqual(1);
    for (const c of fetch.calls) expect(new URL(c.url).pathname).toBe(OPENAPI);
  });

  it("are made at build for each page, and anything else under /developers is a 404", async () => {
    const route = await load("../developers/[page]/page.jsx");
    expect(route.dynamicParams).toBe(false);
    expect(route.generateStaticParams()).toEqual(DOCS_SLUGS.map((page) => ({ page })));
    expect(DOCS_SLUGS).toHaveLength(13);
    expect(await outcome(() => route.default(params("nope")))).toEqual({ notFound: true });
    expect(await route.generateMetadata(params("nope"))).toEqual({});
  });

  it("walk from one to the next, Overview to Changelog", async () => {
    const { out } = await render(DOCS_PAGES.find((p) => p.slug === "webhooks"));
    expect(out).toMatch(/rel="prev"[^>]*>[\s\S]*?API reference/);
    expect(out).toMatch(/rel="next"[^>]*>[\s\S]*?Syncing both ways/);
  });

  it("keeps the word for itself: /developers is never taken for an old event address", () => {
    expect(RESERVED.has("developers")).toBe(true);
  });
});

describe("the pages' content", () => {
  it("quick start: every call of the five steps, with a copy button on each block", async () => {
    const { out } = await render(DOCS_PAGES.find((p) => p.slug === "quick-start"));
    const text = unescape(out.replace(/<[^>]+>/g, ""));
    for (const call of ["curl $MOA_API/me", "curl -X POST $MOA_API/events", "$MOA_API/events/8812/publish", "$MOA_API/events/8812/registrations", "$MOA_API/checkins", "$MOA_API/webhook-endpoints", "/webhook-endpoints/4b7e2c1a-9f3d-4e6b-8a52-0c1d2e3f4a5b/test"]) expect(text).toContain(call);
    expect(out.match(/class="dv-copy"/g).length).toBe(out.match(/<figure class="dv-code">/g).length);
    expect(text).toContain("export MOA_API=https://api.myotherapp.in/partner/v1");
  });

  it("authentication: the partner OAuth addresses, PKCE, refresh and revoke", async () => {
    const { out } = await render(DOCS_PAGES.find((p) => p.slug === "authentication"));
    const text = unescape(out.replace(/<[^>]+>/g, ""));
    for (const words of [
      "https://api.myotherapp.in/partner/oauth/authorize",
      "https://api.myotherapp.in/partner/oauth/token",
      "https://api.myotherapp.in/partner/oauth/revoke",
      "mode=test",
      'MOA-Club-Id: 311',
      "NOT_CONNECTED",
      "code_challenge_method=S256",
      "grant_type=authorization_code",
      "grant_type=refresh_token",
      "grant_type=client_credentials",
      "createHash(\"sha256\").update(verifier).digest(\"base64url\")",
      "moa_live_",
      "moa_test_",
    ])
      expect(text).toContain(words);
  });

  it("scopes: every scope, with the endpoints that need it linked into the reference", async () => {
    const { out } = await render(DOCS_PAGES.find((p) => p.slug === "scopes"));
    for (const scope of ["club:read", "club:write", "events:read", "events:write", "events:publish", "registrations:read", "registrations:write", "attendees:read", "checkins:write", "certificates:read", "certificates:write", "webhooks:manage", "clubs:create"])
      expect(out).toContain(`<code>${scope}</code>`);
    expect(out).toContain('href="/developers/reference#op-post-events-event_id-publish"');
    expect(out).toContain('id="scope-events-publish"');
  });

  it("webhooks: every type, the signature recipe in Node, Python and PHP, and the test vector", async () => {
    const { out } = await render(DOCS_PAGES.find((p) => p.slug === "webhooks"));
    const text = unescape(out.replace(/<[^>]+>/g, ""));
    for (const h of listWebhooks(COPY)) expect(out).toContain(`href="/developers/reference#${h.anchor}"`);
    for (const id of ["verify-node", "verify-python", "verify-php", "signature-example", "retries", "replay", "ordering", "duplicates"]) expect(out).toContain(`id="${id}"`);
    for (const words of ["export function verifyMoaSignature", "def verify_moa_signature", "function verify_moa_signature", "1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, 12 hours and 24 hours", "t=1794458702,v1=f9908e9d"]) expect(text).toContain(words);
  });

  it("syncing: the sequence diagram as a picture with its steps in words", async () => {
    const { out } = await render(DOCS_PAGES.find((p) => p.slug === "sync"));
    expect(out).toContain('role="img"');
    expect(out).toContain('<title id="dv-sync-title">');
    expect(out).toMatch(/<figcaption id="dv-sync-caption"[\s\S]*?<ol>(<li>[\s\S]*?<\/li>){9}<\/ol>/);
    for (const id of ["external-ids", "updated-since", "etags", "no-echo"]) expect(out).toContain(`id="${id}"`);
  });

  it("errors: every code with its status", async () => {
    const { out } = await render(DOCS_PAGES.find((p) => p.slug === "errors"));
    for (const code of ["UNAUTHENTICATED", "FORBIDDEN_SCOPE", "NOT_ALLOCATED", "NOT_FOUND", "VALIDATION", "ALREADY_EXISTS", "IDEMPOTENCY_MISMATCH", "PRECONDITION_FAILED", "PAYMENT_REQUIRED", "CANCEL_IN_DASHBOARD", "EVENT_FULL", "REGISTRATION_CLOSED", "ALREADY_CHECKED_IN", "RATE_LIMITED"])
      expect(out).toContain(`<code>${code}</code>`);
  });

  it("money and personal data, and the changelog: the rules in plain words, and v1's date", async () => {
    const money = (await render(DOCS_PAGES.find((p) => p.slug === "money-and-personal-data"))).out;
    for (const words of ["Money never moves through the API", "PAYMENT_REQUIRED", "paid_externally", "CANCEL_IN_DASHBOARD", "Digital Personal Data Protection Act, 2023", "data fiduciary", "attendees:read"]) expect(money).toContain(words);
    const log = (await render(DOCS_PAGES.find((p) => p.slug === "changelog"))).out;
    expect(log).toContain("12 November 2026: v1");
  });
});

describe("the API reference", () => {
  it("renders every operation, webhook and object of the document (the site's copy while the API has none)", async () => {
    const { out } = await render(DOCS_PAGES.find((p) => p.slug === "reference"));
    expect(out).toContain('data-source="copy"');
    const ops = listOperations(COPY);
    expect(out).toContain(`data-operations="${ops.length}"`);
    for (const op of ops) {
      const section = out.slice(out.indexOf(`<section class="dv-op" id="${op.anchor}"`));
      expect(section.length).toBeLessThan(out.length);
      const own = section.slice(0, section.indexOf("</section>"));
      expect(own).toContain(`<span class="dv-method dv-method--${op.method.toLowerCase()}">${op.method}</span>`);
      expect(own).toContain(`<code class="dv-op-path">${op.path}</code>`);
      for (const s of op.scopes || []) expect(own).toContain(`<code>${s}</code>`);
      for (const p of op.parameters) expect(own).toContain(`<code>${p.name}</code>`);
      expect(own).toContain("Example request");
      for (const r of op.responses) for (const e of r.errors) expect(own).toContain(`<code>${e.code}</code>`);
      // In the menu too, by its group.
    }
    for (const wh of listWebhooks(COPY)) expect(out).toContain(`id="${wh.anchor}"`);
    for (const obj of objectsOf(COPY, [...ops, ...listWebhooks(COPY)])) expect(out).toContain(`id="${obj.anchor}"`);
    for (const id of ["tag-events", "tag-registrations", "tag-check-ins", "tag-certificates", "tag-webhook-endpoints", "webhook-payloads", "objects"]) expect(out).toContain(`href="#${id}"`);
    // The downloads.
    expect(out).toContain('href="/developers/openapi.json"');
    expect(out).toContain('href="/developers/postman_collection.json"');
  });

  it("is made from the API's own document once the API serves one, addresses and all", async () => {
    const live = structuredClone(COPY);
    live.info.version = "1.1.0";
    live.paths["/partner/v1/events/{event_id}/waitlist"] = { get: { operationId: "get_waitlist_partner_v1_events__event_id__waitlist_get", tags: ["events"], summary: "Get the waiting list", "x-scopes": ["events:read"], parameters: [{ name: "event_id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "The list." } } } };
    live.components.securitySchemes.partnerOAuth.flows.authorizationCode.authorizationUrl = "https://api.myotherapp.in/partner/oauth2/authorize";
    serve({ [OPENAPI]: { body: live } });
    const ref = (await render(DOCS_PAGES.find((p) => p.slug === "reference"))).out;
    expect(ref).toContain('data-source="api"');
    expect(ref).toContain('id="op-get-events-event_id-waitlist"');
    expect(unescape(ref.replace(/<[^>]+>/g, ""))).toContain("OpenAPI 3.1 · version 1.1.0");
    const auth = (await render(DOCS_PAGES.find((p) => p.slug === "authentication"))).out;
    expect(unescape(auth)).toContain("https://api.myotherapp.in/partner/oauth2/authorize");
    expect(fetch.calls[0].url).toBe("https://api.myotherapp.in/partner/v1/openapi.json");
  });

  it("falls back to the copy when the API is down, slow, or sends something it can't read", async () => {
    for (const answer of [{ status: 503, body: {} }, new TypeError("fetch failed"), { body: { openapi: "3.1.0", paths: {} } }, { body: { hello: "world" } }, { body: "not json" }]) {
      serve({ [OPENAPI]: answer });
      const { out } = await render(DOCS_PAGES.find((p) => p.slug === "reference"));
      expect(out).toContain('data-source="copy"');
      expect(out).toContain('id="op-post-events"');
    }
  });

  it("asks a down API once a minute at most, not once a page", async () => {
    serve({ [OPENAPI]: new TypeError("fetch failed") });
    vi.resetModules();
    const { getOpenApi } = await import("@/server/openapi");
    const now = Date.now();
    expect((await getOpenApi({ now })).source).toBe("copy");
    expect((await getOpenApi({ now: now + 1000 })).source).toBe("copy");
    expect(fetch.calls).toHaveLength(1);
    expect((await getOpenApi({ now: now + 61_000 })).source).toBe("copy");
    expect(fetch.calls).toHaveLength(2);
  });
});

describe("the downloads", () => {
  it("/developers/openapi.json: the document, as JSON, made at build", async () => {
    const route = await load("../developers/openapi.json/route.js");
    expect(route.dynamic).toBe("force-static");
    expect(route.revalidate).toBe(3600);
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("x-openapi-source")).toBe("copy");
    expect(await res.json()).toEqual(COPY);
  });

  it("/developers/postman_collection.json: a Postman collection of every operation", async () => {
    const route = await load("../developers/postman_collection.json/route.js");
    expect(route.dynamic).toBe("force-static");
    const res = await route.GET();
    const body = await res.json();
    expect(body.info.schema).toBe("https://schema.getpostman.com/json/collection/v2.1.0/collection.json");
    expect(body.item.flatMap((f) => f.item)).toHaveLength(listOperations(COPY).length);
  });

  it("are linked from the overview, as downloads", async () => {
    const { out } = await render(DOCS_PAGES[0]);
    expect(out).toContain('download="myotherapp-integrations-v1.openapi.json"');
    expect(out).toContain('download="myotherapp-integrations-v1.postman_collection.json"');
  });
});
