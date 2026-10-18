import { Link } from "@/lib/router";
import { timeAgo } from "@/utils/format";
import { Avatar, EmptyState } from "./bits";
import { MoreResults } from "./finderislands";
import { ThreadCard } from "./threadcard";
import { CommentButton, ThreadActions, ThreadLikes, ThreadNote, ThreadPoll, ThreadReader, ThreadsLede } from "./threadislands";
import Icon from "./icons";

/**
 * The clubs' latest posts, newest first: the first page rendered on the
 * server (src/app/threads/page.jsx), later ones added in the browser.
 *   page   parseThreadsPage's result, images stable
 */
export function ThreadsView({ page }) {
  return (
    <div className="dc-wrap dc-wrap--narrow">
      <header className="dc-findhead">
        <h1>From the clubs</h1>
        <ThreadsLede />
      </header>
      {page.items.length ? (
        <MoreResults kind="threads" ids={page.items.map((t) => t.id)} total={page.total} capped={page.capped} first={{ cursored: page.cursored, cursor: page.cursor }} noun="posts" className="dc-threads">
          {page.items.map((t) => (
            <ThreadCard key={t.id} thread={t} headingLevel={2} />
          ))}
        </MoreResults>
      ) : (
        <EmptyState title="No posts yet" message="When clubs post news, photos and polls, they show up here.">
          <Link className="dc-btn" to="/clubs">
            Browse clubs
          </Link>
        </EmptyState>
      )}
    </div>
  );
}

/**
 * One post: the post, its counts and its comments, rendered on the server
 * (src/app/threads/[id]/page.jsx) as nobody reads it. Liking, voting and
 * "Add a comment" are islands (threadislands.jsx): a signed-in reader likes
 * and votes right here.
 *   thread     parseThread's result, images stable
 *   comments   parseComment's results, oldest first; null when they couldn't be read
 */
export function ThreadView({ thread, comments }) {
  const t = thread;
  const count = comments ? Math.max(comments.length, 0) : t.comments;
  return (
    <ThreadReader thread={{ id: t.id, likes: t.likes, poll: t.poll }}>
      <div className="dc-wrap dc-wrap--narrow">
        <Link className="dc-back" to="/threads">
          <Icon name="arrowLeft" size={16} /> All posts
        </Link>
        <h1 className="dc-sr">Post from {t.club.name}</h1>
        <ThreadCard thread={t} full headingLevel={2} poll={t.poll ? <ThreadPoll /> : null} likes={<ThreadLikes />} actions={<ThreadActions />} />
        <ThreadNote />
        <section className="dc-comments" aria-labelledby="dc-comments-title">
          <h2 id="dc-comments-title">Comments{count ? ` (${count})` : ""}</h2>
          {comments === null ? <p className="dc-section-sub">Comments couldn&rsquo;t load just now.</p> : null}
          {comments && !comments.length ? <p className="dc-section-sub">No comments yet. Be the first — in the app.</p> : null}
          {comments && comments.length ? (
            <ul>
              {comments.map((c) => (
                <li key={c.id} className="dc-comment">
                  <Avatar name={c.author.name} src={c.author.is_club ? t.club.logo : null} size={32} />
                  <div>
                    <p className="dc-comment-who">
                      {c.author.name}
                      {c.author.is_club ? <span className="dc-comment-club">Club</span> : null}
                      <small>
                        <time dateTime={c.created_at || undefined}>{timeAgo(c.created_at)}</time>
                      </small>
                    </p>
                    <p>{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="dc-more" style={{ alignItems: "flex-start" }}>
            <CommentButton />
          </div>
        </section>
      </div>
    </ThreadReader>
  );
}

/** The page for a post that is gone (or never was). */
export function ThreadMissing() {
  return (
    <div className="dc-wrap dc-wrap--narrow">
      <Link className="dc-back" to="/threads">
        <Icon name="arrowLeft" size={16} /> All posts
      </Link>
      <EmptyState as="h1" title="This post is gone" message="It may have been removed by the club, or the link is incomplete.">
        <Link className="dc-btn" to="/threads">
          See the latest posts
        </Link>
      </EmptyState>
    </div>
  );
}
