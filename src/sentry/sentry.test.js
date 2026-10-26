import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Sentry: fully off without a DSN (nothing imported, nothing listening,
 * nothing sent), loaded after the page with one, and nothing personal in
 * what it would send.
 */
const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  captureRequestError: vi.fn(),
  httpIntegration: vi.fn((options) => ({ name: "Http", options })),
  addIntegration: vi.fn(),
  replayIntegration: vi.fn((options) => ({ name: "Replay", options })),
}));
vi.mock("@sentry/nextjs", () => sdk);

const DSN = "https://public@o1.ingest.sentry.io/2";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const PERSON = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

async function fresh() {
  vi.resetModules();
  return {
    lazy: await import("./lazy"),
    instrumentation: await import("../instrumentation"),
    options: await import("./options"),
  };
}

let idle;
beforeEach(() => {
  for (const fn of Object.values(sdk)) fn.mockClear();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_RELEASE", "");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_RATE", "");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  idle = [];
  window.requestIdleCallback = (cb) => idle.push(cb);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete window.requestIdleCallback;
});

describe("without a DSN", () => {
  it.each([[""], ["   "]])("never starts, in the browser or on the server (DSN %j)", async (dsn) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", dsn);
    const listen = vi.spyOn(window, "addEventListener");
    const { lazy, instrumentation } = await fresh();

    expect(lazy.startSentry()).toBe(false);
    expect(listen).not.toHaveBeenCalled();
    expect(idle).toEqual([]);
    await expect(lazy.loadSentry()).resolves.toBeNull();
    lazy.reportError(new Error("boom"));
    lazy.onRouterTransitionStart("/events", "push");

    await instrumentation.register();
    await instrumentation.onRequestError(new Error("boom"), { path: "/", method: "GET", headers: {} }, {});
    await new Promise((r) => setTimeout(r, 0));

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.captureRequestError).not.toHaveBeenCalled();
    expect(sdk.captureRouterTransitionStart).not.toHaveBeenCalled();
    listen.mockRestore();
  });
});

describe("with a DSN, in the browser", () => {
  const quiet = (e) => e.preventDefault();
  beforeEach(() => window.addEventListener("error", quiet));
  afterEach(() => window.removeEventListener("error", quiet));
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "abc1234");
  });

  it("loads only a while after the page, when the browser is idle, and sends what was thrown before", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const { lazy } = await fresh();
    const unlisten = vi.spyOn(window, "removeEventListener");
    expect(lazy.startSentry()).toBe(true);
    expect(lazy.startSentry()).toBe(false); // once
    // (cancelled, so the test runner doesn't take it for its own)
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("early"), message: "early", cancelable: true }));
    expect(sdk.init).not.toHaveBeenCalled();

    expect(idle).toHaveLength(0);
    vi.advanceTimersByTime(lazy.LOAD_DELAY_MS - 1);
    expect(idle).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(idle).toHaveLength(1);
    vi.useRealTimers();
    expect(sdk.init).not.toHaveBeenCalled();
    idle[0]();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));

    const options = sdk.init.mock.calls[0][0];
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      release: "moa-events@abc1234",
      sendDefaultPii: false,
      tracesSampleRate: 0.05,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      tracePropagationTargets: [],
    });
    expect(sdk.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "early" }), expect.anything());
    expect(sdk.replayIntegration).not.toHaveBeenCalled();

    // After it is in, window errors are the SDK's own business: nothing held any more.
    expect(unlisten).toHaveBeenCalledWith("error", expect.any(Function));
    expect(unlisten).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
    unlisten.mockRestore();
    lazy.onRouterTransitionStart("/clubs", "push");
    expect(sdk.captureRouterTransitionStart).toHaveBeenCalledWith("/clubs", "push");
  });

  it("sends an error a boundary caught", async () => {
    const { lazy } = await fresh();
    const error = new Error("render failed");
    lazy.reportError(error);
    await vi.waitFor(() => expect(sdk.captureException).toHaveBeenCalledWith(error));
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("adds a masked replay only when a rate is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_RATE", "0.5");
    const { lazy } = await fresh();
    await lazy.loadSentry();
    await vi.waitFor(() => expect(sdk.addIntegration).toHaveBeenCalled());
    expect(sdk.init.mock.calls[0][0]).toMatchObject({ replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0.5 });
    expect(sdk.replayIntegration).toHaveBeenCalledWith({ maskAllText: true, maskAllInputs: true, blockAllMedia: true });
  });

  it("takes a traces rate between 0 and 1 and ignores anything else", async () => {
    const { options } = await fresh();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "0.2");
    expect(options.browserOptions().tracesSampleRate).toBe(0.2);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "5");
    expect(options.browserOptions().tracesSampleRate).toBe(0.05);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "lots");
    expect(options.browserOptions().tracesSampleRate).toBe(0.05);
  });
});

describe("with a DSN, on the server", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "def5678");
  });

  it("starts in register() without reading request bodies, and reports request errors", async () => {
    const { instrumentation } = await fresh();
    await instrumentation.register();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const options = sdk.init.mock.calls[0][0];
    expect(options).toMatchObject({ dsn: DSN, environment: "preview", release: "moa-events@def5678", sendDefaultPii: false });
    expect(options.integrations).toEqual([{ name: "Http", options: { disableIncomingRequestSpans: true, maxIncomingRequestBodySize: "none" } }]);

    const error = new Error("render failed");
    const request = { path: "/events/x", method: "GET", headers: {} };
    await instrumentation.onRequestError(error, request, { routerKind: "App Router" });
    expect(sdk.captureRequestError).toHaveBeenCalledWith(error, request, { routerKind: "App Router" });
  });

  it("names a local build's environment as such", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    const { options } = await fresh();
    expect(options.serverOptions().environment).toBe("local");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "staging");
    expect(options.serverOptions().environment).toBe("staging");
  });
});

describe("what an event may carry", () => {
  const send = async (event, hint = {}) => (await fresh()).options.serverOptions().beforeSend(event, hint);

  it("has no cookies, auth, body or user, and masks emails, phones and the codes in addresses", async () => {
    const out = await send({
      message: "Write to ana.k@example.com or call +91 98765 43210 / 9876543210",
      request: {
        url: "https://myotherapp.in/tickets/TK-8f3a9?ref=x",
        query_string: "email=ana%40example.com",
        cookies: { session: "s3cret" },
        data: { password: "hunter2" },
        headers: { Cookie: "s=1", Authorization: "Bearer t0ken", "User-Agent": PERSON, "X-Forwarded-For": "203.0.113.9", "X-Site-Token": "tok" },
      },
      user: { email: "ana.k@example.com", ip_address: "203.0.113.9" },
      exception: {
        values: [{ value: "No ticket for ana.k@example.com", stacktrace: { frames: [{ filename: "app:///_next/server/app/tickets/[ticketid]/page.js" }] } }],
      },
      breadcrumbs: [{ message: "GET /verify/MOA-2026-ABCD", data: { url: "https://myotherapp.in/feedback/12/reg-998" } }],
      contexts: { nextjs: { request_path: "/certificates/c-77" } },
    });

    expect(out.user).toBeUndefined();
    expect(out.request).toEqual({
      url: "https://myotherapp.in/tickets/[code]?ref=x",
      query_string: "email=[email]",
      headers: { "User-Agent": PERSON },
    });
    expect(out.message).toBe("Write to [email] or call [phone] / [phone]");
    expect(out.exception.values[0].value).toBe("No ticket for [email]");
    expect(out.exception.values[0].stacktrace.frames[0].filename).toBe("app:///_next/server/app/tickets/[ticketid]/page.js");
    expect(out.breadcrumbs[0]).toEqual({ message: "GET /verify/[code]", data: { url: "https://myotherapp.in/feedback/12/[code]" } });
    expect(out.contexts.nextjs.request_path).toBe("/certificates/[code]");
  });

  it("masks a waiting list's claim token, on the site's page and in the API's address", async () => {
    const out = await send({
      request: { url: "https://myotherapp.in/claim/Xy3abcdefghijklmnopqrstuvwxyz012" },
      breadcrumbs: [{ message: "POST https://api.myotherapp.in/api/v1/waitlist/offers/Xy3abcdefghijklmnopqrstuvwxyz012/claim" }],
      exception: { values: [{ value: "x", stacktrace: { frames: [{ filename: "app:///_next/server/app/claim/[token]/page.js" }] } }] },
    });
    expect(out.request.url).toBe("https://myotherapp.in/claim/[code]");
    expect(out.breadcrumbs[0].message).toBe("POST https://api.myotherapp.in/api/v1/waitlist/offers/[code]/claim");
    expect(out.exception.values[0].stacktrace.frames[0].filename).toBe("app:///_next/server/app/claim/[token]/page.js");
  });

  it("masks a request's status token, on the site's page and in the API's address", async () => {
    const out = await send({
      request: { url: "https://myotherapp.in/requests/Rq7abcdefghijklmnopqrstuvwxyz012" },
      breadcrumbs: [
        { message: "GET https://api.myotherapp.in/api/v1/registration-requests/Rq7abcdefghijklmnopqrstuvwxyz012" },
        { message: "POST https://api.myotherapp.in/api/v1/registration-requests/Rq7abcdefghijklmnopqrstuvwxyz012/withdraw" },
      ],
      exception: { values: [{ value: "x", stacktrace: { frames: [{ filename: "app:///_next/server/app/requests/[token]/page.js" }] } }] },
    });
    expect(out.request.url).toBe("https://myotherapp.in/requests/[code]");
    expect(out.breadcrumbs[0].message).toBe("GET https://api.myotherapp.in/api/v1/registration-requests/[code]");
    expect(out.breadcrumbs[1].message).toBe("POST https://api.myotherapp.in/api/v1/registration-requests/[code]/withdraw");
    expect(out.exception.values[0].stacktrace.frames[0].filename).toBe("app:///_next/server/app/requests/[token]/page.js");
  });

  it("leaves numbers that are not phones alone", async () => {
    const { options } = await fresh();
    expect(options.maskText("at 1729771234567, order 12345, ₹799, 2026-10-24T19:40:58+05:30, /verify")).toBe(
      "at 1729771234567, order 12345, ₹799, 2026-10-24T19:40:58+05:30, /verify"
    );
    expect(options.maskText("+1 415-555-0100")).toBe("[phone]");
  });

  it("drops the API refusing localhost, but not the same failure in production", async () => {
    const offline = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK", name: "AxiosError" });
    const event = (url) => ({ request: { url }, exception: { values: [{ type: "AxiosError", value: "Network Error" }] } });
    expect(await send(event("http://localhost:3000/events"), { originalException: offline })).toBeNull();
    expect(await send(event("http://127.0.0.1:3123/"), { originalException: offline })).toBeNull();
    expect(await send(event("https://myotherapp.in/events"), { originalException: offline })).not.toBeNull();
  });

  it("drops a bot's 404s and Next's notFound(), keeps a bot's real errors", async () => {
    const event = (ua, value) => ({ request: { url: "https://myotherapp.in/x", headers: { "user-agent": ua } }, exception: { values: [{ value }] } });
    const missing = Object.assign(new Error("Request failed with status code 404"), { response: { status: 404 } });
    expect(await send(event(GOOGLEBOT, missing.message), { originalException: missing })).toBeNull();
    expect(await send(event(PERSON, missing.message), { originalException: missing })).not.toBeNull();
    expect(await send(event(GOOGLEBOT, "x is not a function"), { originalException: new TypeError("x is not a function") })).not.toBeNull();
    const notFound = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(await send(event(PERSON, notFound.message), { originalException: notFound })).toBeNull();
  });

  it("never throws on the SDK's own objects (getter-only, frozen, class instances)", async () => {
    const { options } = await fresh();
    const readOnly = Object.defineProperty({}, "$", { get: () => "ana@example.com", enumerable: true });
    class Scope {
      constructor() {
        this.note = "ana@example.com";
      }
    }
    const event = {
      type: "transaction",
      transaction: "GET /events/[slug]",
      sdkProcessingMetadata: { scope: new Scope(), readOnly },
      contexts: { trace: { data: readOnly } },
      extra: { frozen: Object.freeze({ email: "ana@example.com" }) },
    };
    expect(() => options.serverOptions().beforeSendTransaction(event)).not.toThrow();
    expect(() => options.serverOptions().beforeSend(event, {})).not.toThrow();
    expect(event.sdkProcessingMetadata.scope.note).toBe("ana@example.com"); // the SDK's own, untouched
  });

  it("keeps no bot page loads and scrubs the rest", async () => {
    const { options } = await fresh();
    const { beforeSendTransaction } = options.browserOptions();
    expect(beforeSendTransaction({ type: "transaction", request: { headers: { "User-Agent": GOOGLEBOT } } })).toBeNull();
    const kept = beforeSendTransaction({ type: "transaction", transaction: "/tickets/TK-1", request: { url: "https://myotherapp.in/tickets/TK-1", headers: { Cookie: "a" } } });
    expect(kept).toMatchObject({ transaction: "/tickets/[code]", request: { url: "https://myotherapp.in/tickets/[code]", headers: {} } });
  });
});
