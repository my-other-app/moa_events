// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PRIVATE_PROFILE, PUBLIC_PROFILE } from "@/test/profileFixture";
import { androidIntentUrl, describeSaveError, httpLink, isProfileCode, isProfileHandle, parsePublicProfile, parseSaveResult, readCodeAnswer } from "./profiles";

/*
 * Reading the profile shapes (feature-register/profiles-networking-contract.md):
 * only http(s) links, the private state, the hidden sections, what a QR's
 * code answered, and what a refused save means.
 */

describe("links people give", () => {
  it.each([
    ["https://github.com/asha", "https://github.com/asha"],
    ["http://asha.dev", "http://asha.dev/"],
    ["  https://asha.dev/x?y=1  ", "https://asha.dev/x?y=1"],
    ["javascript:alert(1)", null],
    ["JavaScript:alert(1)", null],
    ["data:text/html,hi", null],
    ["//evil.example", null],
    ["asha.dev", null],
    ["https://user:pass@evil.example/", null],
    ["ftp://files.example", null],
    ["", null],
    [null, null],
    [42, null],
  ])("%s → %s", (v, out) => {
    expect(httpLink(v)).toBe(out);
  });
});

describe("handles and codes", () => {
  it("lets the API decide on anything that could be a handle, and keeps nonsense out", () => {
    for (const h of ["asha", "asha.rao", "a_b-c", "a1", "x"]) expect(isProfileHandle(h)).toBe(true);
    for (const h of ["", ".asha", "-asha", "a..b", "a/b", "Asha", "a b", "x".repeat(65)]) expect(isProfileHandle(h)).toBe(false);
  });

  it("reads a QR's code as lower-case letters and digits", () => {
    expect(isProfileCode("k7mx3qp9wz")).toBe(true);
    for (const c of ["", "abc", "k7mx-3qp9", "K7MX3QP9WZ", "x".repeat(17)]) expect(isProfileCode(c)).toBe(false);
  });
});

describe("PublicProfile", () => {
  it("keeps what the page shows, and drops links that aren't http(s)", () => {
    const p = parsePublicProfile(
      PUBLIC_PROFILE({
        links: [
          { type: "github", url: "https://github.com/asha" },
          { type: "other", url: "javascript:alert(1)", label: "x" },
          { type: "nonsense", url: "https://asha.dev", label: "Mine" },
        ],
        projects: [{ id: 1, title: "T", url: "javascript:x", tags: ["a", "b", "c", "d", "e", "f"], month: "2026-13-01" }, { id: 2 }],
      }),
    );
    expect(p).toMatchObject({ handle: "asha", name: "Asha Rao", headline: "Compiler engineer", private: false, locked: false, indexable: false, isMe: false, relation: null });
    expect(p.links).toEqual([
      { type: "github", url: "https://github.com/asha", label: null },
      { type: "other", url: "https://asha.dev/", label: "Mine" },
    ]);
    expect(p.projects).toHaveLength(1);
    expect(p.projects[0]).toMatchObject({ url: null, month: null, tags: ["a", "b", "c", "d", "e"] });
    expect(p.achievements).toEqual({
      eventsAttended: 12,
      certificates: [{ eventName: "DevFest 25", url: "https://myotherapp.in/certificates/abc-123" }],
      talks: [{ eventName: "Hack Night 04", title: "Writing a tiny compiler", eventSlug: "hack-night-04" }],
      clubs: null,
    });
  });

  it("names only the sections the contract knows as hidden", () => {
    expect(parsePublicProfile(PUBLIC_PROFILE({ hidden_sections: ["links", "projects", "nonsense"] })).hidden).toEqual(["links", "projects"]);
  });

  it("locks a private profile for a stranger, whatever else came with it, and never indexes it", () => {
    const p = parsePublicProfile(PRIVATE_PROFILE({ bio: "Secret", links: [{ type: "github", url: "https://github.com/asha" }], contact: { email: "a@b.c" }, indexable: true }));
    expect(p).toMatchObject({ private: true, locked: true, indexable: false, bio: null, links: [], contact: { email: null, phone: null } });
  });

  it("reads the API's minimal private shape (every key, the rest empty) as locked", () => {
    const p = parsePublicProfile(PRIVATE_PROFILE());
    expect(p).toMatchObject({ handle: "asha", name: "Asha Rao", headline: "Compiler engineer", private: true, locked: true, indexable: false });
    expect(p.picture).toMatch(/^https:\/\/moa-media\.s3\.amazonaws\.com\//);
    expect(p.hidden).toEqual(["links", "projects", "achievements", "interests", "org"]);
    expect(p.achievements).toEqual({ eventsAttended: null, certificates: null, talks: null, clubs: null });
  });

  it("opens a private profile to its owner, and to someone its owner saved", () => {
    expect(parsePublicProfile(PUBLIC_PROFILE({ private: true, is_me: true })).locked).toBe(false);
    const saved = parsePublicProfile(PUBLIC_PROFILE({ private: true, relation: { saved_by_me: false, saved_me: true, mutual: false, network_id: null } }));
    expect(saved.locked).toBe(false);
    expect(saved.bio).toContain("Builds compilers.");
    expect(saved.relation).toEqual({ savedByMe: false, savedMe: true, mutual: false, networkId: null });
  });

  it("is null for anything that isn't a profile", () => {
    for (const d of [null, "x", [], {}, { handle: "asha" }, { full_name: "Asha" }, { handle: "../x", full_name: "Asha" }]) expect(parsePublicProfile(d)).toBeNull();
  });

  it("keeps only http(s) pictures", () => {
    expect(parsePublicProfile(PUBLIC_PROFILE({ picture: "javascript:x" })).picture).toBeNull();
    expect(parsePublicProfile(PUBLIC_PROFILE({ picture: "https://cdn.example/a.jpg" })).picture).toBe("https://cdn.example/a.jpg");
  });
});

describe("what a QR's code answered", () => {
  it.each([
    [200, { handle: "asha", profile: {} }, { state: "ok", handle: "asha" }],
    [200, { profile: { handle: "asha" } }, { state: "ok", handle: "asha" }],
    [200, {}, { state: "missing" }],
    [404, { error_code: "NOT_FOUND" }, { state: "missing" }],
    [410, { error_code: "PROFILE_CODE_INACTIVE" }, { state: "inactive" }],
    [403, { error_code: "PROFILE_SCANNING_OFF" }, { state: "scanning-off" }],
    [403, { detail: "Forbidden" }, null],
    [429, { error_code: "RATE_LIMITED" }, null],
    [500, null, null],
  ])("%s %j → %j", (status, body, out) => {
    expect(readCodeAnswer(status, body)).toEqual(out);
  });
});

describe("saving", () => {
  it("reads the answer: created, mutual, and the profile as the saver sees it now", () => {
    const r = parseSaveResult({ person: { id: 3, mutual: true }, created: false, new_encounter: false, profile: PUBLIC_PROFILE() });
    expect(r).toMatchObject({ saved: true, created: false, mutual: true });
    expect(r.profile.handle).toBe("asha");
    expect(parseSaveResult({ person: { id: 3, mutual: false }, created: true, profile: PUBLIC_PROFILE() }).created).toBe(true);
  });

  it.each([
    [{ status: 422, code: "CANNOT_SAVE_SELF" }, "self"],
    [{ status: 403, code: "PROFILE_SCANNING_OFF" }, "off"],
    [{ status: 410, code: "PROFILE_CODE_INACTIVE" }, "inactive"],
    [{ status: 404 }, "gone"],
    [{ status: 404, code: "NOT_FOUND" }, "gone"],
    [{ status: 429, code: "RATE_LIMITED" }, "limit"],
    [{ status: 401 }, "signin"],
    [{ authExpired: true }, "signin"],
    [{ network: true }, "network"],
    [{ status: 502 }, "server"],
    [{ status: 400, message: "Bad" }, "message"],
  ])("%j is %s", (f, kind) => {
    expect(describeSaveError(f, "Asha Rao").kind).toBe(kind);
  });
});

describe("Open in the app on Android", () => {
  const PLAY = encodeURIComponent("https://play.google.com/store/apps/details?id=app.myotherapp.in");
  it("is an intent link to the site's own address in the app's package, the Play Store without it", () => {
    expect(androidIntentUrl("/u/asha?save=1")).toBe(`intent://myotherapp.in/u/asha?save=1#Intent;scheme=https;package=app.myotherapp.in;S.browser_fallback_url=${PLAY};end`);
    expect(androidIntentUrl("/network?event=12")).toBe(`intent://myotherapp.in/network?event=12#Intent;scheme=https;package=app.myotherapp.in;S.browser_fallback_url=${PLAY};end`);
  });

  it("never leaves the site's own host", () => {
    for (const p of ["//evil.example/x", "https://evil.example", "", null]) expect(androidIntentUrl(p)).toMatch(/^intent:\/\/myotherapp\.in\/#Intent;/);
  });
});

describe("handles stored with capitals", () => {
  it("are read lower case, one spelling for every address", () => {
    expect(parsePublicProfile(PUBLIC_PROFILE({ handle: "Asha.Rao" })).handle).toBe("asha.rao");
    expect(readCodeAnswer(200, { handle: "Asha" })).toEqual({ state: "ok", handle: "asha" });
  });
});
