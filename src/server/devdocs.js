import "server-only";
import { cache } from "react";
import { DOCS_COOKIE, docsGate, forwardedIp } from "@/developers/gate";

/**
 * The private developer docs' own check, on the server, for a page or a
 * file (src/developers/gate.js): the docs link's token from the cookie,
 * asked about at most every 5 minutes. Reading the cookie makes the page
 * dynamic, so a private page is never made at build into public HTML.
 *
 *   docsAccess() → {kind, expires_at, club?, partner_app?} or null
 *
 * Null for no cookie, a token that isn't good, and an API that can't be
 * asked: whatever the reason, the page answers 404. src/proxy.js has
 * already turned most of these away; this is so nothing depends on it alone.
 */
export const docsAccess = cache(async () => {
  const { cookies, headers } = await import("next/headers");
  const token = (await cookies()).get(DOCS_COOKIE)?.value;
  if (!token) return null;
  const answer = await docsGate.check(token, { visitorIp: forwardedIp(await headers()) });
  return answer.state === "ok" ? answer.access : null;
});

/** For a route handler, from its request: the same answer. */
export async function requestDocsAccess(request) {
  const token = request.cookies.get(DOCS_COOKIE)?.value;
  if (!token) return null;
  const answer = await docsGate.check(token, { visitorIp: forwardedIp(request.headers) });
  return answer.state === "ok" ? answer.access : null;
}
