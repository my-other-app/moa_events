import { createGateway } from "@/server/session/gateway";

/*
 * /api/gateway/api/v1/...: the API, through the site's own server, for the
 * calls that go with a visitor's token when the build keeps tokens in
 * HttpOnly cookies (NEXT_PUBLIC_SESSION_COOKIE=on; src/auth/cookiemode.js).
 * A 404 otherwise. What it does: src/server/session/gateway.js.
 */
export const dynamic = "force-dynamic";

const gateway = createGateway();

export const GET = gateway;
export const HEAD = gateway;
export const POST = gateway;
export const PUT = gateway;
export const PATCH = gateway;
export const DELETE = gateway;
export const OPTIONS = gateway;
