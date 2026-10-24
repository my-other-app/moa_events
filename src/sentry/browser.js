/**
 * The browser SDK itself: only ever reached through lazy.js's import(), after
 * the page has loaded, and only with a DSN.
 */
import { captureException, captureRouterTransitionStart, init } from "@sentry/nextjs";
import { browserOptions, replaysOnErrorRate } from "./options";

export function startBrowserSentry() {
  init(browserOptions());
  // Replay is a large piece of its own: fetched only when it is turned on.
  if (replaysOnErrorRate() > 0) import("./replay").then((m) => m.addReplay(), () => {});
  return { captureException, captureRouterTransitionStart };
}
