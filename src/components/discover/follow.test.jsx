import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock("@/utils/visit", () => ({ countVisit: vi.fn() }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const { ClubView } = await import("./clubpage.jsx");
const { parseClubPage } = await import("@/api/discover");
const { PROFILE, accessToken, enableSignIn, resetAuth, signInAs, stubGoogle } = await import("@/test/auth");

const page = {
  club: {
    id: 3,
    name: "Circuit Society",
    slug: "circuit-society",
    logo: null,
    cover: null,
    tagline: "We build things that blink",
    followers: 40,
    upcoming_events: 0,
    interests: [],
  },
  upcoming: [{ id: 68, name: "Hack Night 04", slug: "hack-night-04", starts_at: "2026-10-30T12:30:00Z", status: "upcoming", has_fee: false, going: 40 }],
  past: [],
  threads: [],
  team: [],
  partners: [],
};

let following;
// The person's yes to the club's updates on WhatsApp, as GET /clubs/info says it; undefined from an API without it.
let updates;
function answer() {
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/discover/clubs/circuit-society") return { data: page };
    if (url === "/api/v1/clubs/info/3")
      return { data: { id: 3, user_data: { is_following: following, is_pinned: false, is_hidden: false, club_updates_whatsapp: updates } } };
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    throw new Error(`unexpected GET ${url}`);
  });
}

/* The club page as the server renders it (with the API's answer `data`), under the site's sign-in. */
const show = (data = page) =>
  render(
    <MemoryRouter initialEntries={["/clubs/circuit-society"]}>
      <AuthProvider>
        <ClubView data={parseClubPage(data)} />
      </AuthProvider>
    </MemoryRouter>,
  );

const followers = () =>
  screen
    .getByText(/followers?$/)
    .textContent.replace(/\s+/g, " ")
    .trim();
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  following = false;
  updates = undefined;
  answer();
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("following a club, signed in", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it("follows at once, then unfollows, with the count moving with it", async () => {
    const call = deferred();
    post.mockImplementation((url) => (url === "/api/v1/clubs/follow/3" ? call.promise : Promise.resolve({ data: { is_following: false } })));
    show();
    const button = await screen.findByRole("button", { name: "Follow" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(followers()).toBe("40 followers");
    expect(screen.queryByRole("button", { name: "Follow in the app" })).toBeNull();

    fireEvent.click(button);
    // Before the server has answered.
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Following");
    expect(followers()).toBe("41 followers");
    expect(post).toHaveBeenCalledWith("/api/v1/clubs/follow/3", null, undefined);
    call.resolve({ data: { is_following: true } });
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(followers()).toBe("41 followers");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(followers()).toBe("40 followers");
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/clubs/unfollow/3"));
  });

  it("animates only the reader's own press: the tick pops and the new label slides in", async () => {
    post.mockResolvedValue({ data: { is_following: true } });
    show();
    const button = await screen.findByRole("button", { name: "Follow" });
    expect(button).not.toHaveAttribute("data-pop");
    expect(button.querySelector(".ac-follow-label")).not.toHaveClass("is-swapped");

    fireEvent.click(button);
    expect(button).toHaveAttribute("data-pop");
    expect(button.querySelector(".ac-follow-label")).toHaveClass("is-swapped");
    expect(button.querySelector(".ac-follow-label")).toHaveTextContent("Following");
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));

    // Unfollowing: no pop, the label still slides.
    fireEvent.click(button);
    expect(button).not.toHaveAttribute("data-pop");
    expect(button.querySelector(".ac-follow-label")).toHaveClass("is-swapped");
  });

  it("starts as Following, without a pop, for someone who already follows", async () => {
    following = true;
    show();
    const button = await screen.findByRole("button", { name: /Following/ });
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
    expect(button).not.toHaveAttribute("data-pop");
    expect(button.querySelector(".ac-follow-label")).not.toHaveClass("is-swapped");
  });

  it("starts as Following for someone who already follows", async () => {
    following = true;
    show();
    const button = await screen.findByRole("button", { name: /Following/ });
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
    expect(get).toHaveBeenCalledWith("/api/v1/clubs/info/3");
  });

  it("goes back and says so when the follow fails", async () => {
    post.mockRejectedValue(Object.assign(new Error("500"), { response: { status: 500 } }));
    show();
    const button = await screen.findByRole("button", { name: "Follow" });
    fireEvent.click(button);
    expect(await screen.findByText("Couldn't follow just now. Try again.")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(followers()).toBe("40 followers");
  });

  it("takes 'already following' as the state asked for, without counting twice", async () => {
    post.mockRejectedValue(Object.assign(new Error("409"), { response: { status: 409, data: { message: "already following" } } }));
    show();
    const button = await screen.findByRole("button", { name: "Follow" });
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(followers()).toBe("40 followers");
    expect(screen.queryByText(/Couldn't follow/)).toBeNull();
  });

  it("credits the tracking link the page came by", async () => {
    sessionStorage.setItem("moa.ref", "x7k2m9pq");
    post.mockResolvedValue({ data: { is_following: true } });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Follow" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/clubs/follow/3", null, { params: { ref: "x7k2m9pq" } }));
  });
});

describe("an empty club page, signed in", () => {
  it("offers Follow in the empty upcoming list too, and says so once following", async () => {
    enableSignIn();
    signInAs();
    get.mockImplementation(async (url) => {
      if (url === "/api/v1/clubs/info/3") return { data: { user_data: { is_following: false } } };
      return { data: PROFILE };
    });
    post.mockResolvedValue({ data: { is_following: true } });
    show({ ...page, upcoming: [] });
    const empty = (await screen.findByRole("heading", { name: "Nothing scheduled yet" })).parentElement;
    expect(within(empty).getByText("Follow Circuit Society to hear the moment they announce their next event.")).toBeInTheDocument();
    fireEvent.click(within(empty).getByRole("button", { name: "Follow" }));
    expect(await within(empty).findByText(/You follow Circuit Society/)).toBeInTheDocument();
    expect(within(empty).queryByRole("button")).toBeNull();
  });
});

describe("following a club, signed out", () => {
  it("keeps Follow in the app, with signing in as the other way — and follows once signed in", async () => {
    enableSignIn();
    stubGoogle();
    const access = accessToken();
    post.mockImplementation(async (url) => {
      if (url === "/api/v1/auth/google") return { data: { access_token: access, refresh_token: "refresh-1", token_type: "Bearer" } };
      if (url === "/api/v1/clubs/follow/3") return { data: { is_following: true } };
      throw new Error(`unexpected POST ${url}`);
    });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Follow in the app" }));
    const prompt = screen.getByRole("dialog", { name: "Follow Circuit Society" });
    expect(within(prompt).getByRole("link", { name: "Get it on Google Play" })).toBeInTheDocument();
    fireEvent.click(within(prompt).getByRole("button", { name: "Sign in to follow here" }));

    const sheet = await screen.findByRole("dialog", { name: "Sign in to follow" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));

    const button = await screen.findByRole("button", { name: /Following/ });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(post).toHaveBeenCalledWith("/api/v1/clubs/follow/3", null, undefined);
    await waitFor(() => expect(followers()).toBe("41 followers"));
  });

  it("offers only the app in a build without sign-in", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Follow in the app" }));
    const prompt = screen.getByRole("dialog", { name: "Follow Circuit Society" });
    expect(within(prompt).queryByRole("button", { name: /Sign in/ })).toBeNull();
    expect(get).not.toHaveBeenCalledWith("/api/v1/clubs/info/3");
  });
});

describe("Get updates from the club on WhatsApp", () => {
  const LABEL = "Get updates from Circuit Society on WhatsApp";
  const offering = { ...page, club: { ...page.club, whatsapp_updates: true } };
  const box = () => screen.queryByRole("checkbox", { name: LABEL });

  describe("signed in", () => {
    beforeEach(() => {
      enableSignIn();
      signInAs();
    });

    it("sits unticked beside Follow, and goes with the follow when ticked", async () => {
      post.mockResolvedValue({ data: { is_following: true } });
      show(offering);
      const follow = await screen.findByRole("button", { name: "Follow" });
      const tick = await screen.findByRole("checkbox", { name: LABEL });
      expect(tick).not.toBeChecked();
      expect(screen.getByText(/Comes with the follow/)).toBeInTheDocument();
      fireEvent.click(tick);
      expect(tick).toBeChecked();
      fireEvent.click(follow);
      expect(post).toHaveBeenCalledWith("/api/v1/clubs/follow/3", { club_updates_whatsapp: true }, undefined);
      await waitFor(() => expect(follow).not.toHaveAttribute("aria-busy"));
      // Now it is the follower's own switch, on.
      expect(box()).toBeChecked();
      expect(screen.getByText(/Untick to stop them/)).toBeInTheDocument();
    });

    it("left unticked, the follow is sent as it always was", async () => {
      post.mockResolvedValue({ data: { is_following: true } });
      show(offering);
      fireEvent.click(await screen.findByRole("button", { name: "Follow" }));
      expect(post).toHaveBeenCalledWith("/api/v1/clubs/follow/3", null, undefined);
      await waitFor(() => expect(screen.getByRole("button", { name: /Following/ })).not.toHaveAttribute("aria-busy"));
      expect(box()).not.toBeChecked();
    });

    it("lets a follower turn it off, and on again, without touching the follow", async () => {
      following = true;
      updates = true;
      post.mockResolvedValue({ data: { is_following: true } });
      show(offering);
      const tick = await screen.findByRole("checkbox", { name: LABEL });
      await waitFor(() => expect(tick).toBeChecked());
      fireEvent.click(tick);
      expect(tick).not.toBeChecked();
      expect(post).toHaveBeenCalledWith("/api/v1/clubs/follow/3", { club_updates_whatsapp: false });
      await waitFor(() => expect(tick).not.toBeDisabled());
      fireEvent.click(tick);
      expect(post).toHaveBeenLastCalledWith("/api/v1/clubs/follow/3", { club_updates_whatsapp: true });
      await waitFor(() => expect(tick).not.toBeDisabled());
      expect(tick).toBeChecked();
      expect(screen.getByRole("button", { name: /Following/ })).toHaveAttribute("aria-pressed", "true");
      expect(post).not.toHaveBeenCalledWith("/api/v1/clubs/unfollow/3");
    });

    it("puts the switch back, and says so, when the server says no", async () => {
      following = true;
      updates = false;
      post.mockRejectedValue(new Error("down"));
      show(offering);
      const tick = await screen.findByRole("checkbox", { name: LABEL });
      await waitFor(() => expect(screen.getByRole("button", { name: /Following/ })).toHaveAttribute("aria-pressed", "true"));
      fireEvent.click(tick);
      expect(await screen.findByText(/Couldn't turn on WhatsApp updates/)).toBeInTheDocument();
      expect(tick).not.toBeChecked();
    });

    it("unfollowing takes the yes with it", async () => {
      following = true;
      updates = true;
      post.mockResolvedValue({ data: { is_following: false } });
      show(offering);
      const tick = await screen.findByRole("checkbox", { name: LABEL });
      await waitFor(() => expect(tick).toBeChecked());
      fireEvent.click(screen.getByRole("button", { name: /Following/ }));
      await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/clubs/unfollow/3"));
      expect(box()).not.toBeChecked();
      expect(screen.getByText(/Comes with the follow/)).toBeInTheDocument();
    });

    it("is not there for a club without the flag, whatever the person said before", async () => {
      following = true;
      updates = true;
      show();
      await waitFor(() => expect(screen.getByRole("button", { name: /Following/ })).toHaveAttribute("aria-pressed", "true"));
      expect(screen.queryByRole("checkbox", { name: /Get updates from/ })).toBeNull();
    });
  });

  it("is not there signed out: following happens in the app, or after signing in", async () => {
    enableSignIn();
    show(offering);
    await screen.findByRole("button", { name: "Follow in the app" });
    expect(screen.queryByRole("checkbox", { name: /Get updates from/ })).toBeNull();
  });
});
