import "server-only";

/**
 * What the browser says the site's script policy (next.config.mjs) blocked,
 * or would have blocked while it is only reported: one short log line per
 * kind of report, so the policy can be watched in the site's own log
 * (`docker compose logs website | grep csp-report`) with or without Sentry.
 *
 * Both shapes browsers send are read: `report-uri`'s
 * ({"csp-report": {...}}, application/csp-report) and the Reporting API's
 * ([{type: "csp-violation", body: {...}}], application/reports+json).
 *
 * Only what locates the problem is kept: the directive, where the blocked
 * thing came from (an origin, or a keyword such as "inline" or "eval"), and
 * the page's first path segment. Never a full address: some of the site's
 * addresses are themselves a credential (a ticket, a claim link).
 *
 * The same kind is logged the first time it is seen, then at its 10th,
 * 100th and 1000th; at most LINES_PER_MINUTE lines a minute in all, and
 * MAX_KINDS kinds kept in memory. Every answer is a 204.
 */

export const MAX_BODY = 16 * 1024;
export const LINES_PER_MINUTE = 60;
export const MAX_KINDS = 500;
const LOG_AT = new Set([1, 10, 100, 1000]);

const kinds = new Map();
let minute = 0;
let lines = 0;

const str = (v) => (typeof v === "string" ? v.trim() : "");
const short = (v, n = 80) => str(v).replace(/[^\x20-\x7e]/g, "").slice(0, n);

/** Where the blocked thing came from: an origin, or the browser's keyword for it. */
export function blockedSource(raw) {
  const v = str(raw);
  if (!v) return "unknown";
  if (/^(inline|eval|self|wasm-eval|trusted-types-policy|trusted-types-sink)$/i.test(v)) return v.toLowerCase();
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "wss:" || u.protocol === "ws:") return `${u.protocol}//${u.host}`;
    return u.protocol.replace(/:$/, "");
  } catch {
    return short(v.split(/[/?#]/)[0], 40) || "unknown";
  }
}

/** The page's first path segment ("/events/…"), never the whole address. */
export function pageOf(raw) {
  try {
    const u = new URL(str(raw));
    const first = u.pathname.split("/").filter(Boolean)[0];
    if (!first) return "/";
    return `/${short(first, 40)}${u.pathname.split("/").filter(Boolean).length > 1 ? "/…" : ""}`;
  } catch {
    return "unknown";
  }
}

/** One report's kind: {directive, blocked, page, disposition}, or null for something that isn't one. */
export function readOne(body) {
  if (!body || typeof body !== "object") return null;
  const directive = short(body["effective-directive"] || body.effectiveDirective || body["violated-directive"] || body.violatedDirective, 40).split(" ")[0];
  if (!directive) return null;
  return {
    directive,
    blocked: blockedSource(body["blocked-uri"] ?? body.blockedURL),
    page: pageOf(body["document-uri"] ?? body.documentURL),
    disposition: short(body.disposition, 10) || "unknown",
  };
}

/** Every report in a body, whichever shape it came in. */
export function readReports(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (Array.isArray(data)) {
    return data
      .slice(0, 20)
      .filter((r) => r && typeof r === "object" && (r.type === "csp-violation" || r.type === undefined))
      .map((r) => readOne(r.body))
      .filter(Boolean);
  }
  const one = readOne(data?.["csp-report"]);
  return one ? [one] : [];
}

/** Counts a kind and logs it when its count calls for it and the minute's lines allow. */
export function note(report, { now = Date.now(), log = console.warn } = {}) {
  const key = `${report.disposition}|${report.directive}|${report.blocked}|${report.page}`;
  let count = kinds.get(key);
  if (count === undefined) {
    if (kinds.size >= MAX_KINDS) return false;
    count = 0;
  }
  count += 1;
  kinds.set(key, count);
  if (!LOG_AT.has(count)) return false;
  const m = Math.floor(now / 60000);
  if (m !== minute) {
    minute = m;
    lines = 0;
  }
  if (lines >= LINES_PER_MINUTE) return false;
  lines += 1;
  log(`csp-report ${JSON.stringify({ ...report, count })}`);
  return true;
}

const NO_CONTENT = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/** POST /api/csp-report. */
export async function takeReport(request, { log = console.warn, now = Date.now() } = {}) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY) return NO_CONTENT();
  let text = "";
  try {
    text = await request.text();
  } catch {
    return NO_CONTENT();
  }
  if (text.length > MAX_BODY) return NO_CONTENT();
  for (const report of readReports(text)) note(report, { now, log });
  return NO_CONTENT();
}

/** For tests: forget every kind and the minute's count. */
export function resetCspReportsForTests() {
  kinds.clear();
  minute = 0;
  lines = 0;
}
