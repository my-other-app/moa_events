import { describe, expect, it } from "vitest";
import { describeSpeakerError, parseClaimPreview, parseSpeakerPage, parseSpeakerSitemap, profileLinks } from "./speakers";
import { SPEAKER } from "@/test/speakerFixture";

/* Speakers' shapes (feature-register/speakers-contract.md), read and said. */

describe("a speaker's page", () => {
  it("reads the profile, its safe links and its talks", () => {
    const p = parseSpeakerPage(SPEAKER());
    expect(p).toMatchObject({ slug: "asha-rao", name: "Asha Rao", headline: "Engineer · Zoho", bio: "Builds compilers.\nTeaches on weekends.", city: "Kochi", claimed: true, followers: 41, following: null });
    expect(p.links).toEqual([
      { kind: "website", label: "Website", url: "https://asha.dev/" },
      { kind: "linkedin", label: "LinkedIn", url: "https://linkedin.com/in/asha" },
    ]);
    expect(p.topics).toEqual([{ id: 3, name: "Development", slug: "development" }]);
    expect(p.upcoming[0]).toMatchObject({ eventId: 68, slug: "hack-night-04", talkTitle: "Writing a tiny compiler", club: { name: "Circuit Society", slug: "circuit-society" } });
    expect(p.past[0]).toMatchObject({ eventId: 12, talkTitle: null, poster: null });
  });

  it("says where a merged profile went, and nothing for a page that isn't one", () => {
    expect(parseSpeakerPage({ redirect_slug: "asha-rao-2" })).toEqual({ redirect: "asha-rao-2" });
    expect(parseSpeakerPage({ redirect_slug: "../x" })).toBeNull();
    expect(parseSpeakerPage({ detail: "Not found" })).toBeNull();
  });

  it("keeps only https or http links", () => {
    expect(profileLinks({ other: "ftp://x.org", github: "github.com/asha" })).toEqual([{ kind: "github", label: "GitHub", url: "https://github.com/asha" }]);
  });
});

describe("a claim link and the sitemap", () => {
  it("reads what a claim link is for", () => {
    expect(parseClaimPreview({ profile: { slug: "asha-rao", name: "Asha Rao", headline: null, photo: null, bio: null, talks_count: 3 }, email_masked: "a***@zoho.com", valid: true, reason: null })).toEqual({
      profile: { slug: "asha-rao", name: "Asha Rao", headline: null, bio: null, photo: null, talksCount: 3 },
      emailMasked: "a***@zoho.com",
      valid: true,
      reason: null,
      message: null,
    });
    expect(parseClaimPreview({ profile: null, valid: false, reason: "used" })).toMatchObject({ profile: null, valid: false, reason: "used" });
  });

  it("reads the sitemap's rows, leaving bad slugs out", () => {
    expect(parseSpeakerSitemap({ speakers: [{ slug: "asha-rao", updated_at: "2026-11-10T09:00:00Z" }, { slug: "../x" }] })).toEqual([{ slug: "asha-rao", updated_at: "2026-11-10T09:00:00Z" }]);
    expect(parseSpeakerSitemap(null)).toBeNull();
  });
});

describe("what a refusal means", () => {
  it("names each claim refusal, and the API without speakers", () => {
    expect(describeSpeakerError({ status: 410, code: "CLAIM_EXPIRED" })).toMatchObject({ kind: "claim", reason: "expired" });
    expect(describeSpeakerError({ status: 409, code: "CLAIM_USED" }).message).toMatch(/used already/);
    expect(describeSpeakerError({ status: 404, code: "CLAIM_INVALID" }).kind).toBe("gone");
    expect(describeSpeakerError({ status: 409, code: "ALREADY_HAS_PROFILE" }).kind).toBe("has");
    expect(describeSpeakerError({ status: 403, code: "APP_USER_ONLY" }).kind).toBe("app");
    expect(describeSpeakerError({ status: 404, code: "NO_SPEAKER_PROFILE" }).kind).toBe("gone");
    expect(describeSpeakerError({ status: 404 }).kind).toBe("off");
    expect(describeSpeakerError({ status: 422, errors: { bio: ["Too long"] } })).toMatchObject({ kind: "fields", fields: { bio: "Too long" } });
    expect(describeSpeakerError({ network: true }).kind).toBe("network");
  });
});
