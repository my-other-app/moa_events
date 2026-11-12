import { NextResponse } from "next/server";
import { DOCS_COOKIE, docsGate, forwardedIp, isGatedDocsPath, privateDocsResponse, unavailableDocsResponse } from "@/developers/gate";
import { REDIRECT_CACHE, movedSlugPath } from "@/seo/slugRedirect";

/*
 * Next's proxy (the old "middleware"), on two kinds of address.
 *
 * /events/{slug} and /clubs/{slug}: an old slug (an admin changed the
 * event's or the club's) with a query answers a 308 to the current slug's
 * page, query kept (src/seo/slugRedirect.js). The kept (ISR) page answers
 * the same 308 without a query, so only addresses with one are looked at;
 * anything else goes on to the page untouched.
 *
 * Every address under /developers/: the private developer docs
 * (src/developers/gate.js). Before anything is rendered or read, a request
 * without a good docs cookie gets the 404 every private address gives
 * (noindex, private, no-store); a cookie the API can't be asked about right
 * now gets a 503. /developers itself, /developers/access and
 * /developers/sign-out are open.
 *
 * Not the only check: each private page and file checks the cookie again
 * on the server (src/server/devdocs.js), so a path this misses still shows
 * nothing.
 */
export async function proxy(request) {
  const moved = await movedSlugPath(request);
  if (moved) {
    const res = NextResponse.redirect(new URL(moved, request.url), 308);
    res.headers.set("Cache-Control", REDIRECT_CACHE);
    return res;
  }
  if (!isGatedDocsPath(request.nextUrl.pathname)) return NextResponse.next();
  const token = request.cookies.get(DOCS_COOKIE)?.value;
  const answer = await docsGate.check(token, { visitorIp: forwardedIp(request.headers) });
  if (answer.state === "error") return unavailableDocsResponse();
  if (answer.state !== "ok") return privateDocsResponse();
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/developers/:path+", "/events/:slug", "/clubs/:slug"],
};
