import { NextResponse } from "next/server";
import { DOCS_PUBLIC, PRIVATE_HEADERS, docsCookie, isPrefetch } from "@/developers/gate";

/*
 * GET /developers/sign-out: "Sign out of the docs". Clears the docs cookie
 * and goes back to /developers. A prefetch (the browser's, or Next's) is
 * answered with nothing and signs no one out.
 */
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (isPrefetch(request.headers)) return new Response(null, { status: 204, headers: PRIVATE_HEADERS });
  const res = new NextResponse(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: DOCS_PUBLIC } });
  res.cookies.set(docsCookie("", 0));
  return res;
}
