#!/usr/bin/env node
/**
 * Checks that the private developer docs stay private
 * (feature-register/private-dev-docs-contract.md), after `npm run build`
 * and, given an address, on a running site:
 *
 *   node scripts/check-private-docs.mjs                     the build in .next
 *   node scripts/check-private-docs.mjs https://myotherapp.in   and that site
 *
 * The build: no file anyone can be served without the server deciding (the
 * browser's bundles in .next/static, public/, and every page or file Next
 * made at build: .html, .rsc, .body, .meta, segments, in .next/server/app and
 * a standalone copy) carries words found only in the private pages or the
 * OpenAPI document; and the only /developers address made at build is
 * /developers itself. The server's own code (.next/server/**.js) does hold
 * them: it is never served as a file.
 *
 * The site: every private address answers 404 without the docs cookie,
 * noindex and private, no-store; /developers answers 200; robots.txt has
 * Disallow: /developers/; the sitemap has /developers and nothing under it.
 * Prints what it found; exits 1 if anything failed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const base = (process.argv[2] || "").replace(/\/+$/, "");

/** Words found only in the private docs and the OpenAPI document (none of them on the public page). */
const MARKERS = ["verifyMoaSignature", "code_challenge_method", "IDEMPOTENCY_MISMATCH", "op-post-events-event_id-publish", "x-generated-note", "MOA-Signature", "webhook-endpoints", "moa_test_"];
const PRIVATE = [
  "getting-access",
  "quick-start",
  "authentication",
  "scopes",
  "reference",
  "webhooks",
  "sync",
  "idempotency",
  "errors",
  "rate-limits",
  "test-mode",
  "money-and-personal-data",
  "changelog",
  "openapi.json",
  "postman_collection.json",
].map((p) => `/developers/${p}`);

let failed = 0;
const fail = (msg) => {
  failed += 1;
  console.log(`  FAIL ${msg}`);
};
const pass = (msg) => console.log(`  ok   ${msg}`);

function* files(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

const PRERENDERED = /\.(html|rsc|body|meta|txt|json)$|\.segments[\\/]/;

function checkBuild() {
  console.log("The build (.next, public)");
  if (!existsSync(join(ROOT, ".next"))) return fail("no .next here: run npm run build first");
  const served = [
    ...files(join(ROOT, ".next/static")),
    ...files(join(ROOT, "public")),
    ...[...files(join(ROOT, ".next/server/app")), ...files(join(ROOT, ".next/standalone/.next/server/app"))].filter((f) => PRERENDERED.test(f) && !f.endsWith(".nft.json")),
  ];
  let hits = 0;
  for (const f of served) {
    const text = readFileSync(f, "latin1");
    const found = MARKERS.filter((m) => text.includes(m));
    if (found.length) {
      hits += 1;
      fail(`${relative(ROOT, f)} has ${found.join(", ")}`);
    }
  }
  if (!hits) pass(`${served.length} files anyone could be served: none has the private docs' words`);
  const manifest = join(ROOT, ".next/prerender-manifest.json");
  if (existsSync(manifest)) {
    const routes = Object.keys(JSON.parse(readFileSync(manifest, "utf8")).routes || {});
    const docs = routes.filter((r) => r.startsWith("/developers"));
    if (docs.length === 1 && docs[0] === "/developers") pass("made at build under /developers: /developers only");
    else fail(`made at build under /developers: ${docs.join(", ") || "nothing (expected /developers)"}`);
  } else fail("no .next/prerender-manifest.json");
}

async function checkSite() {
  console.log(`The site (${base})`);
  for (const path of [...PRIVATE, "/developers/nope"]) {
    const res = await fetch(`${base}${path}`, { redirect: "manual" });
    const body = await res.text();
    const cache = res.headers.get("cache-control") || "";
    const ok = res.status === 404 && /private/.test(cache) && /no-store/.test(cache) && /noindex/.test(res.headers.get("x-robots-tag") || body) && !MARKERS.some((m) => body.includes(m));
    (ok ? pass : fail)(`${path} without the cookie: ${res.status}, ${cache || "no Cache-Control"}`);
  }
  const pub = await fetch(`${base}/developers`);
  (pub.status === 200 ? pass : fail)(`/developers: ${pub.status}`);
  const robots = await (await fetch(`${base}/robots.txt`)).text();
  (/^Disallow: \/developers\/$/m.test(robots) ? pass : fail)("robots.txt: Disallow: /developers/");
  const pages = await (await fetch(`${base}/sitemaps/pages.xml`)).text();
  const locs = [...pages.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).filter((p) => p.startsWith("/developers"));
  (locs.length === 1 && locs[0] === "/developers" ? pass : fail)(`the sitemap's /developers addresses: ${locs.join(", ") || "none"}`);
}

checkBuild();
if (base) await checkSite();
console.log(failed ? `\n${failed} failed` : "\nAll good");
process.exit(failed ? 1 : 0);
