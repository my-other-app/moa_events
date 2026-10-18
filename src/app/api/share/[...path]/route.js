import { sharePage } from "@/server/share/respond";

/*
 * GET /api/share/{the page's path}: what next.config's bot rewrites point at.
 * A rewrite hands the handler its path as route params (the destination's
 * query string doesn't reliably reach it). /api/share?path=… answers the same.
 */
export async function GET(request, { params }) {
  const { path } = await params;
  return sharePage(`/${(path || []).map(encodeURIComponent).join("/")}`);
}
