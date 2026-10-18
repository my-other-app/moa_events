"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/discover/bits";
import { SitePage } from "@/components/discover/chrome";

/*
 * When a server-rendered page can't be made (the API is down or slow): a
 * friendly page that offers to try again, inside the site's frame. A page
 * already in the cache keeps being served from it meanwhile (ISR keeps the
 * last good copy), so this shows only for a page never made before.
 */
export default function ErrorPage({ reset }) {
  const router = useRouter();
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
