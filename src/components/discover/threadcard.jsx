import { Link } from "@/lib/router";
import { imageUrl, plural, timeAgo } from "@/utils/format";
import { Avatar, Img } from "./bits";
import Icon from "./icons";

/** A poll's results as share bars; with `onVote(option)`, each option is a button. */
function Poll({ poll, onVote }) {
  const lead = Math.max(0, ...poll.options.map((o) => o.share));
  return (
    <div className="dc-poll">
      {poll.options.map((o) => {
        const cls = `dc-poll-option${lead > 0 && o.share === lead ? " is-lead" : ""}`;
        const mine = poll.voted_option_id !== null && poll.voted_option_id === o.id;
        const inner = (
          <>
            <span className="dc-poll-bar" style={{ width: `${o.share}%` }} aria-hidden="true" />
            <span>
              {o.label}
              {mine ? " · your vote" : ""}
            </span>
            <span className="dc-poll-pct">{o.share}%</span>
          </>
        );
        return onVote ? (
          <button
            key={o.id}
            type="button"
            className={cls}
            onClick={() => onVote(o)}
            aria-pressed={mine}
            aria-label={mine ? `${o.label}: your vote (${o.share}%)` : `Vote for ${o.label} (${o.share}% so far)`}
          >
            {inner}
          </button>
        ) : (
          <div key={o.id} className={cls}>
            {inner}
          </div>
        );
      })}
      <p className="dc-poll-total">{plural(poll.votes, "vote")}</p>
    </div>
  );
}

/**
 * A club's post. In a list it is a card that opens the post; on the post's
 * own page (`full`) it shows everything and its buttons call
 * `onAction(kind, optionId)` ("like" | "vote" | "comment"): the page likes
 * and votes for a signed-in reader, and otherwise says "do this in the app".
 */
export function ThreadCard({ thread, full = false, onAction, headingLevel = 3 }) {
  const t = thread;
  const club = t.club;
  const ago = timeAgo(t.created_at);
  const href = `/threads/${encodeURIComponent(t.id)}`;
  const image = imageUrl(t.image, full ? "original" : "medium");
  const Heading = `h${headingLevel}`;
  return (
    <article className={`dc-tcard ${full ? "dc-tcard--full" : "dc-tcard--clamp"}`}>
      <header className="dc-tcard-head">
        <Avatar name={club.name} src={club.logo} size={40} />
        <div className="dc-tcard-who">
          <Heading className="dc-tcard-club">
            {club.slug ? <Link to={`/clubs/${encodeURIComponent(club.slug)}`}>{club.name}</Link> : club.name}
          </Heading>
          {full ? (
            <time className="dc-tcard-time" dateTime={t.created_at || undefined}>
              {ago}
            </time>
          ) : (
            <Link className="dc-tcard-time dc-tcard-link" to={href}>
              <time dateTime={t.created_at || undefined}>{ago || "Open"}</time>
              <span className="dc-sr"> — open this post from {club.name}</span>
            </Link>
          )}
        </div>
        {t.pinned ? <span className="dc-tcard-pinned">Pinned</span> : null}
      </header>
      {t.body ? <p className="dc-tcard-body">{t.body}</p> : null}
      {image ? (
        <div className="dc-tcard-image">
          <Img src={image} alt={`Picture posted by ${club.name}`} />
        </div>
      ) : null}
      {t.poll ? <Poll poll={t.poll} onVote={onAction ? (o) => onAction("vote", o.id) : null} /> : null}
      <div className="dc-tcard-foot">
        <span className="dc-tcard-stat">
          <Icon name="heart" size={16} /> {plural(t.likes, "like")}
        </span>
        <span className="dc-tcard-stat">
          <Icon name="comment" size={16} /> {plural(t.comments, "comment")}
        </span>
      </div>
      {onAction ? (
        <div className="dc-tcard-actions">
          <button type="button" className="dc-tcard-action" aria-pressed={t.liked} onClick={() => onAction("like")}>
            <Icon name="heart" size={16} /> {t.liked ? "Liked" : "Like"}
          </button>
          <button type="button" className="dc-tcard-action" onClick={() => onAction("comment")}>
            <Icon name="comment" size={16} /> Comment
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function ThreadCardSkeleton() {
  return (
    <div className="dc-tcard" aria-hidden="true">
      <div className="dc-tcard-head">
        <span className="dc-skel" style={{ width: 40, height: 40, borderRadius: 999 }} />
        <div style={{ flex: 1 }}>
          <div className="dc-skel" style={{ width: "50%", height: 14 }} />
          <div className="dc-skel dc-skel-line" style={{ width: "25%", height: 10 }} />
        </div>
      </div>
      <div className="dc-skel dc-skel-line" />
      <div className="dc-skel dc-skel-line" style={{ width: "85%" }} />
      <div className="dc-skel dc-skel-line" style={{ width: "60%" }} />
    </div>
  );
}
