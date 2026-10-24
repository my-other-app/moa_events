/**
 * Sentry's switch. With NEXT_PUBLIC_SENTRY_DSN unset (or blank) Sentry is off
 * everywhere: the SDK is never loaded, nothing listens and nothing is sent.
 *
 * Each value is read as `process.env.NEXT_PUBLIC_…` literally, inside the
 * function: Next writes them into the bundles at build time, and tests can
 * still change them.
 */
const clean = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

export const sentryDsn = () => clean(process.env.NEXT_PUBLIC_SENTRY_DSN);

/** "moa-events@<commit>", the release events and uploaded source maps share. */
export function sentryRelease() {
  const own = clean(process.env.NEXT_PUBLIC_SENTRY_RELEASE);
  if (own) return own;
  const sha = clean(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA) || clean(process.env.VERCEL_GIT_COMMIT_SHA);
  return sha ? `moa-events@${sha}` : undefined;
}

/** production / preview on Vercel; "local" for a build run anywhere else. */
export function sentryEnvironment() {
  return (
    clean(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT) ||
    clean(process.env.NEXT_PUBLIC_VERCEL_ENV) ||
    clean(process.env.VERCEL_ENV) ||
    (process.env.NODE_ENV === "development" ? "development" : "local")
  );
}
