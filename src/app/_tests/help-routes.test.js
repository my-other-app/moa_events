// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { fakeFetch, outcome } from "@/test/next";
import { html } from "@/test/html";
import { RESERVED } from "@/seo/legacy";
import { maskText } from "@/sentry/options";

/*
 * /help on the server: the desk's answers and topics in the HTML when the
 * API has a desk; the site's own answers and "Email us" when it answers 404
 * (today's API); and never an error page when the API is down. Its two
 * signed-in and emailed pages check their address, and the survey link is
 * a credential (never indexed, kept, framed or referred on).
 */
const params = (o) => Promise.resolve(o);
const HELP = [
  { id: 1, topic: "tickets", question: "Where is my ticket after I pay?", answer: "It comes by email within a minute." },
  { id: 2, topic: "payments", question: "How long does a refund take?", answer: "Five to seven working days, once the club refunds it." },
];
const TOPICS = [
  { key: "tickets", label: "Tickets and registration" },
  { key: "payments", label: "Payments and refunds" },
];

const load = async () => {
  vi.resetModules();
  return import("../help/page.jsx");
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/help", () => {
  it("is regenerated every five minutes, with its own title and canonical", async () => {
    vi.stubGlobal("fetch", fakeFetch({ "/api/v1/support/help": { body: HELP }, "/api/v1/support/topics": { body: TOPICS } }));
    const route = await load();
    expect(route.revalidate).toBe(300);
    expect(route.metadata.title).toBe("Help");
    expect(route.metadata.alternates.canonical).toBe("https://myotherapp.in/help");
    expect(route.metadata.openGraph).toMatchObject({ url: "https://myotherapp.in/help", locale: "en_IN" });
    expect(route.metadata.robots).toBeUndefined();
  });

  it("shows the desk's answers by topic and its topics in the form, when the API has a desk", async () => {
    const fetch = fakeFetch({ "/api/v1/support/help": { body: HELP }, "/api/v1/support/topics": { body: TOPICS } });
    vi.stubGlobal("fetch", fetch);
    const route = await load();
    const out = html(await route.default(), "/help");
    expect(out).toContain("Where is my ticket after I pay?");
    expect(out).toContain("Five to seven working days");
    expect(out).toContain('<h3 class="hp-group-title">Payments and refunds</h3>');
    expect(out).toContain('<option value="payments">Payments and refunds</option>');
    expect(out).toContain('id="ask"');
    expect(out).toContain("Never send passwords, OTPs or card numbers.");
    // Read through the data cache, kept five minutes.
    expect(fetch.calls.map((c) => c.init.next)).toEqual([
      { revalidate: 300, tags: ["help"] },
      { revalidate: 300, tags: ["help"] },
    ]);
  });

  it("without a desk (404): the site's own answers, and 'Email us' instead of the form", async () => {
    vi.stubGlobal("fetch", fakeFetch({}));
    const route = await load();
    const out = html(await route.default(), "/help");
    expect(out).toContain("Where&#x27;s my ticket?");
    expect(out).toContain("Email us");
    expect(out).toContain('href="mailto:support@myotherapp.in"');
    expect(out).not.toContain('aria-label="Ask us for help"');
  });

  it("with the API down: the site's answers and the form, never an error", async () => {
    vi.stubGlobal("fetch", fakeFetch(() => new Error("ECONNREFUSED")));
    const route = await load();
    const out = html(await route.default(), "/help");
    expect(out).toContain("Where&#x27;s my ticket?");
    expect(out).toContain('aria-label="Ask us for help"');
  });

  it("is a word of the site's own, never an old event address", () => {
    expect(RESERVED.has("help")).toBe(true);
  });
});

describe("/help/requests/{id} and /help/survey/{token}", () => {
  it("check their address on the server and are never indexed", async () => {
    const req = await import("../help/requests/[id]/page.jsx");
    expect(req.dynamic).toBe("force-dynamic");
    expect(req.metadata.robots).toEqual({ index: false, follow: false });
    expect(await outcome(() => req.default({ params: params({ id: "../x" }) }))).toEqual({ notFound: true });
    expect((await outcome(() => req.default({ params: params({ id: "1042" }) }))).value).toBeTruthy();

    const survey = await import("../help/survey/[token]/page.jsx");
    expect(survey.metadata.robots).toEqual({ index: false, follow: false });
    expect(survey.metadata.referrer).toBe("strict-origin");
    expect(await outcome(() => survey.default({ params: params({ token: "short" }), searchParams: Promise.resolve({}) }))).toEqual({ notFound: true });
    const ok = await outcome(() => survey.default({ params: params({ token: "tok-abcdefghijklmnop" }), searchParams: Promise.resolve({ solved: "no" }) }));
    expect(ok.value.props).toEqual({ token: "tok-abcdefghijklmnop", solved: false });
  });

  it("the survey link is never kept, framed or named to another site", async () => {
    const h = (await nextConfig.headers()).find((x) => x.source === "/help/survey/:token")?.headers || [];
    const value = (key) => h.find((x) => x.key === key)?.value;
    expect(value("Referrer-Policy")).toBe("strict-origin");
    expect(value("Cache-Control")).toBe("no-store, max-age=0");
    expect(value("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(value("X-Frame-Options")).toBe("DENY");
  });

  it("Sentry masks the survey link's token, on the site and the API", () => {
    expect(maskText("https://myotherapp.in/help/survey/tok-abcdefghijklmnop?solved=yes")).toBe("https://myotherapp.in/help/survey/[code]?solved=yes");
    expect(maskText("POST https://api.myotherapp.in/api/v1/support/survey/tok-abcdefghijklmnop")).toBe("POST https://api.myotherapp.in/api/v1/support/survey/[code]");
  });
});

describe("/for-clubs", () => {
  it("has the Talk to us form in its HTML, and the last call to action points at it", async () => {
    vi.stubGlobal("fetch", fakeFetch({}));
    vi.resetModules();
    const route = await import("../for-clubs/page.jsx");
    const out = html(await route.default(), "/for-clubs");
    expect(out).toContain('id="talk-to-us"');
    expect(out).toContain('aria-label="Talk to us"');
    expect(out).toContain('href="#talk-to-us"');
  });
});
