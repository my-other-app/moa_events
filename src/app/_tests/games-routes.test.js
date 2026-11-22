// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { effectiveHeaders } from "@/test/headers";
import { fakeFetch, outcome } from "@/test/next";

/*
 * The games' pages on the server: never indexed, the right address shapes,
 * /play told apart (a numeric id is the live quiz, a slug is the games hub),
 * and the camera allowed on the player pages only.
 */
let fetch;
beforeEach(() => {
  fetch = fakeFetch((url) => {
    if (url.pathname.startsWith("/api/v1/discover/events/")) return { body: { event: { id: 77, slug: "devfest", name: "DevFest", status: "upcoming", interests: [] }, club: null, speakers: [], agenda: [], team: [] } };
    return { status: 404, body: {} };
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => vi.unstubAllGlobals());
const params = (o) => Promise.resolve(o);

describe("headers", () => {
  it.each(["/play/devfest", "/play/devfest/cards", "/play/devfest/hunt", "/g/b.77.abc.0.MACMACMAC"])("%s may use the camera, this site only", async (path) => {
    expect((await effectiveHeaders(nextConfig, path))["Permissions-Policy"]).toBe("camera=(self), microphone=(), geolocation=(self), browsing-topics=()");
  });
  it.each(["/", "/events/devfest", "/screen/tok-12345678", "/tickets/MOA-7K3QF-X9PWM"])("%s keeps the camera off", async (path) => {
    expect((await effectiveHeaders(nextConfig, path))["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=(self), browsing-topics=()");
  });
});

describe("pages", () => {
  it.each([
    ["../g/[token]/page.jsx", { token: "b.77.abc.0.MACMACMAC" }],
    ["../screen/[token]/page.jsx", { token: "tok-12345678" }],
    ["../play/[eventId]/cards/page.jsx", { eventId: "devfest" }],
    ["../play/[eventId]/hunt/page.jsx", { eventId: "devfest" }],
    ["../play/[eventId]/page.jsx", { eventId: "devfest" }],
  ])("%s is never indexed and renders", async (file) => {
    const route = await import(/* @vite-ignore */ file);
    expect(route.metadata.robots).toEqual({ index: false, follow: true });
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("/g and /screen refuse an address that is not a token", async () => {
    for (const f of ["../g/[token]/page.jsx", "../screen/[token]/page.jsx"]) {
      const route = await import(/* @vite-ignore */ f);
      expect((await outcome(() => route.default({ params: params({ token: "no" }) }))).notFound).toBe(true);
    }
  });

  it("/play/{slug} is the hub and /play/{id} is the live quiz", async () => {
    const route = await import("../play/[eventId]/page.jsx");
    const hub = await route.default({ params: params({ eventId: "devfest" }) });
    expect(hub.type.name).toBe("HubPage");
    expect(hub.props).toMatchObject({ eventId: "77", eventRef: "devfest" });
    const quiz = await route.default({ params: params({ eventId: "77" }) });
    expect(quiz.type.name).not.toBe("HubPage");
  });
});
