/*
 * The server's start-up hook. Sentry starts here only when
 * NEXT_PUBLIC_SENTRY_DSN is set; without it the SDK is never even imported.
 * Only the Node runtime: the site has no Edge routes or middleware.
 */
import { sentryDsn } from "@/sentry/env";

export async function register() {
  if (!sentryDsn()) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startServerSentry } = await import("@/sentry/server");
    startServerSentry();
  }
}

/** Errors Next caught while rendering a page or running a route handler. */
export async function onRequestError(error, request, context) {
  if (!sentryDsn()) return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureRequestError } = await import("@sentry/nextjs");
    captureRequestError(error, request, context);
  }
}
