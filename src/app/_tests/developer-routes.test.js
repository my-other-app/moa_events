// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import COPY from "@/content/developers/openapi.json";
import { DOCS_PAGES, DOCS_SLUGS } from "@/content/developers/nav";
import { ERROR_CODES, developerDocs } from "@/content/developers/pages";
import { apiContext, listOperations, listWebhooks, objectsOf, scopeList } from "@/developers/openapi";
import { RESERVED } from "@/seo/legacy";
import { validateBreadcrumbs } from "@/seo/validate";
import { fakeFetch, outcome } from "@/test/next";
import { html, jsonLdOf } from "@/test/html";

/*
 * /developers and its pages on the server (feature-register/private-dev-docs-contract.md).
 *
 * /developers is the one public page: indexed, its own canonical, en-IN,
 * breadcrumbs, the footer's link, made at build, and none of the API's
 * details (no endpoint, field, scope, error code or code sample).
 *
 * Every other page, and both downloads, are private: without a good docs
 * cookie (the API asked, mocked here) each is the docs' 404 with a title
 * that names nothing; with one, the page renders, noindex, with its menu,
 * "Sign out of the docs", breadcrumbs and sections. Nothing private is
 * made at build: the pages read the cookie and have no static params.
 * The reference is the API's OpenAPI document when it serves a readable
 * one (asked with the site's server credential), else the site's copy.
 */
const OPENAPI = "/partner/v1/openapi.json";
const ACCESS = "/api/v1/developers/access";
const GOOD = `moa_docs_${"G".repeat(43)}`;
const REFUSED = `moa_docs_${"R".repeat(43)}`;
const SITE_TOKEN = "site-token-0123456789abcdefghijklmnopqrstuv";
const params = (page) => ({ params: Promise.resolve({ page }) });
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

let jar = {};
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name) => (name in jar ? { name, value: jar[name] } : undefined) }),
  headers: async () => requestHeaders,
}));

/** The API's docs check: GOOD is a club's 7-day link, anything else a 404. */
const accessCheck = (u, init) =>
  init?.headers?.["MOA-Docs-Token"] === GOOD ? { body: { ok: true, kind: "club", expires_at: inDays(7), club: { id: 311, name: "Circuit Society" } } } : { status: 404, body: { ok: false } };

let fetch;
const serve = ({ openapi = { status: 404, body: { detail: "Not Found" } }, access = accessCheck } = {}) => {
  fetch = fakeFetch((u, init) => (u.pathname === OPENAPI ? (typeof openapi === "function" ? openapi(u, init) : openapi) : u.pathname === ACCESS ? access(u, init) : undefined));
  vi.stubGlobal("fetch", fetch);
};
const callsTo = (path) => fetch.calls.filter((c) => new URL(c.url).pathname === path);

async function load(file) {
  vi.resetModules();
  return import(file);
}

/** A private page as the server makes it, for a visitor holding `cookie` (null: no docs cookie). */
async function renderPrivate(slug, { cookie = GOOD } = {}) {
  jar = cookie ? { moa_docs: cookie } : {};
  const route = await load("../developers/[page]/page.jsx");
  const meta = await route.generateMetadata(params(slug));
  const done = await outcome(() => route.default(params(slug)));
  return { route, meta, notFound: Boolean(done.notFound), out: done.value ? html(done.value, `/developers/${slug}`) : null };
}

async function renderPublic() {
  const route = await load("../developers/page.jsx");
  return { route, meta: route.metadata, out: html(await route.default(), "/developers") };
}

const unescape = (s) => s.replace(/<!-- -->/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const textOf = (out) => unescape(out.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " "));

/** A download as a visitor holding `cookie` gets it. */
async function download(file, { cookie = GOOD } = {}) {
  const route = await load(`../developers/${file}/route.js`);
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(`https://myotherapp.in/developers/${file}`, { headers: cookie ? { cookie: `moa_docs=${cookie}` } : {} });
  return { route, res: await route.GET(req) };
}

beforeEach(() => {
  jar = {};
  requestHeaders = new Headers();
  serve();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/developers, the one public page", () => {
  it("renders on the server at build, indexed, with its canonical, en-IN, breadcrumbs and the footer's link", async () => {
    const { route, meta, out } = await renderPublic();
    expect(route.dynamic).toBe("force-static");
    expect(meta.alternates.canonical).toBe("https://myotherapp.in/developers");
    expect(meta.openGraph).toMatchObject({ url: "https://myotherapp.in/developers", locale: "en_IN" });
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toBe("Integrations API for developers");
    expect(out).toContain('<h1 id="dv-title">The MyOtherApp Integrations API</h1>');
    expect(out).toContain('aria-label="Breadcrumb"');
    const ld = jsonLdOf(out);
    const crumbs = ld.find((x) => x["@type"] === "BreadcrumbList");
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Home", "Developers"]);
    expect(ld.find((x) => x["@type"] === "TechArticle")).toMatchObject({ url: "https://myotherapp.in/developers", inLanguage: "en-IN" });
    expect(out).toContain('href="/developers"');
    expect(out).toContain(">Developers</a>");
    // It reads nothing: no OpenAPI document, no docs check.
    expect(fetch.calls).toEqual([]);
  });

  it("says what the API does, the two ways in, that access is per club, how to ask, and where people with access go", async () => {
    const { out } = await renderPublic();
    const text = textOf(out);
    for (const words of [
      "Publish events",
      "Take registrations",
      "Check people in",
      "Issue certificates",
      "signed webhooks",
      "Club API keys",
      "Partner apps",
      "Access is given per club",
      "Settings → Integrations",
      "developers@myotherapp.in",
      "Already have access?",
      "Open the docs from your dashboard",
    ])
      expect(text).toContain(words);
    expect(out).toContain('href="mailto:developers@myotherapp.in?subject=');
  });

  it("names no endpoint, field, scope, error code or code sample, and links to no private page", async () => {
    const { out } = await renderPublic();
    const text = textOf(out);
    expect(out).not.toMatch(/<code|<pre/);
    expect(out).not.toContain('href="/developers/');
    expect(out).not.toContain('aria-label="Developer docs"');
    for (const words of ["/partner", "/api/", "/v1", "openapi", "OpenAPI 3", "postman_collection", "Authorization", "Bearer", "curl", "MOA-", "Idempotency", "X-Request-Id", "api.myotherapp.in", "moa_live_", "moa_test_", "moa_docs_"])
      expect(text).not.toContain(words);
    for (const op of listOperations(COPY)) expect(text).not.toContain(op.path);
    for (const s of scopeList(COPY)) expect(text).not.toContain(s.name);
    for (const [code] of ERROR_CODES) expect(text).not.toContain(code);
    // The document's field names (those that can't be ordinary words).
    const fields = new Set();
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (o.properties) for (const k of Object.keys(o.properties)) if (k.includes("_")) fields.add(k);
      for (const v of Object.values(o)) walk(v);
    };
    walk(COPY);
    expect(fields.size).toBeGreaterThan(20);
    for (const f of fields) expect(text).not.toContain(f);
  });

  it("keeps the word for itself: /developers is never taken for an old event address", () => {
    expect(RESERVED.has("developers")).toBe(true);
  });
});

describe("the private pages", () => {
  it("are 13, none made at build: no static params, nothing kept, the cookie read on each request", async () => {
    const route = await load("../developers/[page]/page.jsx");
    expect(DOCS_SLUGS).toHaveLength(13);
    expect(route.generateStaticParams).toBeUndefined();
    expect(route.revalidate).toBeUndefined();
    expect(route.dynamic).toBeUndefined();
    expect(route.dynamicParams).toBeUndefined();
  });

  it.each(DOCS_SLUGS)("/developers/%s without a docs cookie: the docs' 404, a title that names nothing, the API never asked", async (slug) => {
    const { meta, notFound, out } = await renderPrivate(slug, { cookie: null });
    expect(notFound).toBe(true);
    expect(out).toBeNull();
    expect(meta).toEqual({ title: "Not found", robots: { index: false, follow: false } });
    expect(fetch.calls).toEqual([]);
  });

  it.each(DOCS_SLUGS)("/developers/%s with a token the API refuses: the same 404", async (slug) => {
    const { meta, notFound } = await renderPrivate(slug, { cookie: REFUSED });
    expect(notFound).toBe(true);
    expect(meta.title).toBe("Not found");
    expect(callsTo(ACCESS).length).toBeGreaterThanOrEqual(1);
    expect(callsTo(OPENAPI)).toEqual([]);
  });

  it("a cookie that isn't a docs token is never sent to the API", async () => {
    for (const cookie of ["nope", "moa_live_abcdefghijklmnopqrstuvwxyz", `moa_docs_${"x".repeat(200)}`, "moa_docs_short", "moa_docs_has spaces in it, not a token"]) {
      expect((await renderPrivate("webhooks", { cookie })).notFound).toBe(true);
    }
    expect(fetch.calls).toEqual([]);
  });

  it.each(DOCS_PAGES.filter((p) => p.slug).map((p) => [p.path, p]))("%s with a good docs cookie: renders, noindex, with its menu, sign-out, breadcrumbs and sections", async (path, p) => {
    const { meta, out, notFound } = await renderPrivate(p.slug);
    expect(notFound).toBe(false);
    expect(meta.title).toBe(`${p.title} · Developers`);
    expect(meta.description).toBe(p.description);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates.canonical).toBeUndefined();

    expect(out).toContain(`<h1 id="dv-title">${(p.heading || p.title).replace(/'/g, "&#x27;")}</h1>`);
    // The menu, twice (beside the page on a desk, "Developer docs" above it on a phone), this page marked as the one you're on.
    expect(out.match(/aria-label="Developer docs"/g)).toHaveLength(2);
    expect(out.match(/aria-current="page"/g).length).toBeGreaterThanOrEqual(2);
    for (const other of DOCS_PAGES) expect(out).toContain(`href="${other.path}"`);
    // "Sign out of the docs", in both menus, a plain link.
    expect(out.match(/<a href="\/developers\/sign-out" rel="nofollow">/g)).toHaveLength(2);
    expect(textOf(out)).toContain("Sign out of the docs");
    // Breadcrumbs, seen and structured.
    expect(out).toContain('aria-label="Breadcrumb"');
    const ld = jsonLdOf(out);
    const crumbs = ld.find((x) => x["@type"] === "BreadcrumbList");
    expect(validateBreadcrumbs(crumbs).errors).toEqual([]);
    expect(crumbs.itemListElement.map((i) => i.name)).toEqual(["Home", "Developers", p.title]);
    expect(ld.find((x) => x["@type"] === "TechArticle")).toMatchObject({ url: `https://myotherapp.in${path}`, inLanguage: "en-IN", headline: p.heading || p.title });
    // Every section, by its id, and in the menu's "on this page".
    const content = developerDocs(apiContext(COPY))[p.slug];
    for (const s of content.sections) {
      expect(out).toContain(`id="${s.id}"`);
      expect(out).toContain(`href="#${s.id}"`);
    }
    // The site's frame, with the footer's link to the public page.
    expect(out).toContain(">Developers</a>");
    // The docs check once (the title and the page share the answer), the OpenAPI document once at most, nothing else.
    expect(callsTo(ACCESS)).toHaveLength(1);
    expect(callsTo(OPENAPI).length).toBeLessThanOrEqual(1);
    expect(fetch.calls.length).toBe(callsTo(ACCESS).length + callsTo(OPENAPI).length);
  });

  it("anything else under /developers is the same 404, even with a good cookie", async () => {
    const { notFound, meta } = await renderPrivate("nope");
    expect(notFound).toBe(true);
    expect(meta.title).toBe("Not found");
    expect((await renderPrivate("")).notFound).toBe(true);
  });

  it("the 404 says the docs are private and where the way in is, in the site's frame", async () => {
    const nf = await load("../developers/[page]/not-found.jsx");
    expect(nf.metadata.robots).toEqual({ index: false, follow: false });
    const out = html(nf.default(), "/developers/webhooks");
    const text = textOf(out);
    expect(text).toContain("These docs are private");
    expect(text).toContain("If your club has API access, open them from your dashboard: Settings → Integrations.");
    expect(out).toContain('<a href="/developers">About the MyOtherApp API</a>');
    expect(out).not.toContain('aria-label="Developer docs"');
  });

  it("walk from one to the next, Getting access to Changelog", async () => {
    const { out } = await renderPrivate("webhooks");
    expect(out).toMatch(/rel="prev"[^>]*>[\s\S]*?API reference/);
    expect(out).toMatch(/rel="next"[^>]*>[\s\S]*?Syncing both ways/);
  });

  it("the docs check sends the token in MOA-Docs-Token (never in the address), with the site's credential and the visitor's address", async () => {
    vi.stubEnv("API_SITE_TOKEN", SITE_TOKEN);
    requestHeaders = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    await renderPrivate("errors");
    const [call] = callsTo(ACCESS);
    expect(call.url).toBe("https://api.myotherapp.in/api/v1/developers/access");
    expect(call.init.headers).toMatchObject({ "MOA-Docs-Token": GOOD, "X-Site-Token": SITE_TOKEN, "X-Visitor-IP": "203.0.113.9" });
    expect(call.init.cache).toBe("no-store");
  });
});

describe("the pages' content (with a docs cookie)", () => {
  it("quick start: every call of the five steps, with a copy button on each block", async () => {
    const { out } = await renderPrivate("quick-start");
    const text = unescape(out.replace(/<[^>]+>/g, ""));
    for (const call of ["curl $MOA_API/me", "curl -X POST $MOA_API/events", "$MOA_API/events/8812/publish", "$MOA_API/events/8812/registrations", "$MOA_API/checkins", "$MOA_API/webhook-endpoints", "/webhook-endpoints/4b7e2c1a-9f3d-4e6b-8a52-0c1d2e3f4a5b/test"]) expect(text).toContain(call);
    expect(out.match(/class="dv-copy"/g).length).toBe(out.match(/<figure class="dv-code">/g).length);
    expect(text).toContain("export MOA_API=https://api.myotherapp.in/partner/v1");
  });

  it("authentication: the partner OAuth addresses, PKCE, refresh and revoke", async () => {
    const { out } = await renderPrivate("authentication");
    const text = unescape(out.replace(/<[^>]+>/g, ""));
    for (const words of [
      "https://api.myotherapp.in/partner/oauth/authorize",
      "https://api.myotherapp.in/partner/oauth/token",
      "https://api.myotherapp.in/partner/oauth/revoke",
      "mode=test",
      "MOA-Club-Id: 311",
      "NOT_CONNECTED",
      "code_challenge_method=S256",
      "grant_type=authorization_code",
      "grant_type=refresh_token",
      "grant_type=client_credentials",
      'createHash("sha256").update(verifier).digest("base64url")',
      "moa_live_",
      "moa_test_",
    ])
      expect(text).toContain(words);
  });

  it("scopes: every scope, with the endpoints that need it linked into the reference", async () => {
    const { out } = await renderPrivate("scopes");
    for (const scope of ["club:read", "club:write", "events:read", "events:write", "events:publish", "registrations:read", "registrations:write", "attendees:read", "checkins:write", "certificates:read", "certificates:write", "webhooks:manage", "clubs:create"])
      expect(out).toContain(`<code>${scope}</code>`);
    expect(out).toContain('href="/developers/reference#op-post-events-event_id-publish"');
    expect(out).toContain('id="scope-events-publish"');
  });

  it("webhooks: every type, the signature recipe in Node, Python and PHP, and the test vector", async () => {
    const { out } = await renderPrivate("webhooks");
    const text = unescape(out.replace(/<[^>]+>/g, ""));
    for (const h of listWebhooks(COPY)) expect(out).toContain(`href="/developers/reference#${h.anchor}"`);
    for (const id of ["verify-node", "verify-python", "verify-php", "signature-example", "retries", "replay", "ordering", "duplicates"]) expect(out).toContain(`id="${id}"`);
    for (const words of ["export function verifyMoaSignature", "def verify_moa_signature", "function verify_moa_signature", "1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, 12 hours and 24 hours", "t=1794458702,v1=f9908e9d"]) expect(text).toContain(words);
  });

  it("syncing: the sequence diagram as a picture with its steps in words", async () => {
    const { out } = await renderPrivate("sync");
    expect(out).toContain('role="img"');
    expect(out).toContain('<title id="dv-sync-title">');
    expect(out).toMatch(/<figcaption id="dv-sync-caption"[\s\S]*?<ol>(<li>[\s\S]*?<\/li>){9}<\/ol>/);
    for (const id of ["external-ids", "updated-since", "etags", "no-echo"]) expect(out).toContain(`id="${id}"`);
  });

  it("errors: every code with its status", async () => {
    const { out } = await renderPrivate("errors");
    for (const code of ["UNAUTHENTICATED", "FORBIDDEN_SCOPE", "NOT_ALLOCATED", "NOT_FOUND", "VALIDATION", "ALREADY_EXISTS", "IDEMPOTENCY_MISMATCH", "PRECONDITION_FAILED", "PAYMENT_REQUIRED", "CANCEL_IN_DASHBOARD", "EVENT_FULL", "REGISTRATION_CLOSED", "ALREADY_CHECKED_IN", "RATE_LIMITED"])
      expect(out).toContain(`<code>${code}</code>`);
  });

  it("money and personal data, and the changelog: the rules in plain words, and v1's date", async () => {
    const money = (await renderPrivate("money-and-personal-data")).out;
    for (const words of ["Money never moves through the API", "PAYMENT_REQUIRED", "paid_externally", "CANCEL_IN_DASHBOARD", "Digital Personal Data Protection Act, 2023", "data fiduciary", "attendees:read"]) expect(money).toContain(words);
    const log = (await renderPrivate("changelog")).out;
    expect(log).toContain("12 November 2026: v1");
  });
});

describe("the API reference (with a docs cookie)", () => {
  it("renders every operation, webhook and object of the document (the site's copy while the API has none)", async () => {
    const { out } = await renderPrivate("reference");
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
    }
    for (const wh of listWebhooks(COPY)) expect(out).toContain(`id="${wh.anchor}"`);
    for (const obj of objectsOf(COPY, [...ops, ...listWebhooks(COPY)])) expect(out).toContain(`id="${obj.anchor}"`);
    for (const id of ["basics", "versions", "openapi", "tag-events", "tag-registrations", "tag-check-ins", "tag-certificates", "tag-webhook-endpoints", "webhook-payloads", "objects"]) expect(out).toContain(`href="#${id}"`);
    // What the public overview used to tell developers is here now: the basics, versions, and that the document needs a key.
    const text = unescape(out.replace(/<[^>]+>/g, ""));
    expect(text).toContain("Money is in paise");
    expect(text).toContain("v1 only grows");
    expect(text).toContain("https://api.myotherapp.in/partner/v1/openapi.json to a call made with your key or token");
    expect(text).not.toContain("no key needed");
    // The downloads, from here.
    expect(out).toContain('href="/developers/openapi.json"');
    expect(out).toContain('href="/developers/postman_collection.json"');
    expect(out).toContain('download="myotherapp-integrations-v1.openapi.json"');
    expect(out).toContain('download="myotherapp-integrations-v1.postman_collection.json"');
  });

  it("is made from the API's own document once the API serves one, asked for with the site's server credential", async () => {
    vi.stubEnv("API_SITE_TOKEN", SITE_TOKEN);
    const live = structuredClone(COPY);
    live.info.version = "1.1.0";
    live.paths["/partner/v1/events/{event_id}/waitlist"] = { get: { operationId: "get_waitlist_partner_v1_events__event_id__waitlist_get", tags: ["events"], summary: "Get the waiting list", "x-scopes": ["events:read"], parameters: [{ name: "event_id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "The list." } } } };
    live.components.securitySchemes.partnerOAuth.flows.authorizationCode.authorizationUrl = "https://api.myotherapp.in/partner/oauth2/authorize";
    // The API's document is private: only the site's credential gets it.
    serve({ openapi: (u, init) => (init?.headers?.["X-Site-Token"] === SITE_TOKEN ? { body: live } : { status: 401, body: { error: { code: "UNAUTHENTICATED" } } }) });
    const ref = (await renderPrivate("reference")).out;
    expect(ref).toContain('data-source="api"');
    expect(ref).toContain('id="op-get-events-event_id-waitlist"');
    expect(unescape(ref.replace(/<[^>]+>/g, ""))).toContain("OpenAPI 3.1 · version 1.1.0");
    const auth = (await renderPrivate("authentication")).out;
    expect(unescape(auth)).toContain("https://api.myotherapp.in/partner/oauth2/authorize");
    expect(callsTo(OPENAPI)[0].url).toBe("https://api.myotherapp.in/partner/v1/openapi.json");
    expect(callsTo(OPENAPI)[0].init.headers["X-Site-Token"]).toBe(SITE_TOKEN);
  });

  it("falls back to the copy when the API is down, slow, refuses the site (401), or sends something it can't read", async () => {
    for (const answer of [{ status: 503, body: {} }, { status: 401, body: {} }, new TypeError("fetch failed"), { body: { openapi: "3.1.0", paths: {} } }, { body: { hello: "world" } }, { body: "not json" }]) {
      serve({ openapi: answer });
      const { out } = await renderPrivate("reference");
      expect(out).toContain('data-source="copy"');
      expect(out).toContain('id="op-post-events"');
    }
  });

  it("asks a down API once a minute at most, not once a page", async () => {
    serve({ openapi: new TypeError("fetch failed") });
    vi.resetModules();
    const { getOpenApi } = await import("@/server/openapi");
    const now = Date.now();
    expect((await getOpenApi({ now })).source).toBe("copy");
    expect((await getOpenApi({ now: now + 1000 })).source).toBe("copy");
    expect(callsTo(OPENAPI)).toHaveLength(1);
    expect((await getOpenApi({ now: now + 61_000 })).source).toBe("copy");
    expect(callsTo(OPENAPI)).toHaveLength(2);
  });
});

describe("the downloads are private too", () => {
  it.each(["openapi.json", "postman_collection.json"])("/developers/%s: never made at build, and the docs' 404 without a good cookie", async (file) => {
    for (const cookie of [null, REFUSED, "nonsense"]) {
      const { route, res } = await download(file, { cookie });
      expect(route.dynamic).toBeUndefined();
      expect(route.revalidate).toBeUndefined();
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      const body = await res.text();
      expect(body).toContain("These docs are private");
      expect(body).not.toContain('"openapi"');
    }
    // The document was never read for them.
    expect(callsTo(OPENAPI)).toEqual([]);
  });

  it("/developers/openapi.json with a good cookie: the document, as JSON, private and never kept", async () => {
    const { res } = await download("openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("x-openapi-source")).toBe("copy");
    expect(await res.json()).toEqual(COPY);
  });

  it("/developers/postman_collection.json with a good cookie: a Postman collection of every operation", async () => {
    const { res } = await download("postman_collection.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.info.schema).toBe("https://schema.getpostman.com/json/collection/v2.1.0/collection.json");
    expect(body.item.flatMap((f) => f.item)).toHaveLength(listOperations(COPY).length);
  });
});
