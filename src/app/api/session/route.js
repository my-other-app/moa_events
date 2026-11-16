import { createSessionRoutes } from "@/server/session/session";

/*
 * /api/session: who is signed in on this browser, tokens kept from before
 * handed over into the cookies, and signing out, when the build keeps
 * tokens in HttpOnly cookies (NEXT_PUBLIC_SESSION_COOKIE=on). A 404
 * otherwise. What it does: src/server/session/session.js.
 */
export const dynamic = "force-dynamic";

const routes = createSessionRoutes();

export const GET = routes.GET;
export const POST = routes.POST;
export const DELETE = routes.DELETE;
