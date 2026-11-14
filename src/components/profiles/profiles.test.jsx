import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The profile page's parts that run in the browser
 * (feature-register/profiles-networking-contract.md): the profile asked for
 * again with the reader's token once they are signed in (their relation,
 * the sections and contact shared with them), Save to your network (signed
 * in: POST /network; signed out: the app, or sign in), the ?save=1 intent a
 * scanned QR brings, and Save contact. The profile calls are mocked (the
 * module answers with what it parses): nothing leaves.
 */
vi.mock("@/api/profiles", () => ({
  profilesApi: { page: vi.fn(), save: vi.fn(), vcard: vi.fn() },
  vcardUrl: (h) => `https://api.myotherapp.in/api/v1/profiles/${h}/vcard`,
}));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { profilesApi } = await import("@/api/profiles");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { apiFailure } = await import("@/utils/ticketing");
const { parsePublicProfile, parseSaveResult } = await import("@/utils/profiles");
const { stableProfile } = await import("@/seo/stabilize");
const { ProfileLive } = await import("./profileislands");
const { NetworkInApp } = await import("./profileview");
const { PRIVATE_PROFILE, PUBLIC_PROFILE } = await import("@/test/profileFixture");
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const anon = (over) => stableProfile(parsePublicProfile(PUBLIC_PROFILE(over)));
const refused = (status, code) => apiFailure({ response: { status, data: code ? { error_code: code } : {} } });
const show = (profile) =>
  render(
    <MemoryRouter initialEntries={[`/u/${profile.handle}`]}>
      <AuthProvider>
        <ProfileLive profile={profile} />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  window.history.replaceState({}, "", "/u/asha");
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterEach(() => window.history.replaceState({}, "", "/"));
afterAll(() => resetAuth());

describe("the profile as the signed-in reader sees it", () => {
  it("is asked for again with their token, and what more it says replaces the page's", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(
      parsePublicProfile(
        PUBLIC_PROFILE({
          contact: { email: "asha@example.org", phone: null },
          hidden_sections: [],
          relation: { saved_by_me: false, saved_me: true, mutual: false, network_id: null },
        }),
      ),
    );
    show(anon({ hidden_sections: ["links"], links: [] }));
    expect(screen.getByText(/shares their links only with people they know/)).toBeInTheDocument();
    await waitFor(() => expect(profilesApi.page).toHaveBeenCalledWith("asha"));
    expect(await screen.findByText("asha@example.org")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute("rel", "nofollow noopener noreferrer ugc");
    expect(screen.queryByText(/only with people they know/)).not.toBeInTheDocument();
    expect(screen.getByText("Asha saved you.")).toBeInTheDocument();
  });

  it("opens a private profile up once its owner has saved the reader", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE({ private: true, relation: { saved_by_me: false, saved_me: true, mutual: false, network_id: null } })));
    show(stableProfile(parsePublicProfile(PRIVATE_PROFILE())));
    expect(screen.getByText("This profile is private")).toBeInTheDocument();
    expect(await screen.findByText("Builds compilers.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("This profile is private")).not.toBeInTheDocument();
  });

  it("keeps the page as everyone sees it when the reader's own read can't be had", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockRejectedValue(refused(503));
    show(anon());
    await waitFor(() => expect(profilesApi.page).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    expect(screen.getByText("Tiny C")).toBeInTheDocument();
  });

  it("is not there for a reader the API says 404 to (blocked either way, or hidden since)", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockRejectedValue(refused(404));
    show(anon());
    expect(await screen.findByRole("heading", { name: "We couldn't find that profile" })).toBeInTheDocument();
    expect(screen.queryByText("Tiny C")).not.toBeInTheDocument();
  });

  it("is their own: no Save button, and a word on where to edit it", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE({ is_me: true })));
    show(anon());
    expect(await screen.findByText("This is your profile. Edit it in the MyOtherApp app.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save Asha Rao to your network/ })).not.toBeInTheDocument();
  });
});

describe("Save to your network", () => {
  it("signed in: saves them by their handle (method link), and says so", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE({ relation: { saved_by_me: false, saved_me: false, mutual: false, network_id: null } })));
    profilesApi.save.mockResolvedValue(parseSaveResult({ person: { id: 5, mutual: false }, created: true, new_encounter: true, profile: PUBLIC_PROFILE() }));
    show(anon());
    await waitFor(() => expect(profilesApi.page).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Save Asha Rao to your network" }));
    await waitFor(() => expect(profilesApi.save).toHaveBeenCalledWith("asha"));
    expect(await screen.findByText("Asha is in your network now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asha is in your network" })).toHaveAttribute("aria-pressed", "true");
    // Pressing again saves nothing more.
    fireEvent.click(screen.getByRole("button", { name: "Asha is in your network" }));
    expect(profilesApi.save).toHaveBeenCalledTimes(1);
  });

  it("says when they were in the network already (200, created false)", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE({ relation: { saved_by_me: false, saved_me: false, mutual: false, network_id: null } })));
    profilesApi.save.mockResolvedValue(parseSaveResult({ person: { id: 5, mutual: false }, created: false, new_encounter: false, profile: PUBLIC_PROFILE() }));
    show(anon());
    fireEvent.click(await screen.findByRole("button", { name: "Save Asha Rao to your network" }));
    expect(await screen.findByText("Asha was in your network already.")).toBeInTheDocument();
  });

  it("says when the two of them have saved each other", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE({ relation: { saved_by_me: false, saved_me: true, mutual: false, network_id: null } })));
    profilesApi.save.mockResolvedValue(parseSaveResult({ person: { id: 5, mutual: true }, created: true, profile: PUBLIC_PROFILE() }));
    show(anon());
    fireEvent.click(await screen.findByRole("button", { name: "Save Asha Rao to your network" }));
    expect(await screen.findByText("Saved. You and Asha have saved each other.")).toBeInTheDocument();
    expect(screen.getByText("Saved each other")).toBeInTheDocument();
  });

  it("shows someone already saved as saved", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE({ relation: { saved_by_me: true, saved_me: true, mutual: true, network_id: 9 } })));
    show(anon());
    expect(await screen.findByRole("button", { name: "Asha is in your network" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("You and Asha have saved each other.")).toBeInTheDocument();
  });

  it.each([
    [refused(403, "PROFILE_SCANNING_OFF"), "Asha isn't taking saves right now."],
    [refused(429, "RATE_LIMITED"), "That's a lot of saves in a row. Wait a minute, then try again."],
    [refused(404), "This profile isn't available any more."],
    [refused(500), "Something went wrong on our side. Try again in a moment."],
  ])("says why a save didn't go through (%#)", async (failure, words) => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE()));
    profilesApi.save.mockRejectedValue(failure);
    show(anon());
    fireEvent.click(await screen.findByRole("button", { name: "Save Asha Rao to your network" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(words);
    expect(screen.getByRole("button", { name: "Save Asha Rao to your network" })).toHaveAttribute("aria-pressed", "false");
  });

  it("signed out: offers the store and signing in, and saves nothing", async () => {
    enableSignIn();
    show(anon());
    fireEvent.click(screen.getByRole("button", { name: "Save Asha Rao to your network" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Save Asha to your network" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Get it on Google Play" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Sign in to save here" })).toBeInTheDocument();
    // Not on Android: a link to this site's own page wouldn't leave the browser, so there is none.
    expect(within(dialog).queryByRole("link", { name: "Open in the app" })).not.toBeInTheDocument();
    expect(profilesApi.save).not.toHaveBeenCalled();
    expect(profilesApi.page).not.toHaveBeenCalled();
  });

  it("on Android, Open in the app is an intent link into the app (the Play Store without it), ?save=1 kept", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36");
    show(anon());
    fireEvent.click(screen.getByRole("button", { name: "Save Asha Rao to your network" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Open in the app" })).toHaveAttribute(
      "href",
      `intent://myotherapp.in/u/asha?save=1#Intent;scheme=https;package=app.myotherapp.in;S.browser_fallback_url=${encodeURIComponent("https://play.google.com/store/apps/details?id=app.myotherapp.in")};end`,
    );
    vi.restoreAllMocks();
  });

  it("on a site without sign-in and off Android, the store alone (no empty 'or')", async () => {
    show(anon());
    fireEvent.click(screen.getByRole("button", { name: "Save Asha Rao to your network" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Get it on Google Play" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Sign in to save here" })).not.toBeInTheDocument();
    expect(within(dialog).queryByText("or")).not.toBeInTheDocument();
  });

  it("puts the offer first for a QR's link (?save=1), and not otherwise", async () => {
    const { unmount } = show(anon());
    expect(screen.queryByText(/so you can find them again after the event/)).not.toBeInTheDocument();
    unmount();
    window.history.replaceState({}, "", "/u/asha?save=1");
    show(anon());
    expect(await screen.findByText("Save Asha to your network, so you can find them again after the event.")).toBeInTheDocument();
  });

  it("never saves on opening, ?save=1 and signed in or not: only the reader's tap saves", async () => {
    enableSignIn();
    signInAs();
    window.history.replaceState({}, "", "/u/asha?save=1");
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE()));
    profilesApi.save.mockResolvedValue(parseSaveResult({ person: { id: 5, mutual: false }, created: true, profile: PUBLIC_PROFILE() }));
    show(anon());
    await waitFor(() => expect(profilesApi.page).toHaveBeenCalled());
    expect(await screen.findByText(/so you can find them again after the event/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(profilesApi.save).not.toHaveBeenCalled();
    expect(screen.queryByText(/is in your network/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Asha Rao to your network" }));
    await waitFor(() => expect(profilesApi.save).toHaveBeenCalledTimes(1));
  });
});

describe("Save contact", () => {
  it("is a plain link to the API's vCard for someone signed out", () => {
    show(anon());
    const link = screen.getByRole("link", { name: "Save Asha Rao's contact card" });
    expect(link).toHaveAttribute("href", "https://api.myotherapp.in/api/v1/profiles/asha/vcard");
    fireEvent.click(link);
    expect(profilesApi.vcard).not.toHaveBeenCalled();
  });

  it("signed in: fetches the card with their token, so it carries what they may see", async () => {
    enableSignIn();
    signInAs();
    profilesApi.page.mockResolvedValue(parsePublicProfile(PUBLIC_PROFILE()));
    profilesApi.vcard.mockResolvedValue(new Blob(["BEGIN:VCARD\nEND:VCARD"], { type: "text/vcard" }));
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
    // The API's Content-Disposition isn't readable across origins: the site names the file.
    const saved = [];
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      saved.push({ href: this.href, download: this.download });
    });
    show(anon());
    await waitFor(() => expect(profilesApi.page).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("link", { name: "Save Asha Rao's contact card" }));
    await waitFor(() => expect(profilesApi.vcard).toHaveBeenCalledWith("asha"));
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(saved).toEqual([{ href: "blob:card", download: "asha.vcf" }]);
    clicked.mockRestore();
  });

  it("isn't offered for a private profile the reader can't see", () => {
    show(stableProfile(parsePublicProfile(PRIVATE_PROFILE())));
    expect(screen.queryByRole("link", { name: /contact card/ })).not.toBeInTheDocument();
  });
});

describe("/network's page in the browser", () => {
  it("on Android, opens the Network tab in the app for that event; elsewhere, the store alone", () => {
    const { unmount } = render(<NetworkInApp eventId="12" />);
    expect(screen.queryByRole("link", { name: "Open in the app" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get it on Google Play" })).toBeInTheDocument();
    unmount();
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14) Chrome/131 Mobile");
    render(<NetworkInApp eventId="12" />);
    expect(screen.getByRole("link", { name: "Open in the app" }).getAttribute("href")).toMatch(/^intent:\/\/myotherapp\.in\/network\?event=12#Intent;scheme=https;package=app\.myotherapp\.in;/);
    vi.restoreAllMocks();
  });
});
