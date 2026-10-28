// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config.mjs";
import { APP_PATHS, IOS_APP_ID, readFingerprints } from "@/seo/appLinks";

/*
 * /.well-known/apple-app-site-association and /.well-known/assetlinks.json:
 * the files that let the apps open the site's links. Apple and Google each
 * read theirs at exactly that address, as JSON, and give up on a redirect.
 */

const AASA = "/.well-known/apple-app-site-association";
const ASSETLINKS = "/.well-known/assetlinks.json";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function answer(file) {
  const route = await import(file);
  const res = await route.GET();
  return { route, res, body: await res.json() };
}

/** Apple's matching of a path against the components: the first match wins; * is any run of characters, ? one. */
function opensInApp(components, path) {
  for (const c of components) {
    const pattern = new RegExp(`^${c["/"].replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
    if (pattern.test(path)) return !c.exclude;
  }
  return false;
}

describe(AASA, () => {
  it("is JSON with no extension, a 200 with no redirect, made at build", async () => {
    const { route, res } = await answer("../.well-known/apple-app-site-association/route.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("location")).toBeNull();
    expect(route.dynamic).toBe("force-static");
  });

  it("names the iOS app by Team ID and bundle id", async () => {
    const { body } = await answer("../.well-known/apple-app-site-association/route.js");
    expect(IOS_APP_ID).toBe("PX6QV826X4.app.myotherapp.in");
    expect(body.applinks.details).toHaveLength(1);
    expect(body.applinks.details[0].appIDs).toEqual([IOS_APP_ID]);
    // The modern form only (iOS 13+, the app's minimum): no `paths`, no `apps`.
    expect(body.applinks.details[0].paths).toBeUndefined();
    expect(body.applinks.apps).toBeUndefined();
  });

  it("lists every exclusion before the paths it carves out of", async () => {
    const { body } = await answer("../.well-known/apple-app-site-association/route.js");
    const components = body.applinks.details[0].components;
    const firstClaim = components.findIndex((c) => !c.exclude);
    expect(components.slice(firstClaim).every((c) => !c.exclude)).toBe(true);
    expect(components.slice(firstClaim).map((c) => c["/"])).toEqual(APP_PATHS);
  });

  it.each([
    ["/events/hack-night-04", true],
    ["/events/123", true],
    ["/events/hack-night-04/register", true],
    ["/clubs/circuit-society", true],
    ["/threads/7d0f3c2a-1111-4c4c-9a9a-000000000001", true],
    ["/tickets/abc-123", true],
    ["/certificates/abc-123", true],
    ["/topics/development", true],
    ["/events/hack-night-04/compete", true],
    ["/feedback/123/456", true],
    // The directories: the app's Discover screens.
    ["/events", true],
    ["/clubs", true],
    ["/threads", true],
    ["/topics", true],
    // The live room and the quiz: native screens in the app.
    ["/events/hack-night-04/live", true],
    ["/events/123/live", true],
    ["/play/123", true],
    // A waiting list's claim link: the app's own claim screen.
    ["/claim/Xy3abcdefghijklmnopqrstuvwxyz012", true],
    // A request for a place (the club confirms each one): the app's own status screen.
    ["/requests/Rq7abcdefghijklmnopqrstuvwxyz012", true],
    // So do the city pages, which the app has no screen for.
    ["/events/in", false],
    ["/events/in/kochi", false],
    ["/clubs/in/kochi", false],
    ["/events/indie-night", true],
    // Feeds, the server's own addresses, web-only pages.
    ["/events/rss.xml", false],
    ["/clubs/circuit-society/rss.xml", false],
    ["/topics/development/rss.xml", false],
    ["/api/share/events/x", false],
    ["/og/events/hack-night-04", false],
    ["/media/events/hack-night-04/poster", false],
    ["/for-clubs", false],
    ["/pricing", false],
    // Not claimed: the home page, the old addresses, the policies, /me.
    ["/", false],
    ["/123", false],
    ["/123/live", false],
    ["/privacy", false],
    ["/me/tickets", false],
  ])("%s opens in the app: %s", async (path, inApp) => {
    const { body } = await answer("../.well-known/apple-app-site-association/route.js");
    expect(opensInApp(body.applinks.details[0].components, path)).toBe(inApp);
  });
});

describe(ASSETLINKS, () => {
  const KEY = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";
  const OTHER = "11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF";

  it("is an empty list, still valid JSON and a 200, until the fingerprint is set", async () => {
    vi.stubEnv("ANDROID_APP_SHA256", "");
    const { route, res, body } = await answer("../.well-known/assetlinks.json/route.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("location")).toBeNull();
    expect(route.dynamic).toBe("force-static");
    expect(body).toEqual([]);
  });

  it("lets the app open every link when signed by the keys in ANDROID_APP_SHA256", async () => {
    vi.stubEnv("ANDROID_APP_SHA256", `${KEY}, ${OTHER}`);
    const { body } = await answer("../.well-known/assetlinks.json/route.js");
    expect(body).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "app.myotherapp.in",
          sha256_cert_fingerprints: [KEY, OTHER],
        },
      },
    ]);
  });

  it("takes a fingerprint however it was pasted, and drops what isn't one", () => {
    const bare = KEY.replace(/:/g, "").toLowerCase();
    const sha1 = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01";
    expect(readFingerprints(` ${bare} ,${sha1},nonsense,,${KEY}`)).toEqual([KEY]);
    expect(readFingerprints(undefined)).toEqual([]);
    expect(readFingerprints("")).toEqual([]);
  });
});

// Which file answers each address, after next.config's redirects and
// rewrites, is in routes.test.js; these are the settings it doesn't model.
describe("the site's settings leave both files alone", () => {
  it("adds no trailing slash, and no rewrite or header names /.well-known", async () => {
    expect(nextConfig.trailingSlash).toBeFalsy();
    expect(nextConfig.skipTrailingSlashRedirect).toBeFalsy();
    const { beforeFiles = [], afterFiles = [], fallback = [] } = await nextConfig.rewrites();
    for (const r of [...beforeFiles, ...afterFiles, ...fallback]) expect(r.source).not.toContain(".well-known");
    for (const h of await nextConfig.headers()) expect(h.source).not.toContain(".well-known");
  });
});
