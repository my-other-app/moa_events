import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PAGE_SIZE, discoverApi } from "@/api/discover";
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
          <p className="dc-section-sub">News, photos and polls from clubs on MyOtherApp. Like, vote and comment in the app.</p>
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

/** One post, read-only: the post, its counts and its comments. Acting on it opens the app prompt. */
export function ThreadPage() {
  const { id } = useParams();
  const [state, setState] = useState({ status: "loading", thread: null });
  const [comments, setComments] = useState({ status: "loading", items: [] });
  const [attempt, setAttempt] = useState(0);
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", thread: null });
    setComments({ status: "loading", items: [] });
    discoverApi.thread(id).then(
      (thread) => alive && setState({ status: "ready", thread }),
      (e) => alive && setState({ status: e?.notFound ? "missing" : "error", thread: null })
    );
    discoverApi.comments(id).then(
      (items) => alive && setComments({ status: "ready", items }),
      () => alive && setComments({ status: "error", items: [] })
    );
    return () => {
      alive = false;
    };
  }, [id, attempt]);

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
        <ThreadCard thread={t} full onAction={(kind) => setPrompt(kind)} headingLevel={2} />
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
            <button type="button" className="dc-btn dc-btn--ghost" onClick={() => setPrompt("comment")}>
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
      <AppPrompt open={Boolean(prompt)} onClose={() => setPrompt(null)} title="Do this in the app" message={PROMPTS[prompt] || PROMPTS.like} />
    </SitePage>
  );
}
