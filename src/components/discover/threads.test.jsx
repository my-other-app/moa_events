import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { ThreadPage, ThreadsPage } = await import("./threadspage.jsx");

const club = { id: 3, name: "Circuit Society", slug: "circuit-society", logo: { thumbnail: "https://cdn.example/t.png" } };
const post = { id: "t1", club, body: "Kits are in! Pick yours up at Lab 3B.", image: { medium: "https://cdn.example/kit-m.jpg", original: "https://cdn.example/kit.jpg" }, kind: "post", poll: null, pinned: true, likes: 12, comments: 2, views: 300, liked: false, created_at: "2026-10-15T10:00:00Z" };
const poll = {
  id: "t2",
  club,
  body: "Which night for the next build?",
  kind: "poll",
  poll: { options: [{ id: "a", label: "Friday", votes: 30, share: 60 }, { id: "b", label: "Saturday", votes: 20, share: 40 }], votes: 50, voted_option_id: null },
  likes: 1,
  comments: 0,
  created_at: "2026-10-16T08:00:00Z",
};

const show = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/threads" element={<ThreadsPage />} />
        <Route path="/threads/:id" element={<ThreadPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  get.mockReset();
  window.scrollTo = vi.fn();
});

describe("the threads page", () => {
  it("lists the clubs' latest posts with their counts, polls as share bars", async () => {
    get.mockResolvedValue({ data: { items: [post, poll], total: 2, offset: 0, limit: 12 } });
    show("/threads");
    expect(await screen.findByText("Kits are in! Pick yours up at Lab 3B.")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/threads", { params: { offset: 0, limit: 12 }, skipAuth: true });
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("12 likes")).toBeInTheDocument();
    expect(screen.getByText("2 comments")).toBeInTheDocument();
    expect(screen.getByAltText("Picture posted by Circuit Society")).toHaveAttribute("src", "https://cdn.example/kit-m.jpg");
    expect(screen.getByText("Friday")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("50 votes")).toBeInTheDocument();
    // In a list, a poll is read-only; the card opens the post.
    expect(screen.queryByRole("button", { name: /Vote for/ })).toBeNull();
    expect(screen.getAllByRole("link", { name: /open this post/ })[0]).toHaveAttribute("href", "/threads/t1");
    expect(screen.getAllByRole("link", { name: "Circuit Society" })[0]).toHaveAttribute("href", "/clubs/circuit-society");
  });

  it("says so when there are no posts", async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } });
    show("/threads");
    expect(await screen.findByRole("heading", { name: "No posts yet" })).toBeInTheDocument();
  });
});

describe("one post", () => {
  it("shows the post and its comments, and sends every action to the app", async () => {
    get.mockImplementation(async (url) => {
      if (url === "/api/v1/threads/t2") return { data: poll };
      if (url === "/api/v1/threads/t2/comments")
        return {
          data: [
            { id: "c1", body: "Friday please", author: { id: 7, name: "Rohan P.", is_club: false }, created_at: "2026-10-16T09:00:00Z" },
            { id: "c2", body: "Noted!", author: { id: null, name: "Circuit Society", is_club: true }, created_at: "2026-10-16T09:30:00Z" },
          ],
        };
      throw new Error(`unexpected ${url}`);
    });
    show("/threads/t2");
    expect(await screen.findByText("Which night for the next build?")).toBeInTheDocument();
    expect(await screen.findByText("Friday please")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comments (2)" })).toBeInTheDocument();
    expect(screen.getByText("Club")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Vote for Friday/ }));
    let dialog = screen.getByRole("dialog", { name: "Do this in the app" });
    expect(within(dialog).getByText(/Polls are answered in the MyOtherApp app/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Like" }));
    dialog = screen.getByRole("dialog", { name: "Do this in the app" });
    expect(within(dialog).getByText(/Liking a post/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Add a comment" }));
    expect(within(screen.getByRole("dialog")).getByText(/Comments are written in the MyOtherApp app/)).toBeInTheDocument();
  });

  it("says when a post is gone", async () => {
    get.mockRejectedValue(Object.assign(new Error("404"), { response: { status: 404 } }));
    show("/threads/missing");
    expect(await screen.findByRole("heading", { name: "This post is gone" })).toBeInTheDocument();
  });
});
