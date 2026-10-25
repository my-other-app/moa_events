import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const { parseThread } = await import("@/api/parse");
const { ThreadView } = await import("./threadspage.jsx");
const { hydrate } = await import("@/test/hydrate");
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

/** The post as the server rendered it (read as nobody: not liked, no vote), in the site's providers. */
const page = (id = "t1") => (
  <MemoryRouter initialEntries={[`/threads/${id}`]}>
    <AuthProvider>
      <ThreadView thread={parseThread({ ...(id === "t2" ? poll : post1), liked: false })} comments={[]} />
    </AuthProvider>
  </MemoryRouter>
);
const show = (id) => render(page(id));

describe("a post, signed in", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it("is read as the signed-in person, and Like likes it here — at once, and back again", async () => {
    post.mockResolvedValueOnce({ data: { liked: true, likes: 13 } }).mockResolvedValueOnce({ data: { liked: false, likes: 12 } });
    show();
    const like = await screen.findByRole("button", { name: "Like (12 likes)" });
    expect(get).toHaveBeenCalledWith("/api/v1/threads/t1", { userOnly: true });
    expect(like).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(like);
    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(like).toHaveAccessibleName("Liked (13 likes)");
    expect(like.querySelector(".dc-tcard-count")).toHaveTextContent("13");
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/threads/t1/like"));

    fireEvent.click(like);
    await waitFor(() => expect(like).toHaveAttribute("aria-pressed", "false"));
    expect(like).toHaveAccessibleName("Like (12 likes)");
    expect(post).toHaveBeenCalledTimes(2);
    // Still one like control, and Comment goes to the box under the comments, not to the app.
    expect(screen.getAllByRole("button", { name: /like/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^Comment\b/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toHaveFocus();
  });

  it("pops the heart and rolls the count only for the reader's own like", async () => {
    post.mockResolvedValueOnce({ data: { liked: true, likes: 13 } });
    show();
    const like = await screen.findByRole("button", { name: "Like (12 likes)" });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/threads/t1", { userOnly: true }));
    expect(like).not.toHaveAttribute("data-pop");
    expect(like.querySelector(".dc-tcard-count")).not.toHaveClass("is-bumped");

    fireEvent.click(like);
    expect(like).toHaveAttribute("data-pop");
    expect(like.querySelector(".dc-tcard-count")).toHaveClass("is-bumped");
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/threads/t1/like"));
  });

  it("shows a like it already had without a pop", async () => {
    thread = { ...post1, liked: true, likes: 13 };
    show();
    const like = await screen.findByRole("button", { name: "Liked (13 likes)" });
    expect(like).toHaveAttribute("aria-pressed", "true");
    expect(like).not.toHaveAttribute("data-pop");
    expect(like.querySelector(".dc-tcard-count")).not.toHaveClass("is-bumped");
  });

  it("puts the like back when it doesn't save", async () => {
    post.mockRejectedValue(Object.assign(new Error("500"), { response: { status: 500 } }));
    show();
    const like = await screen.findByRole("button", { name: "Like (12 likes)" });
    fireEvent.click(like);
    expect(await screen.findByText("Your like didn't save. Try again.")).toBeInTheDocument();
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(like).toHaveAccessibleName("Like (12 likes)");
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

describe("a post, signed in, from the server's HTML", () => {
  it("hydrates as nobody's post, then shows the reader's own like", async () => {
    enableSignIn();
    thread = { ...post1, liked: true, likes: 13 };
    const { problems, container, unmount } = await hydrate(page("t1"), { inBrowser: () => signInAs() });
    expect(problems.filter((p) => /hydrat|did not match|mismatch/i.test(p))).toEqual([]);
    await waitFor(() => expect(within(container).getByRole("button", { name: "Liked (13 likes)" })).toHaveAttribute("aria-pressed", "true"));
    expect(within(container).getAllByRole("button", { name: /like/i })).toHaveLength(1);
    unmount();
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
    fireEvent.click(await screen.findByRole("button", { name: "Like (12 likes)" }));
    const prompt = screen.getByRole("dialog", { name: "Do this in the app" });
    fireEvent.click(within(prompt).getByRole("button", { name: "Sign in to like it here" }));
    const sheet = await screen.findByRole("dialog", { name: "Sign in to like posts" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/threads/t1/like"));
    expect(await screen.findByRole("button", { name: "Liked (13 likes)" })).toHaveAttribute("aria-pressed", "true");
    // Read as the new reader before liking, so an earlier like isn't undone.
    expect(get.mock.calls.filter(([url]) => url === "/api/v1/threads/t1")).toHaveLength(1);
    expect(post.mock.calls.filter(([url]) => url === "/api/v1/threads/t1/like")).toHaveLength(1);
  });

  it("offers only the app in a build without sign-in", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Like (12 likes)" }));
    const prompt = screen.getByRole("dialog", { name: "Do this in the app" });
    expect(within(prompt).queryByRole("button", { name: /Sign in/ })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
