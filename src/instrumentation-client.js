/*
 * Runs in the browser before the app hydrates. Keep it tiny: it only arranges
 * for Sentry to load later, and only when NEXT_PUBLIC_SENTRY_DSN is set
 * (src/sentry/lazy.js).
 */
import { onRouterTransitionStart, startSentry } from "@/sentry/lazy";

startSentry();

export { onRouterTransitionStart };
