"use client";

/**
 * A post's page's client islands. The post and its comments are rendered
 * on the server (threadspage.jsx), read as nobody: no one's like or vote.
 * <ThreadReader> reads the post again as the signed-in reader, once the
 * page is in the browser, and holds what they do: liking it and voting in
 * its poll (the button changes at once, and changes back if the server
 * says no), and commenting (a comment shows once the server has saved it,
 * never before; their own can be deleted). Everyone else gets the app
 * prompt, with signing in as the other way where the build has it — for
 * commenting, the first way: there is no iPhone app yet.
 *
 * The post has one Like and one Comment, each carrying its count
 * (<ThreadActions>): no separate row of counts, no second comment button.
 * Signed in, Comment goes to the box under the comments (<ThreadComments>).
 */
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { accountApi } from "@/api/account";
import { discoverApi } from "@/api/discover";
import { useAuth } from "@/auth/context";
import { APP_STORE_URL } from "@/config";
import { formatCount, plural, timeAgo } from "@/utils/format";
import { Avatar } from "./bits";
import { AppPrompt } from "./dialog";
import { Poll } from "./threadcard";
import Icon from "./icons";

const PROMPTS = {
  like: "Liking a post happens in the MyOtherApp app, where you follow the clubs you like. It's free.",
  vote: "Polls are answered in the MyOtherApp app — one vote per person, and you can change it there. It's free.",
  comment: "Sign in and write your comment right here. It's free, and it's the same account as the MyOtherApp app.",
};

/** A build without sign-in: the app is the only way to comment, and there is no iPhone app until its link is set. */
const COMMENT_IN_APP = APP_STORE_URL
  ? "For now, comments are written in the MyOtherApp app, where the club reads and replies. It's free."
  : "For now, comments are written in the MyOtherApp app for Android, where the club reads and replies. The iPhone app is on its way.";

const SIGN_IN_TO = { like: "Sign in to like it here", vote: "Sign in to vote here", comment: "Sign in to comment here" };

/** The API takes a comment of 1 to 500 characters, trimmed. */
export const COMMENT_MAX = 500;
/** The count shows once a comment is this long. */
const COUNT_FROM = 400;

const COMMENT_REFUSED = {
  429: "You're commenting too fast. Wait a minute and try again.",
  404: "This post has been removed, so it can't take comments.",
};
const commentFailed = (error) => COMMENT_REFUSED[error?.response?.status] || "Your comment didn't post. Try again.";

const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/**
 * The comments as read again for the signed-in reader, with what they did
 * on this page kept: a read that set out before they posted or deleted
 * doesn't undo it.
 */
function withOwn(fresh, own) {
  const list = fresh.filter((c) => !own.removed.has(String(c.id)));
  for (const c of own.added) if (!own.removed.has(String(c.id)) && !list.some((f) => sameId(f.id, c.id))) list.push(c);
  return { list, count: list.length, loaded: true };
}

const ReaderContext = createContext(null);
const useReader = () => useContext(ReaderContext);

/**
 * `thread`: {id, likes, comments, poll} as the server read it (`comments`
 * the count). `comments`: the comments the server read, oldest first, or
 * null when they couldn't be read.
 */
export function ThreadReader({ thread: initial, comments: initialComments = null, children }) {
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";
  // `taps`: the reader's own likes and unlikes here, so only those animate (styles/motion.css).
  const [t, setT] = useState({ liked: false, likes: initial.likes, poll: initial.poll, readAs: false, taps: 0 });
  // The comments as this page has them: the server's (or, signed in, read again), with the reader's own added and taken away since.
  const [talk, setTalk] = useState(() => ({ list: initialComments || [], count: initial.comments, loaded: initialComments !== null }));
  // The reader's own comments posted and deleted here, for withOwn().
  const own = useRef({ added: [], removed: new Set() });
  // What the reader is writing: kept here, so a sign-in that lapses mid-comment doesn't lose it.
  const [draft, setDraft] = useState("");
  // Bumped to take the reader to the comment box once it is there (after signing in, the closing sheet gives focus back first).
  const [toBox, setToBox] = useState(0);
  const [prompt, setPrompt] = useState(null);
  const [note, setNote] = useState(null);
  const busy = useRef(false);
  const pending = useRef(null);
  const box = useRef(null);
  const id = initial.id;

  // Read again on signing in or out: whether this reader liked it, and how they voted.
  // Signed in, the comments too: the page's HTML is up to a minute or so old, and the
  // reader's own comment from a moment ago (or a reply to it) belongs on it.
  useEffect(() => {
    if (!signedIn) {
      setT((x) => (x.readAs ? { liked: false, likes: x.likes, poll: x.poll ? { ...x.poll, voted_option_id: null } : x.poll, readAs: false, taps: x.taps } : x));
      return undefined;
    }
    let alive = true;
    discoverApi.thread(id).then(
      (fresh) => alive && setT((x) => ({ liked: fresh.liked, likes: fresh.likes, poll: fresh.poll, readAs: true, taps: x.taps })),
      () => {
        /* the page as the server read it stands */
      }
    );
    discoverApi.readerComments(id).then(
      (fresh) => alive && setTalk(() => withOwn(fresh, own.current)),
      () => {
        /* the comments as the server read them stand */
      }
    );
    return () => {
      alive = false;
    };
  }, [id, signedIn]);

  const like = useCallback(
    async (now) => {
      if (busy.current) return;
      busy.current = true;
      setNote(null);
      setT((x) => ({ ...x, liked: !now.liked, likes: Math.max(0, now.likes + (now.liked ? -1 : 1)), taps: x.taps + 1 }));
      try {
        const r = await accountApi.toggleLike(id);
        setT((x) => ({ ...x, liked: r.liked, likes: r.likes }));
      } catch {
        setT((x) => ({ ...x, liked: now.liked, likes: now.likes }));
        setNote("Your like didn't save. Try again.");
      } finally {
        busy.current = false;
      }
    },
    [id]
  );

  const vote = useCallback(
    async (now, optionId) => {
      if (busy.current || !now.poll || String(now.poll.voted_option_id) === String(optionId)) return;
      busy.current = true;
      setNote(null);
      setT((x) => ({ ...x, poll: { ...x.poll, voted_option_id: optionId } }));
      try {
        const poll = await accountApi.vote(id, optionId);
        setT((x) => ({ ...x, poll: poll || x.poll }));
      } catch {
        setT((x) => ({ ...x, poll: now.poll }));
        setNote("Your vote didn't count. Try again.");
      } finally {
        busy.current = false;
      }
    },
    [id]
  );

  /** Saves a comment; it joins the list once the server has it. Rejects with the API's error. */
  const postComment = useCallback(
    async (body) => {
      const comment = await accountApi.addComment(id, body);
      own.current.added.push(comment);
      setTalk((x) => (x.list.some((c) => sameId(c.id, comment.id)) ? x : { ...x, list: [...x.list, comment], count: x.count + 1 }));
      return comment;
    },
    [id]
  );

  /** Deletes one of the reader's own comments. One already gone (404) goes from the page too. */
  const removeComment = useCallback(
    async (commentId) => {
      try {
        await accountApi.deleteComment(id, commentId);
      } catch (error) {
        if (error?.response?.status !== 404) throw error;
      }
      own.current.removed.add(String(commentId));
      setTalk((x) =>
        x.list.some((c) => sameId(c.id, commentId)) ? { ...x, list: x.list.filter((c) => !sameId(c.id, commentId)), count: Math.max(0, x.count - 1) } : x
      );
    },
    [id]
  );

  // To the comment box, after anything that had focus (a sheet closing gives it back) has had it.
  useEffect(() => {
    const el = box.current;
    if (!toBox || !el) return;
    el.scrollIntoView?.({ block: "center" });
    el.focus({ preventScroll: true });
  }, [toBox]);

  // A like or vote asked for before signing in, done once the post has been read as the new reader.
  useEffect(() => {
    const want = pending.current;
    // Only on the post as read for the signed-in reader: before that, `liked` says nothing about them.
    if (!signedIn || !want || !t.readAs) return;
    pending.current = null;
    if (want.kind === "like" && !t.liked) like(t);
    if (want.kind === "vote") vote(t, want.optionId);
  }, [signedIn, t, like, vote]);

  const act = (kind, optionId) => {
    if (!signedIn) {
      setPrompt({ kind, optionId });
      return;
    }
    if (kind === "comment") setToBox((n) => n + 1);
    else if (kind === "like") like(t);
    else if (kind === "vote") vote(t, optionId);
  };

  const signInFor = (want) => {
    setPrompt(null);
    auth.openSignIn({
      reason: want.kind,
      onDone: () => {
        // Signed in, the comment box is on the page: straight to it.
        if (want.kind === "comment") setToBox((n) => n + 1);
        else pending.current = want;
      },
    });
  };

  const kind = prompt?.kind;
  const commenting = kind === "comment";
  const reader = {
    t,
    act,
    note,
    talk,
    loaded: talk.loaded,
    signedIn,
    // The reader's own comments, by the account's id: those they can delete.
    isMine: (c) => signedIn && !c.author.is_club && sameId(c.author.id, auth.user?.id),
    // Signing in is offered once the browser knows nobody is (the server and the first paint can't).
    offerSignIn: auth.enabled && auth.ready && !signedIn,
    signInToComment: () => signInFor({ kind: "comment" }),
    draft,
    setDraft,
    postComment,
    removeComment,
    box,
  };

  return (
    <ReaderContext.Provider value={reader}>
      {children}
      <AppPrompt
        open={Boolean(prompt)}
        onClose={() => setPrompt(null)}
        title={commenting && auth.enabled ? "Comment on this post" : "Do this in the app"}
        message={commenting ? (auth.enabled ? PROMPTS.comment : COMMENT_IN_APP) : PROMPTS[kind] || PROMPTS.like}
        altFirst={commenting}
        alt={
          auth.enabled && !signedIn && SIGN_IN_TO[kind] ? (
            <button type="button" className={commenting ? "dc-btn" : "dc-btn dc-btn--ghost"} onClick={() => signInFor(prompt)}>
              {SIGN_IN_TO[kind]}
            </button>
          ) : null
        }
      />
    </ReaderContext.Provider>
  );
}

/** The poll, each option a button to vote with. */
export function ThreadPoll() {
  const { t, act } = useReader();
  return t.poll ? <Poll poll={t.poll} onVote={(o) => act("vote", o.id)} /> : null;
}

/**
 * A button's count: the number to see (none at 0), the words to hear:
 * "Like (12 likes)". `bump` changes when the reader's own tap moved it: the
 * number rolls in again.
 */
function Count({ n, one, bump = 0 }) {
  return (
    <>
      {n > 0 ? (
        <span key={bump} className={`dc-tcard-count${bump ? " is-bumped" : ""}`} aria-hidden="true">
          {formatCount(n)}
        </span>
      ) : null}
      {" "}
      <span className="dc-sr">{`(${plural(n, one)})`}</span>
    </>
  );
}

/**
 * Like and Comment, under the post: the post's only like and comment
 * controls, each with its count (the likes move with the reader's own like,
 * the comments with their own comments).
 */
export function ThreadActions() {
  const { t, act, talk } = useReader();
  return (
    <div className="dc-tcard-actions">
      {/* data-pop: liked by this tap, so the heart pops (styles/motion.css). */}
      <button type="button" className="dc-tcard-action dc-like" aria-pressed={t.liked} data-pop={t.liked && t.taps ? "" : undefined} onClick={() => act("like")}>
        <Icon name="heart" size={18} /> {t.liked ? "Liked" : "Like"}
        <Count n={t.likes} one="like" bump={t.taps} />
      </button>
      <button type="button" className="dc-tcard-action" onClick={() => act("comment")}>
        <Icon name="comment" size={18} /> Comment
        <Count n={talk.count} one="comment" />
      </button>
    </div>
  );
}

/** What went wrong with a like or a vote, under the post. */
export function ThreadNote() {
  const { note } = useReader();
  return note ? (
    <p className="ac-thread-note" role="status">
      {note}
    </p>
  ) : null;
}

/**
 * The comments under the post, rendered with the page (so they are in its
 * HTML), then held here: read again for a signed-in reader, the reader's
 * own joining the end once the server has saved them and leaving when they
 * delete them. Under them, the box to write in, for a signed-in reader;
 * signed out, an empty list offers signing in to write the first one.
 *   clubLogo   beside the club's own replies
 */
export function ThreadComments({ clubLogo = null }) {
  const { talk, loaded, signedIn, isMine, offerSignIn, signInToComment, removeComment } = useReader();
  const heading = useRef(null);
  const [deleting, setDeleting] = useState(null);
  const [trouble, setTrouble] = useState(null);
  // Said to screen readers: a comment posted or deleted.
  const [said, setSaid] = useState("");

  const remove = async (c) => {
    if (deleting) return;
    if (!window.confirm("Delete your comment? This can't be undone.")) return;
    setDeleting(c.id);
    setTrouble(null);
    try {
      await removeComment(c.id);
      setSaid("Your comment is deleted.");
      // Its Delete button is gone: focus stays with the comments.
      heading.current?.focus({ preventScroll: true });
    } catch {
      setTrouble("Your comment wasn't deleted. Try again.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="dc-comments" aria-labelledby="dc-comments-title">
      <h2 id="dc-comments-title" ref={heading} tabIndex={-1}>
        Comments{talk.count ? ` (${talk.count})` : ""}
      </h2>
      {!loaded ? <p className="dc-section-sub">Comments couldn&rsquo;t load just now.</p> : null}
      {loaded && !talk.list.length ? (
        <p className="dc-section-sub">
          No comments yet.
          {offerSignIn ? (
            <>
              {" "}
              <button type="button" className="ac-linkbtn" onClick={signInToComment}>
                Sign in to write the first one
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {talk.list.length ? (
        <ul>
          {talk.list.map((c) => (
            <li key={c.id} className="dc-comment">
              <Avatar name={c.author.name} src={c.author.is_club ? clubLogo : null} size={32} />
              <div className="dc-comment-main">
                <p className="dc-comment-who">
                  {c.author.name}
                  {c.author.is_club ? <span className="dc-comment-club">Club</span> : null}
                  <small>
                    {/* "5m ago" moves on between the server's render and the browser's: the server's words stand. */}
                    <time dateTime={c.created_at || undefined} suppressHydrationWarning>
                      {timeAgo(c.created_at)}
                    </time>
                  </small>
                </p>
                <p>{c.body}</p>
              </div>
              {isMine(c) ? (
                <button type="button" className="ac-comment-delete" aria-label="Delete your comment" disabled={deleting === c.id} onClick={() => remove(c)}>
                  {deleting === c.id ? "Deleting…" : "Delete"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {trouble ? (
        <p className="ac-thread-note" role="alert">
          {trouble}
        </p>
      ) : null}
      {signedIn ? <CommentBox onPosted={() => setSaid("Your comment is posted.")} /> : null}
      <p className="dc-sr" role="status">
        {said}
      </p>
    </section>
  );
}

/**
 * The box a signed-in reader writes a comment in. Post (or Ctrl/⌘+Enter)
 * sends it; it shows in the list once the server has it, and the box
 * empties. If it doesn't post, the words stay, with a note saying why.
 */
function CommentBox({ onPosted }) {
  const { talk, draft, setDraft, postComment, box } = useReader();
  const id = useId();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);
  const words = draft.trim();
  const near = draft.length >= COUNT_FROM;

  const send = async () => {
    if (!words || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      await postComment(words);
      setDraft("");
      onPosted();
    } catch (e) {
      setError(commentFailed(e));
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <form
      className="ac-composer"
      aria-busy={sending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label className="dc-sr" htmlFor={`${id}-text`}>
        Write a comment
      </label>
      <textarea
        id={`${id}-text`}
        ref={box}
        className="ac-composer-text"
        rows={3}
        maxLength={COMMENT_MAX}
        placeholder={talk.list.length ? "Write a comment…" : "Write the first comment…"}
        value={draft}
        readOnly={sending}
        aria-describedby={near ? `${id}-count` : undefined}
        onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="ac-composer-foot">
        {near ? (
          <span id={`${id}-count`} className={`ac-composer-count${draft.length >= COMMENT_MAX ? " is-full" : ""}`}>
            <span aria-hidden="true">{`${draft.length}/${COMMENT_MAX}`}</span>
            <span className="dc-sr">{`${plural(COMMENT_MAX - draft.length, "character")} left`}</span>
          </span>
        ) : null}
        <button type="submit" className="dc-btn dc-btn--sm" disabled={!words || sending}>
          {sending ? "Posting…" : "Post"}
        </button>
      </div>
      {error ? (
        <p className="ac-thread-note" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** The line under "From the clubs": what a reader can do here, signed in or not. */
export function ThreadsLede() {
  const auth = useAuth();
  let how;
  if (auth.status === "signed-in") how = "Open a post to like it, vote or comment.";
  else if (auth.enabled) how = "Sign in to like, vote and comment, here or in the app.";
  // A build without sign-in: the app is the only way.
  else how = "Like, vote and comment in the MyOtherApp app.";
  return <p className="dc-section-sub">{`News, photos and polls from clubs on MyOtherApp. ${how}`}</p>;
}
