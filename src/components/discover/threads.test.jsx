import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { parseComment, parseThread, parseThreadsPage } = await import("@/api/parse");
const { ThreadMissing, ThreadView, ThreadsView } = await import("./threadspage.jsx");

/*
 * The posts as the server renders them (src/app/threads, src/app/threads/[id]):
 * the list and a post, read as nobody; "Load more" and every action are
 * islands. Signed in, a post is liked and voted on here: threads.signedin.test.jsx.
 */

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

const show = (element) => render(<MemoryRouter>{element}</MemoryRouter>);
const COMMENTS = [
  { id: "c1", body: "Friday please", author: { id: 7, name: "Rohan P.", is_club: false }, created_at: "2026-10-16T09:00:00Z" },
  { id: "c2", body: "Noted!", author: { id: null, name: "Circuit Society", is_club: true }, created_at: "2026-10-16T09:30:00Z" },
].map(parseComment);

beforeEach(() => {
  get.mockReset();
  window.scrollTo = vi.fn();
});

describe("the threads page", () => {
  it("lists the clubs' latest posts with their counts, polls as share bars", async () => {
    show(<ThreadsView page={parseThreadsPage({ items: [post, poll], total: 2, offset: 0, limit: 12 })} />);
    expect(screen.getByText("Kits are in! Pick yours up at Lab 3B.")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByText(/Like, vote and comment in the app/)).toBeInTheDocument();
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

  it("reads later posts in the browser", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...post, id: `p${i}`, body: `Post ${i}` }));
    get.mockResolvedValueOnce({ data: { items: [{ ...post, id: "p12", body: "Post 12" }], total: 13 } });
    show(<ThreadsView page={parseThreadsPage({ items: many, total: 13 })} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Post 12")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/threads", { params: { offset: 12, limit: 12 }, skipAuth: true });
  });

  it("says so when there are no posts", () => {
    show(<ThreadsView page={parseThreadsPage({ items: [], total: 0 })} />);
    expect(screen.getByRole("heading", { name: "No posts yet" })).toBeInTheDocument();
  });
});

describe("one post", () => {
  it("shows the post and its comments, and sends every action to the app", async () => {
    show(<ThreadView thread={parseThread(poll)} comments={COMMENTS} />);
    expect(screen.getByText("Which night for the next build?")).toBeInTheDocument();
    expect(screen.getByText("Friday please")).toBeInTheDocument();
    // Signed out, nothing more is read: the post is as the server read it.
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Comments (2)" })).toBeInTheDocument();
    expect(screen.getByText("Club")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Vote for Friday/ }));
    let dialog = screen.getByRole("dialog", { name: "Do this in the app" });
    expect(within(dialog).getByText(/Polls are answered in the MyOtherApp app/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Like (1 like)" }));
    dialog = screen.getByRole("dialog", { name: "Do this in the app" });
    expect(within(dialog).getByText(/Liking a post/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Comment (2 comments)" }));
    expect(within(screen.getByRole("dialog")).getByText(/Comments are written in the MyOtherApp app/)).toBeInTheDocument();
  });

  // The owner saw "two Like and Comment buttons" on a post's page: a row of
  // counts drawn with the same heart and speech bubble sat above the Like and
  // Comment row, and "Add a comment" repeated Comment under the comments.
  it("has one Like and one Comment, carrying the counts: nothing else on the page reads as liking or commenting", () => {
    const { container } = show(<ThreadView thread={parseThread(post)} comments={COMMENTS} />);
    const like = screen.getByRole("button", { name: "Like (12 likes)" });
    const comment = screen.getByRole("button", { name: "Comment (2 comments)" });
    expect(screen.getAllByRole("button", { name: /like/i })).toEqual([like]);
    expect(screen.getAllByRole("button", { name: /comment/i })).toEqual([comment]);
    expect(like.querySelector(".dc-tcard-count")).toHaveTextContent("12");
    expect(comment.querySelector(".dc-tcard-count")).toHaveTextContent("2");

    // No other words about likes or comments in the post, and one heart and one speech bubble.
    const card = container.querySelector("article");
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    const outside = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.parentElement.closest("button") && /\b(likes?|liked|comments?)\b/i.test(n.data)) outside.push(n.data);
    }
    expect(outside).toEqual([]);
    expect(card.querySelectorAll("svg")).toHaveLength(2);
    expect(like.querySelectorAll("svg")).toHaveLength(1);
    expect(comment.querySelectorAll("svg")).toHaveLength(1);
  });

  it("counts the comments it shows, and shows no 0 on a button", () => {
    show(<ThreadView thread={parseThread({ ...post, likes: 0 })} comments={COMMENTS.slice(0, 1)} />);
    const like = screen.getByRole("button", { name: "Like (0 likes)" });
    expect(like.querySelector(".dc-tcard-count")).toBeNull();
    expect(screen.getByRole("button", { name: "Comment (1 comment)" }).querySelector(".dc-tcard-count")).toHaveTextContent("1");
    expect(screen.getByRole("heading", { name: "Comments (1)" })).toBeInTheDocument();
  });

  it("still shows the post when its comments couldn't be read", () => {
    show(<ThreadView thread={parseThread(post)} comments={null} />);
    expect(screen.getByText("Kits are in! Pick yours up at Lab 3B.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comments (2)" })).toBeInTheDocument();
    expect(screen.getByText("Comments couldn’t load just now.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All posts/ })).toHaveAttribute("href", "/threads");
  });

  it("says when a post is gone", () => {
    show(<ThreadMissing />);
    expect(screen.getByRole("heading", { level: 1, name: "This post is gone" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the latest posts" })).toHaveAttribute("href", "/threads");
  });
});
