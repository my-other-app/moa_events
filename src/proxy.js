import { NextResponse } from "next/server";
import { DOCS_COOKIE, docsGate, forwardedIp, isGatedDocsPath, privateDocsResponse, unavailableDocsResponse } from "@/developers/gate";

/*
 * Next's proxy (the old "middleware"), on every address under
 * /developers/ and nowhere else: the private developer docs
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
  matcher: ["/developers/:path+"],
};
