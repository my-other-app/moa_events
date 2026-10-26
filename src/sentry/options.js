/**
 * What Sentry may collect, for the browser and the server alike.
 *
 * - Nothing personal by default (sendDefaultPii off), and on top of that:
 *   no cookies, no Authorization or other headers beyond a short list, no
 *   request bodies, no user; emails and phone numbers masked in every string
 *   an event carries; the codes in a ticket's, a certificate's, a check's and
 *   a feedback form's address replaced (they open the page; see the
 *   no-referrer headers in next.config.mjs).
 * - A small share of traces (NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 5% unless
 *   set), with no trace headers sent from the browser; no session replay
 *   unless NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_RATE says so, and then only of
 *   sessions that hit an error, fully masked.
 * - Known noise dropped: the API refusing localhost (CORS) while the site
 *   runs on a developer's machine, bots' 404s, Next's own notFound() and
 *   redirect() signals, browser extensions.
 */
import { isBot } from "@/seo/bots";
import { sentryDsn, sentryEnvironment, sentryRelease } from "./env";

export const DEFAULT_TRACES_SAMPLE_RATE = 0.05;

/** A rate between 0 and 1, or the fallback for anything else. */
export function rateOf(value, fallback) {
  const n = typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

export const tracesSampleRate = () => rateOf(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, DEFAULT_TRACES_SAMPLE_RATE);
export const replaysOnErrorRate = () => rateOf(process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_RATE, 0);

/* ---------- masking ---------- */

const EMAIL = /[A-Z0-9._%+-]+(?:@|%40)[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
// An Indian mobile (10 digits from 6-9, maybe after 0 / 91 / +91), or any
// number written with a leading +. Not an epoch, an id from 1-5, a price.
const MOBILE = /(^|[^\d+])((?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5})(?!\d)/g;
const INTL = /(^|[^\w+])\+\d[\d\s-]{6,16}\d(?!\d)/g;
// The last segment of these addresses is a code that opens the page (a
// waiting list's claim link, /claim/{token}, and the API's
// /waitlist/offers/{token}, are its only credential; so are a request's
// status link, /requests/{token}, and the API's /registration-requests/{token}).
const CODED = /\/(tickets|certificates|verify|claim|offers|requests|registration-requests)\/(?!\[)[^/?#\s"'<>]+/g;
const FEEDBACK = /\/feedback\/([^/?#\s"'<>]+)\/(?!\[)[^/?#\s"'<>]+/g;

export function maskText(text) {
  if (typeof text !== "string" || !text) return text;
  return text
    .replace(EMAIL, "[email]")
    .replace(MOBILE, "$1[phone]")
    .replace(INTL, "$1[phone]")
    .replace(CODED, "/$1/[code]")
    .replace(FEEDBACK, "/feedback/$1/[code]");
}

// Stack frames (file names, code around the line) are left as they are:
// changing them would break source maps and grouping. sdkProcessingMetadata
// is the SDK's own (scopes, live objects) and is never sent.
const SKIP = new Set(["stacktrace", "debug_meta", "sdk", "modules", "measurements", "sdkProcessingMetadata"]);

const isPlain = (v) => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Masks strings in place, in plain objects and arrays only; a value that can't be written is left. */
function maskDeep(value, depth = 0) {
  if (typeof value === "string") return maskText(value);
  if (!value || typeof value !== "object" || depth > 10) return value;
  if (!Array.isArray(value) && !isPlain(value)) return value;
  for (const key of Object.keys(value)) {
    if (SKIP.has(key)) continue;
    const next = maskDeep(value[key], depth + 1);
    if (next !== value[key]) {
      try {
        value[key] = next;
      } catch {
        // frozen or getter-only: leave it
      }
    }
  }
  return value;
}

/** Headers worth keeping on an event; everything else (cookie, authorization, addresses, tokens) goes. */
const KEEP_HEADERS = new Set(["user-agent", "accept-language", "referer", "host", "content-type", "accept"]);

function scrubRequest(request) {
  if (!request) return;
  delete request.cookies;
  delete request.data;
  delete request.env;
  if (request.headers) {
    const kept = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (KEEP_HEADERS.has(name.toLowerCase())) kept[name] = value;
    }
    request.headers = kept;
  }
}

/** Removes and masks everything personal on an event (error or transaction), in place. */
export function scrubEvent(event) {
  scrubRequest(event.request);
  delete event.user;
  return maskDeep(event);
}

/* ---------- noise ---------- */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

export function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname;
    return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

const NETWORK_MESSAGE = /^(Network Error|Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i;

function messageOf(event, error) {
  return event.exception?.values?.[0]?.value || event.message || (typeof error === "string" ? error : error?.message) || "";
}

const statusOf = (error) => (error && typeof error === "object" ? error.status ?? error.response?.status ?? error.statusCode : undefined);

function headerOf(event, name) {
  const headers = event.request?.headers || {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

const pageUrl = (event) => event.request?.url || (typeof location !== "undefined" ? location.href : "");
const userAgent = (event) => headerOf(event, "user-agent") || (typeof navigator !== "undefined" ? navigator.userAgent : "");

/** Next's notFound() and redirect() travel as errors with these digests; they are not errors. */
const NEXT_SIGNAL = /^NEXT_(HTTP_ERROR_FALLBACK;404|NOT_FOUND|REDIRECT)\b/;

/** True for an event nobody needs to see. */
export function isNoise(event, hint) {
  const error = hint?.originalException;
  const message = messageOf(event, error);
  const digest = error && typeof error === "object" && typeof error.digest === "string" ? error.digest : "";
  if (NEXT_SIGNAL.test(digest) || NEXT_SIGNAL.test(message)) return true;

  const notFound = statusOf(error) === 404 || / 404\b|\b404 \(?Not Found/i.test(message);
  if (notFound && isBot(userAgent(event))) return true;

  // On localhost the API refuses the page's origin; the browser says "Network Error".
  const network = error?.code === "ERR_NETWORK" || NETWORK_MESSAGE.test(message) || /\bCORS\b/.test(message);
  if (network && isLocalUrl(pageUrl(event))) return true;

  return false;
}

export const IGNORE_ERRORS = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  // A request given up on purpose (a page left, a stream closed).
  /^(CanceledError: )?canceled$/,
  /^AbortError\b/,
];

export const DENY_URLS = [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari(-web)?-extension:\/\//i];

/* ---------- the options ---------- */

function common() {
  return {
    dsn: sentryDsn(),
    environment: sentryEnvironment(),
    release: sentryRelease(),
    sendDefaultPii: false,
    tracesSampleRate: tracesSampleRate(),
    ignoreErrors: IGNORE_ERRORS,
    // An error's breadcrumbs travel inside it and are masked with it (by then
    // they are the SDK's own copies, never the page's objects).
    beforeSend(event, hint) {
      return isNoise(event, hint) ? null : scrubEvent(event);
    },
    beforeSendTransaction(event) {
      // A bot's page loads are not anyone's experience of the site.
      return isBot(userAgent(event)) ? null : scrubEvent(event);
    },
  };
}

export function browserOptions() {
  const replays = replaysOnErrorRate();
  return {
    ...common(),
    denyUrls: DENY_URLS,
    // No sentry-trace / baggage headers on any request. On the site's own
    // requests (Next's prefetches of linked pages) they cost a mobile ~2 s of
    // main-thread work after load (measured with Lighthouse); the API is
    // another origin, where they would add a CORS preflight.
    tracePropagationTargets: [],
    // Only errors' sessions, and only when asked for (see replay.js).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: replays,
  };
}

export function serverOptions() {
  return common();
}
