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
};

export const CLIENT_PAGES = Object.keys(PAGES);

/** One client page by name, with the plain props its route hands it (an event the server already found, say). */
export default function ClientPage({ name, props = {} }) {
  const Page = PAGES[name];
  if (!Page) throw new Error(`No client page called "${name}"`);
  return <Page {...props} />;
}
