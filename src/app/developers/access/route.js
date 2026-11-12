import { NextResponse } from "next/server";
import { DOCS_HOME, PRIVATE_HEADERS, cookieMaxAge, docsCookie, docsGate, forwardedIp, isDocsToken, privateDocsResponse, unavailableDocsResponse } from "@/developers/gate";

/*
 * GET /developers/access?t=<token>: a docs link, made in a dashboard
 * (Settings → Integrations, or the admin's Integrations). The API is asked
 * whether the link is good, now, whatever was remembered
 * (src/developers/gate.js). A good one leaves an httpOnly, Secure,
 * SameSite=Lax cookie on /developers that lasts no longer than the link (30
 * days at most), and a 303 to the quick start, so the token leaves the
 * address bar. Anything else is the private docs' 404; an API that can't be
 * asked, a 503. Never kept, indexed or named in a Referer.
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = request.nextUrl.searchParams.get("t");
  if (!isDocsToken(token)) return privateDocsResponse();
  const answer = await docsGate.check(token, { fresh: true, visitorIp: forwardedIp(request.headers) });
  if (answer.state === "error") return unavailableDocsResponse();
  if (answer.state !== "ok") return privateDocsResponse();
  const maxAge = cookieMaxAge(answer.access.expires_at);
  if (maxAge <= 0) return privateDocsResponse();
  // A relative Location: the box's own address (behind Cloudflare and nginx) is never the public one.
  const res = new NextResponse(null, { status: 303, headers: { ...PRIVATE_HEADERS, "Referrer-Policy": "no-referrer", Location: DOCS_HOME } });
  res.cookies.set(docsCookie(token, maxAge));
  return res;
}
