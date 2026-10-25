import { Link } from "@/lib/router";
import { EmptyState } from "./bits";
import { MoreResults } from "./finderislands";
import { ThreadCard } from "./threadcard";
import { ThreadActions, ThreadComments, ThreadNote, ThreadPoll, ThreadReader, ThreadsLede } from "./threadislands";
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
 * commenting are islands (threadislands.jsx): a signed-in reader likes,
 * votes and comments right here. The post's one Like and one Comment carry
 * the counts. The comments are in the page's HTML; once in the browser,
 * <ThreadComments> holds them, with the reader's own added or deleted.
 *   thread     parseThread's result, images stable
 *   comments   parseComment's results, oldest first; null when they couldn't be read
 */
export function ThreadView({ thread, comments }) {
  const t = thread;
  const count = comments ? Math.max(comments.length, 0) : t.comments;
  return (
    <ThreadReader thread={{ id: t.id, likes: t.likes, comments: count, poll: t.poll }} comments={comments}>
      <div className="dc-wrap dc-wrap--narrow">
        <Link className="dc-back" to="/threads">
          <Icon name="arrowLeft" size={16} /> All posts
        </Link>
        <h1 className="dc-sr">Post from {t.club.name}</h1>
        <ThreadCard thread={t} full headingLevel={2} poll={t.poll ? <ThreadPoll /> : null} actions={<ThreadActions />} />
        <ThreadNote />
        <ThreadComments clubLogo={t.club.logo} />
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
