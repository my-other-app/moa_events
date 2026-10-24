"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/discover/bits";
import { SitePage } from "@/components/discover/chrome";
import { reportError } from "@/sentry/lazy";

/*
 * When a server-rendered page can't be made (the API is down or slow): a
 * friendly page that offers to try again, inside the site's frame. A page
 * already in the cache keeps being served from it meanwhile (ISR keeps the
 * last good copy), so this shows only for a page never made before.
 *
 * An error from the browser is sent to Sentry from here (React keeps errors a
 * boundary catches from window.onerror). One from the server carries a
 * digest and was already sent there, with its real stack (onRequestError).
 */
export default function ErrorPage({ error, reset }) {
  const router = useRouter();
  useEffect(() => {
    if (!error?.digest) reportError(error);
  }, [error]);
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return (
    <SitePage>
      <div className="dc-wrap">
        <div className="dc-section">
          <ErrorState message="We couldn't load this page right now. Check your connection and try again." onRetry={retry} />
        </div>
      </div>
    </SitePage>
  );
}
