/**
 * Sentry in the browser, off the critical path.
 *
 * Without a DSN this does nothing at all. With one, the SDK (a chunk of its
 * own, ./browser.js, about 80 KB) is fetched a few seconds after the page has
 * loaded, once the browser is idle, so it never competes with the page's own
 * scripts or pictures (an event's poster, its LCP, often arrives just after
 * the load event).
 * Errors thrown before then are held (a few) and sent once it is in. Web
 * vitals and the page load's timing are still measured: the browser keeps
 * them, and the SDK reads them back when it starts.
 */
import { sentryDsn } from "./env";

const MAX_EARLY = 10;
/** How long after the load event the SDK waits before asking for an idle moment. */
export const LOAD_DELAY_MS = 3000;

let early = null; // errors seen before the SDK arrived
let sdk = null; // { captureException, captureRouterTransitionStart } once in
let loading = null;
let started = false;

function hold(error) {
  if (early && early.length < MAX_EARLY && error != null) early.push(error);
}
const onError = (e) => hold(e.error ?? e.message);
const onRejection = (e) => hold(e.reason);

function stopHolding() {
  if (typeof window === "undefined") return;
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onRejection);
}

/** Fetches and starts the SDK (once); null without a DSN or when the chunk can't be had (blocked, offline). */
export function loadSentry() {
  if (!sentryDsn() || typeof window === "undefined") return Promise.resolve(null);
  loading ??= import("./browser").then(
    (m) => {
      sdk = m.startBrowserSentry();
      stopHolding();
      for (const error of early || []) sdk.captureException(error, { mechanism: { type: "onerror", handled: false } });
      early = null;
      return sdk;
    },
    () => {
      stopHolding();
      early = null;
      return null;
    }
  );
  return loading;
}

/** Called once from src/instrumentation-client.js. True when Sentry will load. */
export function startSentry() {
  if (started || !sentryDsn() || typeof window === "undefined") return false;
  started = true;
  early = [];
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  const load = () => loadSentry();
  const idle = () =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(load, { timeout: 5000 }) : load();
  const later = () => window.setTimeout(idle, LOAD_DELAY_MS);
  if (document.readyState === "complete") later();
  else window.addEventListener("load", later, { once: true });
  return true;
}

/** Sends an error an error boundary caught (React keeps those from window.onerror). */
export function reportError(error) {
  if (!sentryDsn()) return;
  loadSentry().then((s) => s?.captureException(error));
}

/** Next calls this on each client navigation; before the SDK is in, the page load covers it. */
export function onRouterTransitionStart(href, navigationType) {
  sdk?.captureRouterTransitionStart(href, navigationType);
}
