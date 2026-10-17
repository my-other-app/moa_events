import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const { ThreadPage } = await import("./threadspage.jsx");
const { PROFILE, accessToken, enableSignIn, resetAuth, signInAs, stubGoogle } = await import("@/test/auth");

const club = { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null };
const post1 = {
  id: "t1",
  club,
  body: "Kits are in!",
  image: null,
  kind: "post",
  poll: null,
  pinned: false,
  likes: 12,
  comments: 0,
  views: 30,
  liked: false,
  created_at: "2026-10-15T10:00:00Z",
};
const poll = {
  id: "t2",
  club,
  body: "Which night for the next build?",
  kind: "poll",
  poll: {
    options: [
      { id: "a", label: "Friday", votes: 3, share: 60 },
      { id: "b", label: "Saturday", votes: 2, share: 40 },
    ],
    votes: 5,
    voted_option_id: null,
  },
  likes: 1,
  comments: 0,
  liked: false,
  created_at: "2026-10-16T08:00:00Z",
};

let thread;
beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  thread = { ...post1 };
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    if (url.endsWith("/comments")) return { data: [] };
    if (url === `/api/v1/threads/${thread.id}`) return { data: thread };
    throw new Error(`unexpected GET ${url}`);
  });
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

const show = (id = "t1") =>
  render(
    <MemoryRouter initialEntries={[`/threads/${id}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/threads/:id" element={<ThreadPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );

describe("a post, signed in", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it("is read as the signed-in person, and Like likes it here — at once, and back again", async () => {
    post.mockResolvedValueOnce({ data: { liked: true, likes: 13 } }).mockResolvedValueOnce({ data: { liked: false, likes: 12 } });
    show();
    const like = await screen.findByRole("button", { name: "Like" });
    expect(get).toHaveBeenCalledWith("/api/v1/threads/t1", { userOnly: true });
    expect(like).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(like).toHaveTextContent("Liked");
    expect(screen.getByText("13 likes")).toBeInTheDocument();
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/threads/t1/like"));

    fireEvent.click(like);
    await waitFor(() => expect(like).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByText("12 likes")).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    // Commenting still happens in the app.
    fireEvent.click(screen.getByRole("button", { name: /^Comment$/ }));
    expect(screen.getByRole("dialog", { name: "Do this in the app" })).toBeInTheDocument();
  });

  it("puts the like back when it doesn't save", async () => {
    post.mockRejectedValue(Object.assign(new Error("500"), { response: { status: 500 } }));
    show();
    const like = await screen.findByRole("button", { name: "Like" });
    fireEvent.click(like);
    expect(await screen.findByText("Your like didn't save. Try again.")).toBeInTheDocument();
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("12 likes")).toBeInTheDocument();
  });

  it("votes in a poll and shows the poll as it now stands", async () => {
    thread = { ...poll };
    post.mockResolvedValue({
      data: {
        options: [
          { id: "a", label: "Friday", votes: 3, share: 50 },
          { id: "b", label: "Saturday", votes: 3, share: 50 },
        ],
        votes: 6,
        voted_option_id: "b",
      },
    });
    show("t2");
    fireEvent.click(await screen.findByRole("button", { name: "Vote for Saturday (40% so far)" }));
    expect(screen.getByRole("button", { name: /Saturday: your vote/ })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/threads/t2/vote", { option_id: "b" }));
    expect(await screen.findByText("6 votes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saturday: your vote (50%)" })).toBeInTheDocument();
  });
});

describe("a post, signed out", () => {
  it("offers signing in beside the app, and likes once signed in (unless already liked)", async () => {
    enableSignIn();
    stubGoogle();
    const access = accessToken();
    post.mockImplementation(async (url) => {
      if (url === "/api/v1/auth/google") return { data: { access_token: access, refresh_token: "refresh-1", token_type: "Bearer" } };
      if (url === "/api/v1/threads/t1/like") return { data: { liked: true, likes: 13 } };
      throw new Error(`unexpected POST ${url}`);
    });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Like" }));
    const prompt = screen.getByRole("dialog", { name: "Do this in the app" });
    fireEvent.click(within(prompt).getByRole("button", { name: "Sign in to like it here" }));
    const sheet = await screen.findByRole("dialog", { name: "Sign in to like posts" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/threads/t1/like"));
    expect(await screen.findByRole("button", { name: "Liked" })).toHaveAttribute("aria-pressed", "true");
    // Read again as the new reader before liking, so an earlier like isn't undone.
    expect(get.mock.calls.filter(([url]) => url === "/api/v1/threads/t1")).toHaveLength(2);
    expect(post.mock.calls.filter(([url]) => url === "/api/v1/threads/t1/like")).toHaveLength(1);
  });

  it("offers only the app in a build without sign-in", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Like" }));
    const prompt = screen.getByRole("dialog", { name: "Do this in the app" });
    expect(within(prompt).queryByRole("button", { name: /Sign in/ })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
