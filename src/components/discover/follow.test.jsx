import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: vi.fn(() => Promise.resolve({ data: {} })) } }));
vi.mock("@/utils/visit", () => ({ countVisit: vi.fn() }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const ClubPage = (await import("./clubpage.jsx")).default;
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
function answer() {
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/discover/clubs/circuit-society") return { data: page };
    if (url === "/api/v1/clubs/info/3") return { data: { id: 3, user_data: { is_following: following, is_pinned: false, is_hidden: false } } };
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    throw new Error(`unexpected GET ${url}`);
  });
}

const show = () =>
  render(
    <MemoryRouter initialEntries={["/clubs/circuit-society"]}>
      <AuthProvider>
        <Routes>
          <Route path="/clubs/:slug" element={<ClubPage />} />
        </Routes>
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
      if (url === "/api/v1/discover/clubs/circuit-society") return { data: { ...page, upcoming: [] } };
      if (url === "/api/v1/clubs/info/3") return { data: { user_data: { is_following: false } } };
      return { data: PROFILE };
    });
    post.mockResolvedValue({ data: { is_following: true } });
    show();
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
