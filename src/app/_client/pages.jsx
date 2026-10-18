"use client";

/**
 * The pages that are still drawn in the browser, as they were before the
 * move to Next. Each route's page.jsx (a server component, so it can set
 * the page's metadata) renders <ClientPage name="…" />, and the page's own
 * component loads here, in the browser only (ssr: false): it reads
 * localStorage, the window and the signed-in session while it renders, as
 * it always has. Each loads as its own chunk.
 *
 * Porting a page to server rendering removes its line here; see
 * docs/NEXT_MIGRATION.md.
 */
import dynamic from "next/dynamic";

/** What shows for the moment before a page's script arrives: the dots the old event routes showed. */
export function Holding() {
  return (
    <div className="ep-holding dc-scope" role="status" aria-label="Loading">
      <span className="ep-holding-dot" />
      <span className="ep-holding-dot" />
      <span className="ep-holding-dot" />
    </div>
  );
}

const PAGES = {
  home: dynamic(() => import("@/components/discover/homepage"), { ssr: false, loading: Holding }),
  events: dynamic(() => import("@/components/discover/eventspage"), { ssr: false, loading: Holding }),
  clubs: dynamic(() => import("@/components/discover/clubspage"), { ssr: false, loading: Holding }),
  threads: dynamic(() => import("@/components/discover/threadspage").then((m) => m.ThreadsPage), { ssr: false, loading: Holding }),
  thread: dynamic(() => import("@/components/discover/threadspage").then((m) => m.ThreadPage), { ssr: false, loading: Holding }),
  about: dynamic(() => import("@/components/discover/aboutpage"), { ssr: false, loading: Holding }),
  "for-clubs": dynamic(() => import("@/components/discover/forclubspage"), { ssr: false, loading: Holding }),
  pricing: dynamic(() => import("@/components/discover/pricingpage"), { ssr: false, loading: Holding }),
  privacy: dynamic(() => import("@/components/discover/legalpage").then((m) => m.PrivacyPage), { ssr: false, loading: Holding }),
  terms: dynamic(() => import("@/components/discover/legalpage").then((m) => m.TermsPage), { ssr: false, loading: Holding }),
};

export const CLIENT_PAGES = Object.keys(PAGES);

/** One client page by name, with the plain props its route hands it (an event the server already found, say). */
export default function ClientPage({ name, props = {} }) {
  const Page = PAGES[name];
  if (!Page) throw new Error(`No client page called "${name}"`);
  return <Page {...props} />;
}
