// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../api/csp-report/route.js";
import { LINES_PER_MINUTE, MAX_BODY, blockedSource, note, pageOf, readReports, resetCspReportsForTests, takeReport } from "@/server/cspreport";

/*
 * POST /api/csp-report: what browsers say the script policy blocked (or
 * would have), kept as one short log line per kind, never with a full
 * address (some of the site's addresses are a credential).
 */

const legacy = (over = {}) =>
  JSON.stringify({
    "csp-report": {
      "document-uri": "https://myotherapp.in/tickets/MOA-7K3QF-X9PWM?k=secret",
      "violated-directive": "script-src-elem",
      "effective-directive": "script-src-elem",
      "blocked-uri": "https://evil.example/x.js?token=abc",
      disposition: "report",
      ...over,
    },
  });

const post = (body, type = "application/csp-report") =>
  new Request("https://myotherapp.in/api/csp-report", { method: "POST", headers: { "content-type": type }, body });

beforeEach(() => resetCspReportsForTests());

describe("reading a report", () => {
  it("keeps the directive, the blocked thing's origin and the page's first segment only", () => {
    expect(readReports(legacy())).toEqual([{ directive: "script-src-elem", blocked: "https://evil.example", page: "/tickets/…", disposition: "report" }]);
  });

  it("reads the Reporting API's shape too", () => {
    const body = JSON.stringify([
      { type: "csp-violation", body: { documentURL: "https://myotherapp.in/events", effectiveDirective: "frame-src", blockedURL: "https://www.google.com/maps?q=1", disposition: "enforce" } },
      { type: "deprecation", body: { id: "x" } },
    ]);
    expect(readReports(body)).toEqual([{ directive: "frame-src", blocked: "https://www.google.com", page: "/events", disposition: "enforce" }]);
  });

  it("names inline code and eval by the browser's keyword, and ignores what isn't a report", () => {
    expect(blockedSource("inline")).toBe("inline");
    expect(blockedSource("eval")).toBe("eval");
    expect(blockedSource("data:image/png;base64,AAAA")).toBe("data");
    expect(blockedSource("")).toBe("unknown");
    expect(pageOf("https://myotherapp.in/")).toBe("/");
    expect(pageOf("not a url")).toBe("unknown");
    expect(readReports("not json")).toEqual([]);
    expect(readReports(JSON.stringify({ other: 1 }))).toEqual([]);
    expect(readReports(JSON.stringify({ "csp-report": { "blocked-uri": "inline" } }))).toEqual([]);
  });
});

describe("POST /api/csp-report", () => {
  it("answers 204 and logs the first report of a kind", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await POST(post(legacy()));
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0][0];
    expect(line).toMatch(/^csp-report \{/);
    expect(line).toContain('"blocked":"https://evil.example"');
    expect(line).not.toContain("secret");
    expect(line).not.toContain("token=abc");
    expect(line).not.toContain("MOA-7K3QF");
    warn.mockRestore();
  });

  it("logs the same kind again only at its 10th, 100th and 1000th", () => {
    const log = vi.fn();
    const report = { directive: "img-src", blocked: "https://x.example", page: "/", disposition: "report" };
    for (let i = 0; i < 100; i++) note(report, { log, now: i * 60000 });
    expect(log.mock.calls.map((c) => JSON.parse(c[0].slice("csp-report ".length)).count)).toEqual([1, 10, 100]);
  });

  it("writes at most a set number of lines a minute", () => {
    const log = vi.fn();
    for (let i = 0; i < LINES_PER_MINUTE + 20; i++) note({ directive: "img-src", blocked: `https://h${i}.example`, page: "/", disposition: "report" }, { log, now: 1000 });
    expect(log).toHaveBeenCalledTimes(LINES_PER_MINUTE);
  });

  it("reads nothing too big, and never fails", async () => {
    const log = vi.fn();
    const big = "x".repeat(MAX_BODY + 1);
    expect((await takeReport(post(big), { log })).status).toBe(204);
    expect((await takeReport(post("{"), { log })).status).toBe(204);
    expect(log).not.toHaveBeenCalled();
  });
});
