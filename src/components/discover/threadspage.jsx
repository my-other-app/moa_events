import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@/lib/router";
import { accountApi } from "@/api/account";
import { PAGE_SIZE, discoverApi } from "@/api/discover";
import { useAuth } from "@/auth/context";
import { usePageMeta } from "@/utils/meta";
import { usePagedList } from "@/utils/paged";
import { timeAgo } from "@/utils/format";
import { SitePage } from "./chrome";
import { AppPrompt, Avatar, EmptyState, ErrorState } from "./bits";
import { ThreadCard, ThreadCardSkeleton } from "./threadcard";
import { LoadMore } from "./finder";
import Icon from "./icons";

/** The clubs' latest posts, newest first. */
export function ThreadsPage() {
  const auth = useAuth();
  const list = usePagedList((offset) => discoverApi.threads({ offset, limit: PAGE_SIZE }), "threads");
  usePageMeta("Threads from the clubs · MyOtherApp", "The latest posts and polls from clubs on MyOtherApp.");

  let body;
  if (list.status === "loading") {
    body = (
      <div className="dc-threads" role="status" aria-label="Loading posts">
        {[0, 1, 2].map((i) => (
          <ThreadCardSkeleton key={i} />
        ))}
      </div>
    );
  } else if (list.status === "error") {
    body = <ErrorState message="We couldn't load the posts right now. Check your connection and try again." onRetry={list.retry} />;
  } else if (!list.items.length) {
    body = (
      <EmptyState title="No posts yet" message="When clubs post news, photos and polls, they show up here.">
        <Link className="dc-btn" to="/clubs">
          Browse clubs
        </Link>
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div className="dc-threads">
          {list.items.map((t) => (
            <ThreadCard key={t.id} thread={t} headingLevel={2} />
          ))}
        </div>
        <LoadMore shown={list.items.length} total={list.total} busy={list.more.busy} error={list.more.error} onMore={list.loadMore} noun="posts" />
      </>
    );
  }

  return (
    <SitePage>
      <div className="dc-wrap dc-wrap--narrow">
        <header className="dc-findhead">
          <h1>From the clubs</h1>
          <p className="dc-section-sub">
            {auth.status === "signed-in"
              ? "News, photos and polls from clubs on MyOtherApp. Open a post to like it or vote."
              : "News, photos and polls from clubs on MyOtherApp. Like, vote and comment in the app."}
          </p>
        </header>
        {body}
      </div>
    </SitePage>
  );
}

const PROMPTS = {
  like: "Liking a post happens in the MyOtherApp app, where you follow the clubs you like. It's free.",
  vote: "Polls are answered in the MyOtherApp app — one vote per person, and you can change it there. It's free.",
  comment: "Comments are written in the MyOtherApp app, where the club reads and replies. It's free.",
};

const SIGN_IN_TO = { like: "Sign in to like it here", vote: "Sign in to vote here" };

/**
 * One post: the post, its counts and its comments. A signed-in reader likes
 * it and votes in its poll right here (the button changes at once, and
 * changes back if the server says no); everyone else, and commenting, gets
 * the app prompt — with signing in as the other way, where the build has it.
 */
export function ThreadPage() {
  const { id } = useParams();
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";
  const [state, setState] = useState({ status: "loading", thread: null });
  const [comments, setComments] = useState({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [prompt, setPrompt] = useState(null);
  const [note, setNote] = useState(null);
  const busy = useRef(false);
  const pending = useRef(null);

  // Read again on signing in or out: whether this reader liked it, and how they voted.
  useEffect(() => {
    let alive = true;
    setState((s) => (s.thread && String(s.thread.id) === String(id) ? s : { status: "loading", thread: null }));
    discoverApi.thread(id).then(
      (thread) => alive && setState({ status: "ready", thread, readAs: signedIn }),
      (e) => alive && setState((s) => (s.thread && String(s.thread.id) === String(id) && !e?.notFound ? s : { status: e?.notFound ? "missing" : "error", thread: null }))
    );
    return () => {
      alive = false;
    };
  }, [id, attempt, signedIn]);

  useEffect(() => {
    let alive = true;
    setComments({ status: "loading", items: [] });
    discoverApi.comments(id).then(
      (items) => alive && setComments({ status: "ready", items }),
      () => alive && setComments({ status: "error", items: [] })
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);

  const like = async (thread) => {
    if (busy.current) return;
    busy.current = true;
    setNote(null);
    setState((s) => ({ ...s, thread: { ...s.thread, liked: !thread.liked, likes: Math.max(0, thread.likes + (thread.liked ? -1 : 1)) } }));
    try {
      const r = await accountApi.toggleLike(thread.id);
      setState((s) => ({ ...s, thread: { ...s.thread, liked: r.liked, likes: r.likes } }));
    } catch {
      setState((s) => ({ ...s, thread: { ...s.thread, liked: thread.liked, likes: thread.likes } }));
      setNote("Your like didn't save. Try again.");
    } finally {
      busy.current = false;
    }
  };

  const vote = async (thread, optionId) => {
    if (busy.current || !thread.poll || String(thread.poll.voted_option_id) === String(optionId)) return;
    busy.current = true;
    setNote(null);
    setState((s) => ({ ...s, thread: { ...s.thread, poll: { ...s.thread.poll, voted_option_id: optionId } } }));
    try {
      const poll = await accountApi.vote(thread.id, optionId);
      setState((s) => ({ ...s, thread: { ...s.thread, poll: poll || s.thread.poll } }));
    } catch {
      setState((s) => ({ ...s, thread: { ...s.thread, poll: thread.poll } }));
      setNote("Your vote didn't count. Try again.");
    } finally {
      busy.current = false;
    }
  };

  // A like or vote asked for before signing in, done once the post has been read as the new reader.
  useEffect(() => {
    const t = state.thread;
    const want = pending.current;
    // Only on the post as read for the signed-in reader: before that, `liked` says nothing about them.
    if (!signedIn || !want || !t || state.status !== "ready" || !state.readAs) return;
    pending.current = null;
    if (want.kind === "like" && !t.liked) like(t);
    if (want.kind === "vote") vote(t, want.optionId);
  }, [signedIn, state]);

  const act = (kind, optionId) => {
    const t = state.thread;
    if (!t) return;
    if (kind === "comment" || !signedIn) {
      setPrompt({ kind, optionId });
      return;
    }
    if (kind === "like") like(t);
    else if (kind === "vote") vote(t, optionId);
  };

  const signInFor = (want) => {
    setPrompt(null);
    auth.openSignIn({
      reason: want.kind,
      onDone: () => {
        pending.current = want;
      },
    });
  };

  const t = state.thread;
  usePageMeta(
    t ? `${t.club.name} on MyOtherApp${t.body ? `: “${t.body.slice(0, 60)}${t.body.length > 60 ? "…" : ""}”` : ""}` : state.status === "missing" ? "Post not found · MyOtherApp" : null,
    t ? t.body.slice(0, 155) || `A post from ${t.club.name} on MyOtherApp.` : null
  );

  let body;
  if (state.status === "loading") {
    body = <ThreadCardSkeleton />;
  } else if (state.status === "missing") {
    body = (
      <EmptyState as="h1" title="This post is gone" message="It may have been removed by the club, or the link is incomplete.">
        <Link className="dc-btn" to="/threads">
          See the latest posts
        </Link>
      </EmptyState>
    );
  } else if (state.status === "error") {
    body = <ErrorState message="We couldn't load this post right now. Check your connection and try again." onRetry={() => setAttempt((a) => a + 1)} />;
  } else {
    const count = comments.status === "ready" ? comments.items.length : t.comments;
    body = (
      <>
        <h1 className="dc-sr">Post from {t.club.name}</h1>
        <ThreadCard thread={t} full onAction={act} headingLevel={2} />
        {note ? (
          <p className="ac-thread-note" role="status">
            {note}
          </p>
        ) : null}
        <section className="dc-comments" aria-labelledby="dc-comments-title">
          <h2 id="dc-comments-title">Comments{count ? ` (${count})` : ""}</h2>
          {comments.status === "loading" ? <p className="dc-section-sub">Loading comments…</p> : null}
          {comments.status === "error" ? <p className="dc-section-sub">Comments couldn't load just now.</p> : null}
          {comments.status === "ready" && !comments.items.length ? <p className="dc-section-sub">No comments yet. Be the first — in the app.</p> : null}
          {comments.items.length ? (
            <ul>
              {comments.items.map((c) => (
                <li key={c.id} className="dc-comment">
                  <Avatar name={c.author.name} src={c.author.is_club ? t.club.logo : null} size={32} />
                  <div>
                    <p className="dc-comment-who">
                      {c.author.name}
                      {c.author.is_club ? <span className="dc-comment-club">Club</span> : null}
                      <small>{timeAgo(c.created_at)}</small>
                    </p>
                    <p>{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="dc-more" style={{ alignItems: "flex-start" }}>
            <button type="button" className="dc-btn dc-btn--ghost" onClick={() => setPrompt({ kind: "comment" })}>
              <Icon name="comment" size={16} /> Add a comment
            </button>
          </div>
        </section>
      </>
    );
  }

  return (
    <SitePage>
      <div className="dc-wrap dc-wrap--narrow">
        <Link className="dc-back" to="/threads">
          <Icon name="arrowLeft" size={16} /> All posts
        </Link>
        {body}
      </div>
      <AppPrompt
        open={Boolean(prompt)}
        onClose={() => setPrompt(null)}
        title="Do this in the app"
        message={PROMPTS[prompt?.kind] || PROMPTS.like}
        alt={
          auth.enabled && !signedIn && SIGN_IN_TO[prompt?.kind] ? (
            <button type="button" className="dc-btn dc-btn--ghost" onClick={() => signInFor(prompt)}>
              {SIGN_IN_TO[prompt.kind]}
            </button>
          ) : null
        }
      />
    </SitePage>
  );
}
