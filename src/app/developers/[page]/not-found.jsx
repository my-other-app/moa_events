import { PrivateDocs } from "@/components/developers/publicpage";

/*
 * What every private docs address shows without access (and any address
 * under /developers that isn't a page): a 404 that confirms nothing, with
 * the way in. The same words as the proxy's own 404 (src/developers/gate.js).
 */
export const metadata = { title: "Not found", robots: { index: false, follow: false } };

export default function DocsNotFound() {
  return <PrivateDocs />;
}
