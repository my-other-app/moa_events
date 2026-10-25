import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: del } }));

const { AuthProvider } = await import("@/auth/AuthProvider");
const { parseComment, parseThread, parseThreadsPage } = await import("@/api/parse");
const { ThreadView, ThreadsView } = await import("./threadspage.jsx");
const { hydrate } = await import("@/test/hydrate");
const { PROFILE, accessToken, enableSignIn, resetAuth, signInAs, stubGoogle } = await import("@/test/auth");
// The sign-in sheet loads lazily on first use: loaded up front, so a busy machine does not time the tests out.
await import("@/components/auth/signinsheet");

/*
 * Commenting on a post from the website (the app's own routes): a signed-in
 * reader writes under the comments; signed out, Comment and the empty list
 * offer signing in first and the app second. PROFILE (the signed-in reader)
 * is account 7.
 */

const club = { id: 3, name: "Circuit Society", slug: "circuit-society", logo: null };
const post1 = { id: "t1", club, body: "Kits are in!", image: null, kind: "post", poll: null, likes: 12, comments: 0, liked: false, created_at: "2026-10-15T10:00:00Z" };

const comment = (id, body, author, created_at = "2026-10-16T09:00:00Z") => parseComment({ id, body, author, created_at });
const ROHAN = { id: 9, name: "Rohan P.", is_club: false };
const ASHA = { id: PROFILE.id, name: "Asha Rao", is_club: false };
const CLUB = { id: 1, name: "Circuit Society", is_club: true };

/** The API's answer to a new comment (CommentOut). */
const saved = (body, id = "c-new") => ({ data: { id, body, author: { ...ASHA, avatar: null }, created_at: new Date().toISOString() } });

const failure = (status) => Object.assign(new Error(String(status)), { response: { status, data: {} } });

/** A promise to settle by hand, to look at the page while a request is on its way. */
function later() {
  let settle;
  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  return { promise, ...settle };
}

let thread;
// The comments the API has now (read again for a signed-in reader); the page's HTML may be older.
let apiComments;
let readComments;
beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  thread = { ...post1 };
  apiComments = [];
  readComments = null;
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    if (url === `/api/v1/threads/${thread.id}`) return { data: thread };
    if (url === `/api/v1/threads/${thread.id}/comments`) return readComments ? readComments.promise : { data: apiComments };
    throw new Error(`unexpected GET ${url}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

/** The post as the server rendered it, with these comments, in the site's providers. */
const page = (comments = []) => (
  <MemoryRouter initialEntries={["/threads/t1"]}>
    <AuthProvider>
      <ThreadView thread={parseThread({ ...post1, comments: comments ? comments.length : 0 })} comments={comments} />
    </AuthProvider>
  </MemoryRouter>
);
/** The page, its HTML read when the API had these comments (and, unless a test says otherwise, still has). */
const show = (comments) => {
  apiComments = comments || [];
  return render(page(comments));
};

const box = () => screen.getByRole("textbox", { name: "Write a comment" });
const postButton = () => screen.getByRole("button", { name: /^Post(ing…)?$/ });
const write = (text) => fireEvent.change(box(), { target: { value: text } });
const commentPosts = () => post.mock.calls.filter(([url]) => url === "/api/v1/threads/t1/comments");
const listed = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("commenting, signed in", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it("posts a comment: sent trimmed, shown once the server has it (not before), counted, and the box empties", async () => {
    const answer = later();
    post.mockImplementation((url) => (url === "/api/v1/threads/t1/comments" ? answer.promise : Promise.reject(new Error(`unexpected POST ${url}`))));
    show([comment("c1", "Friday please", ROHAN)]);

    expect(await screen.findByRole("textbox", { name: "Write a comment" })).toHaveAttribute("placeholder", "Write a comment…");
    expect(postButton()).toBeDisabled();
    write("  Count me in!  ");
    expect(postButton()).toBeEnabled();
    fireEvent.click(postButton());

    // On its way: nothing in the list yet, the box held as it is, Post busy.
    await waitFor(() => expect(commentPosts()).toEqual([["/api/v1/threads/t1/comments", { body: "Count me in!" }]]));
    expect(screen.queryByText("Count me in!", { selector: "li *" })).toBeNull();
    expect(listed()).toHaveLength(1);
    expect(postButton()).toHaveTextContent("Posting…");
    expect(postButton()).toBeDisabled();
    expect(box()).toHaveAttribute("readonly");
    expect(box()).toHaveValue("  Count me in!  ");

    answer.resolve(saved("Count me in!"));
    await waitFor(() => expect(listed()).toHaveLength(2));
    // At the end of the list, under the reader's name, and theirs to delete.
    expect(listed()[1]).toHaveTextContent("Asha Rao");
    expect(within(listed()[1]).getByText("Count me in!")).toBeInTheDocument();
    expect(within(listed()[1]).getByRole("button", { name: "Delete your comment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comment (2 comments)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comments (2)" })).toBeInTheDocument();
    expect(box()).toHaveValue("");
    expect(box()).not.toHaveAttribute("readonly");
    expect(postButton()).toHaveTextContent("Post");
    expect(postButton()).toBeDisabled();
    expect(screen.getByText("Your comment is posted.")).toBeInTheDocument();
  });

  it("writes the first comment under an empty list", async () => {
    post.mockResolvedValue(saved("First!"));
    show([]);
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "Write a comment" })).toHaveAttribute("placeholder", "Write the first comment…");
    // Signed in, nothing offers signing in.
    expect(screen.queryByRole("button", { name: /Sign in/ })).toBeNull();
    write("First!");
    fireEvent.click(postButton());
    expect(await screen.findByText("First!", { selector: "li *" })).toBeInTheDocument();
    expect(screen.queryByText("No comments yet.")).toBeNull();
    expect(screen.getByRole("button", { name: "Comment (1 comment)" })).toBeInTheDocument();
  });

  it("can't send an empty or blank comment, by button or by keys", async () => {
    show([]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    expect(postButton()).toBeDisabled();
    write("   \n\t  ");
    expect(postButton()).toBeDisabled();
    fireEvent.keyDown(box(), { key: "Enter", ctrlKey: true });
    fireEvent.submit(box().closest("form"));
    await Promise.resolve();
    expect(commentPosts()).toEqual([]);
  });

  it("sends with Ctrl+Enter or ⌘+Enter; a plain Enter is a new line", async () => {
    post.mockResolvedValueOnce(saved("One", "c-1")).mockResolvedValueOnce(saved("Two", "c-2"));
    show([]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    write("One");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(commentPosts()).toEqual([]);
    fireEvent.keyDown(box(), { key: "Enter", ctrlKey: true });
    expect(await screen.findByText("One", { selector: "li *" })).toBeInTheDocument();
    write("Two");
    fireEvent.keyDown(box(), { key: "Enter", metaKey: true });
    expect(await screen.findByText("Two", { selector: "li *" })).toBeInTheDocument();
    expect(commentPosts().map(([, body]) => body.body)).toEqual(["One", "Two"]);
  });

  it("holds a comment to 500 characters, and counts them near the end", async () => {
    post.mockImplementation(async (url, body) => saved(body.body));
    show([]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    expect(box()).toHaveAttribute("maxlength", "500");

    write("a".repeat(399));
    expect(screen.queryByText("399/500")).toBeNull();
    write("a".repeat(450));
    expect(screen.getByText("450/500")).toBeInTheDocument();
    expect(box()).toHaveAccessibleDescription("50 characters left");

    // Pasted past the end: cut at 500.
    write("b".repeat(600));
    expect(box().value).toHaveLength(500);
    expect(screen.getByText("500/500")).toBeInTheDocument();
    expect(box()).toHaveAccessibleDescription("0 characters left");
    fireEvent.click(postButton());
    await waitFor(() => expect(commentPosts()).toHaveLength(1));
    expect(commentPosts()[0][1].body).toBe("b".repeat(500));
  });

  it("keeps the words and says so when the comment doesn't post, and posts on a second try", async () => {
    post.mockRejectedValueOnce(failure(500)).mockResolvedValueOnce(saved("Is the lab open on Sunday?"));
    show([comment("c1", "Friday please", ROHAN)]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    write("Is the lab open on Sunday?");
    fireEvent.click(postButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Your comment didn't post. Try again.");
    expect(box()).toHaveValue("Is the lab open on Sunday?");
    expect(postButton()).toBeEnabled();
    expect(listed()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Comment (1 comment)" })).toBeInTheDocument();

    fireEvent.click(postButton());
    await waitFor(() => expect(listed()).toHaveLength(2));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(box()).toHaveValue("");
  });

  it("says to wait when the server says too many comments too fast (429)", async () => {
    post.mockRejectedValue(failure(429));
    show([]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    write("Again!");
    fireEvent.click(postButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("You're commenting too fast. Wait a minute and try again.");
    expect(box()).toHaveValue("Again!");
  });

  it("says so when the post has been removed (404)", async () => {
    post.mockRejectedValue(failure(404));
    show([]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    write("Hello?");
    fireEvent.click(postButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("This post has been removed, so it can't take comments.");
    expect(box()).toHaveValue("Hello?");
  });

  it("deletes the reader's own comment after they confirm, and offers no Delete on anyone else's", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    del.mockResolvedValue({ data: { deleted: true } });
    show([comment("c1", "Friday please", ROHAN), comment("c2", "Saturday works for me", ASHA), comment("c3", "Noted!", CLUB)]);
    await screen.findByRole("textbox", { name: "Write a comment" });

    const deletes = screen.getAllByRole("button", { name: "Delete your comment" });
    expect(deletes).toHaveLength(1);
    expect(listed()[1]).toContainElement(deletes[0]);

    // Not confirmed: nothing happens.
    fireEvent.click(deletes[0]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();

    fireEvent.click(deletes[0]);
    await waitFor(() => expect(screen.queryByText("Saturday works for me")).toBeNull());
    expect(del).toHaveBeenCalledWith("/api/v1/threads/t1/comments/c2");
    expect(listed()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Comment (2 comments)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comments (2)" })).toHaveFocus();
    expect(screen.getByText("Your comment is deleted.")).toBeInTheDocument();
  });

  it("keeps a comment that didn't delete, and says so", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    del.mockRejectedValue(failure(500));
    show([comment("c2", "Saturday works for me", ASHA)]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    fireEvent.click(screen.getByRole("button", { name: "Delete your comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your comment wasn't deleted. Try again.");
    expect(screen.getByText("Saturday works for me")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comment (1 comment)" })).toBeInTheDocument();
  });

  it("takes a comment already deleted elsewhere off the page too", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    del.mockRejectedValue(failure(404));
    show([comment("c2", "Saturday works for me", ASHA)]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    fireEvent.click(screen.getByRole("button", { name: "Delete your comment" }));
    await waitFor(() => expect(screen.queryByText("Saturday works for me")).toBeNull());
    expect(screen.getByText("No comments yet.")).toBeInTheDocument();
  });

  it("reads the comments again as the reader: their comment from a moment ago shows though the page's HTML is older", async () => {
    apiComments = [comment("c1", "Friday please", ROHAN), comment("c2", "Saturday works for me", ASHA)];
    render(page([comment("c1", "Friday please", ROHAN)]));
    expect(await screen.findByText("Saturday works for me")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/threads/t1/comments", { userOnly: true });
    expect(screen.getByRole("button", { name: "Comment (2 comments)" })).toBeInTheDocument();
    expect(within(listed()[1]).getByRole("button", { name: "Delete your comment" })).toBeInTheDocument();
  });

  it("shows the comments once read again, when the page's HTML couldn't have them", async () => {
    apiComments = [comment("c1", "Friday please", ROHAN)];
    render(page(null));
    expect(screen.getByText("Comments couldn’t load just now.")).toBeInTheDocument();
    expect(await screen.findByText("Friday please")).toBeInTheDocument();
    expect(screen.queryByText("Comments couldn’t load just now.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Comments (1)" })).toBeInTheDocument();
  });

  it("keeps a comment posted, and drops one deleted, while the comments were being read again", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    del.mockResolvedValue({ data: { deleted: true } });
    post.mockResolvedValue(saved("Count me in!"));
    readComments = later();
    show([comment("c1", "Friday please", ROHAN), comment("c2", "Saturday works for me", ASHA)]);
    await screen.findByRole("textbox", { name: "Write a comment" });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/threads/t1/comments", { userOnly: true }));

    write("Count me in!");
    fireEvent.click(postButton());
    await screen.findByText("Count me in!", { selector: "li *" });
    fireEvent.click(within(listed()[1]).getByRole("button", { name: "Delete your comment" }));
    await waitFor(() => expect(screen.queryByText("Saturday works for me")).toBeNull());

    // The read set out before either: it has c2 and not the new one.
    readComments.resolve({ data: [comment("c1", "Friday please", ROHAN), comment("c2", "Saturday works for me", ASHA), comment("c3", "Bringing snacks", ROHAN)] });
    expect(await screen.findByText("Bringing snacks")).toBeInTheDocument();
    expect(listed().map((li) => li.querySelector("p:last-child").textContent)).toEqual(["Friday please", "Bringing snacks", "Count me in!"]);
    expect(screen.getByRole("button", { name: "Comment (3 comments)" })).toBeInTheDocument();
  });

  it("says what a signed-in reader can do on the posts page", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ThreadsView page={parseThreadsPage({ items: [post1], total: 1 })} />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByText("News, photos and polls from clubs on MyOtherApp. Open a post to like it, vote or comment.")).toBeInTheDocument();
  });
});

describe("commenting, signed out", () => {
  beforeEach(() => {
    enableSignIn();
    stubGoogle();
    const access = accessToken();
    post.mockImplementation(async (url) => {
      if (url === "/api/v1/auth/google") return { data: { access_token: access, refresh_token: "refresh-1", token_type: "Bearer" } };
      throw new Error(`unexpected POST ${url}`);
    });
  });

  it("Comment offers signing in to comment here first, the app second; signed in, the box is there with focus", async () => {
    show([comment("c1", "Friday please", ROHAN)]);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Comment (1 comment)" }));

    const prompt = screen.getByRole("dialog", { name: "Comment on this post" });
    expect(within(prompt).getByText("Sign in and write your comment right here. It's free, and it's the same account as the MyOtherApp app.")).toBeInTheDocument();
    const signIn = within(prompt).getByRole("button", { name: "Sign in to comment here" });
    const play = within(prompt).getByRole("link", { name: "Get it on Google Play" });
    // Signing in comes first: there is no iPhone app yet.
    expect(signIn.compareDocumentPosition(play) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(prompt).getByText("or get the app")).toBeInTheDocument();
    expect(within(prompt).queryByText(/Comments are written in the MyOtherApp app/)).toBeNull();

    fireEvent.click(signIn);
    const sheet = await screen.findByRole("dialog", { name: "Sign in to comment" }, { timeout: 5000 });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }, { timeout: 5000 }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Write a comment" })).toHaveFocus(), { timeout: 5000 });
    expect(commentPosts()).toEqual([]);
  });

  it("an empty list offers signing in to write the first one, straight to the sign-in", async () => {
    show([]);
    const offer = await screen.findByRole("button", { name: "Sign in to write the first one" });
    expect(offer.closest("p")).toHaveTextContent("No comments yet. Sign in to write the first one");
    fireEvent.click(offer);
    const sheet = await screen.findByRole("dialog", { name: "Sign in to comment" }, { timeout: 5000 });
    expect(screen.queryByRole("dialog", { name: "Comment on this post" })).toBeNull();
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }, { timeout: 5000 }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Write a comment" })).toHaveFocus(), { timeout: 5000 });
    expect(screen.queryByRole("button", { name: "Sign in to write the first one" })).toBeNull();
  });

  it("shows no Delete on any comment", async () => {
    show([comment("c2", "Saturday works for me", ASHA)]);
    await screen.findByText("Saturday works for me");
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });

  it("says signing in lets them like, vote and comment, here or in the app", () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ThreadsView page={parseThreadsPage({ items: [post1], total: 1 })} />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(screen.getByText("News, photos and polls from clubs on MyOtherApp. Sign in to like, vote and comment, here or in the app.")).toBeInTheDocument();
  });
});

describe("comments in the server's HTML", () => {
  it("are in the HTML, and hydrate without a mismatch though their times have moved on; signed in, the box comes after", async () => {
    enableSignIn();
    const now = Date.now();
    const comments = [comment("c1", "Friday please", ROHAN, new Date(now - 30 * 1000).toISOString()), comment("c2", "Mine", ASHA, new Date(now - 90 * 1000).toISOString())];
    apiComments = comments;
    const { html, problems, container, unmount } = await hydrate(page(comments), {
      inBrowser: () => {
        // Ten minutes on: "just now" on the server is "10m ago" here.
        vi.spyOn(Date, "now").mockReturnValue(now + 10 * 60 * 1000);
        signInAs();
      },
    });
    expect(html).toContain("Friday please");
    expect(html).toContain("just now");
    expect(html).not.toContain("Write a comment");
    expect(problems.filter((p) => /hydrat|did not match|mismatch/i.test(p))).toEqual([]);
    await waitFor(() => expect(within(container).getByRole("textbox", { name: "Write a comment" })).toBeInTheDocument());
    expect(within(container).getAllByRole("button", { name: "Delete your comment" })).toHaveLength(1);
    unmount();
  });
});
