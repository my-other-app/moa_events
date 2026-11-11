import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The speaker pages' parts that run in the browser: Follow, claiming a
 * profile from the invite link, editing one's own profile; and the event
 * page's speaker cards linking to the speaker's page. The speakers' calls
 * are mocked (the module answers with what it parses): nothing leaves.
 */
vi.mock("@/api/speakers", () => ({
  speakersApi: { page: vi.fn(), follow: vi.fn(), unfollow: vi.fn(), claimPreview: vi.fn(), claim: vi.fn(), me: vi.fn(), updateMe: vi.fn(), setMyPhoto: vi.fn() },
}));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { speakersApi } = await import("@/api/speakers");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { apiFailure } = await import("@/utils/ticketing");
const { parseClaimPreview, parseMyProfile, parseSpeakerPage } = await import("@/utils/speakers");
const { SpeakerFollow } = await import("./speakerislands");
const SpeakerClaim = (await import("./claim")).default;
const MySpeakerProfile = (await import("./myprofile")).default;
const { profilePatch } = await import("./myprofile");
const { Speakers } = await import("../discover/eventparts");
const { parseEventPage } = await import("@/api/discover");
const { fullEvent } = await import("@/test/eventFixture");
const { SPEAKER } = await import("@/test/speakerFixture");
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const TOKEN = "Sp3abcdefghijklmnopqrstuv";
const refused = (status, code) => apiFailure({ response: { status, data: code ? { error_code: code } : {} } });
const show = (ui, path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterAll(() => resetAuth());

describe("Follow on a speaker's page", () => {
  it("signed in: reads whether they follow, then follows on a press", async () => {
    enableSignIn();
    signInAs();
    speakersApi.page.mockResolvedValue(parseSpeakerPage(SPEAKER({ following: false, followers_count: 41 })));
    speakersApi.follow.mockResolvedValue({ following: true, followers: 42 });
    show(<SpeakerFollow slug="asha-rao" name="Asha Rao" followers={40} />);
    await waitFor(() => expect(speakersApi.page).toHaveBeenCalledWith("asha-rao"));
    expect(await screen.findByText("41")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Follow Asha Rao" }));
    expect(screen.getByRole("button", { name: "Following Asha Rao" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(speakersApi.follow).toHaveBeenCalledWith("asha-rao"));
    expect(await screen.findByText("42")).toBeInTheDocument();
  });

  it("flips back, and says so, when the API refuses", async () => {
    enableSignIn();
    signInAs();
    speakersApi.page.mockResolvedValue(parseSpeakerPage(SPEAKER({ following: true })));
    speakersApi.unfollow.mockRejectedValue(refused(500));
    show(<SpeakerFollow slug="asha-rao" name="Asha Rao" followers={41} />);
    fireEvent.click(await screen.findByRole("button", { name: "Following Asha Rao" }));
    expect(await screen.findByText("Couldn't unfollow just now. Try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Following Asha Rao" })).toBeInTheDocument();
  });

  it("signed out: opens sign-in; on a site without sign-in, the count alone", async () => {
    enableSignIn();
    const { unmount } = show(<SpeakerFollow slug="asha-rao" name="Asha Rao" followers={3} />);
    fireEvent.click(await screen.findByRole("button", { name: "Follow Asha Rao" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(speakersApi.follow).not.toHaveBeenCalled();
    unmount();
    resetAuth();
    show(<SpeakerFollow slug="asha-rao" name="Asha Rao" followers={3} />);
    expect(screen.queryByRole("button", { name: /Follow/ })).toBeNull();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("claiming a profile", () => {
  const preview = (over = {}) => parseClaimPreview({ profile: { slug: "asha-rao", name: "Asha Rao", headline: "Engineer · Zoho", photo: null, talks_count: 2 }, email_masked: "a***@zoho.com", valid: true, reason: null, ...over });

  it("shows whose profile it is, and claims it only when asked", async () => {
    enableSignIn();
    signInAs();
    speakersApi.claimPreview.mockResolvedValue(preview());
    speakersApi.claim.mockResolvedValue({ claimed: true, slug: "asha-rao" });
    show(<SpeakerClaim token={TOKEN} />, `/speakers/claim/${TOKEN}`);
    expect(screen.getByRole("status", { name: "Loading your invite" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Claim your speaker profile" })).toBeInTheDocument();
    expect(screen.getByText("Invite sent to a***@zoho.com")).toBeInTheDocument();
    expect(speakersApi.claim).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Claim this profile" }));
    expect(await screen.findByRole("heading", { name: "Your speaker profile is yours" })).toBeInTheDocument();
    expect(speakersApi.claim).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByRole("link", { name: "Edit your profile" })).toHaveAttribute("href", "/speakers/me");
    expect(screen.getByRole("link", { name: "See your page" })).toHaveAttribute("href", "/speakers/asha-rao");
  });

  it("signed out: sign in to claim", async () => {
    enableSignIn();
    speakersApi.claimPreview.mockResolvedValue(preview());
    show(<SpeakerClaim token={TOKEN} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in to claim" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("says why a link can't be used, and when the account has a profile already", async () => {
    enableSignIn();
    signInAs();
    speakersApi.claimPreview.mockResolvedValueOnce(preview({ valid: false, reason: "expired" }));
    const { unmount } = show(<SpeakerClaim token={TOKEN} />);
    expect(await screen.findByRole("heading", { name: "This invite can’t be used" })).toBeInTheDocument();
    expect(screen.getByText(/This link has expired/)).toBeInTheDocument();
    unmount();
    speakersApi.claimPreview.mockResolvedValueOnce(preview());
    speakersApi.claim.mockRejectedValueOnce(refused(409, "ALREADY_HAS_PROFILE"));
    show(<SpeakerClaim token={TOKEN} />);
    fireEvent.click(await screen.findByRole("button", { name: "Claim this profile" }));
    expect(await screen.findByText(/already has a speaker profile/)).toBeInTheDocument();
  });

  it("an unknown link, or an API without speakers (404), isn't valid", async () => {
    speakersApi.claimPreview.mockRejectedValue(refused(404));
    show(<SpeakerClaim token={TOKEN} />);
    expect(await screen.findByRole("heading", { name: "This link isn’t valid" })).toBeInTheDocument();
  });
});

describe("editing one's own profile", () => {
  it("asks a signed-out person to sign in", async () => {
    enableSignIn();
    show(<MySpeakerProfile />, "/speakers/me");
    expect(await screen.findByRole("heading", { name: "Sign in to edit your speaker profile" })).toBeInTheDocument();
    expect(speakersApi.me).not.toHaveBeenCalled();
  });

  it("explains how to get one when the account has none, or the API has no speakers (404)", async () => {
    enableSignIn();
    signInAs();
    speakersApi.me.mockRejectedValue(refused(404, "NO_SPEAKER_PROFILE"));
    show(<MySpeakerProfile />, "/speakers/me");
    expect(await screen.findByRole("heading", { name: "You don’t have a speaker profile yet" })).toBeInTheDocument();
  });

  it("sends only what changed", async () => {
    enableSignIn();
    signInAs();
    const mine = parseMyProfile({ id: 7, ...SPEAKER() });
    speakersApi.me.mockResolvedValue(mine);
    speakersApi.updateMe.mockResolvedValue(parseMyProfile({ id: 7, ...SPEAKER({ city: "Thrissur" }) }));
    show(<MySpeakerProfile />, "/speakers/me");
    fireEvent.change(await screen.findByLabelText(/^City/), { target: { value: "Thrissur" } });
    fireEvent.change(screen.getByLabelText(/^GitHub/), { target: { value: "https://github.com/asha" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
    expect(speakersApi.updateMe).toHaveBeenCalledWith({
      city: "Thrissur",
      links: { website: "asha.dev", linkedin: "https://linkedin.com/in/asha", github: "https://github.com/asha" },
    });
  });

  it("won't send a link that isn't one, or an empty name", async () => {
    enableSignIn();
    signInAs();
    speakersApi.me.mockResolvedValue(parseMyProfile({ id: 7, ...SPEAKER({ links: {} }) }));
    show(<MySpeakerProfile />, "/speakers/me");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: " " } });
    fireEvent.change(screen.getByLabelText(/^Website/), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Your name can't be empty.")).toBeInTheDocument();
    expect(screen.getByText("Enter your Website address as a link.")).toBeInTheDocument();
    expect(speakersApi.updateMe).not.toHaveBeenCalled();
  });

  it("works out the patch: an emptied field clears it, links go whole", () => {
    const before = { name: "A", headline: "H", bio: "", city: "", links: { website: "a.dev", linkedin: "", x: "", github: "", other: "" } };
    expect(profilePatch(before, { ...before, headline: "" })).toEqual({ headline: "" });
    expect(profilePatch(before, before)).toEqual({});
  });
});

describe("the event page's speakers", () => {
  it("link to the speaker's page when they have one, and show the talk", () => {
    const page = parseEventPage(
      fullEvent({
        speakers: [
          { id: 1, name: "Asha Rao", designation: "Engineer", photo: null, bio: null, link: null, profile_slug: "asha-rao", talk_title: "Writing a tiny compiler" },
          { id: 2, name: "Ravi K", designation: null, photo: null, bio: null, link: null, profile_slug: null },
        ],
      }),
    );
    render(
      <MemoryRouter>
        <Speakers speakers={page.speakers} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Asha Rao" })).toHaveAttribute("href", "/speakers/asha-rao");
    expect(screen.getByText("“Writing a tiny compiler”")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ravi K" })).toBeNull();
    expect(screen.getByText("Ravi K")).toBeInTheDocument();
  });
});
