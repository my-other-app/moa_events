import { shareDocument } from "./share";

/** The preview page for a path, as a response (see ./share.js). */
export async function sharePage(path) {
  const doc = await shareDocument(path);
  return new Response(doc.html, {
    status: doc.status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": doc.cache, "X-Robots-Tag": "all" },
  });
}
