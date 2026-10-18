import { Link } from "@/lib/router";
import { plural } from "@/utils/format";
import { topicPagePath } from "@/seo/urls";

/*
 * The small pieces of a topic, for any page (an event's, a club's, the
 * topics' own): its colour, its counts in words, its mark and chips that
 * link to its page. Nothing here reacts, and nothing pulls in the find
 * pages' islands, so the event and club pages stay as light as they were.
 * A topic's colour is the API's, checked to be a hex colour (@/api/parse).
 */

/** The style that carries a topic's colour (as --tp), or nothing. */
export const topicTone = (topic) => (topic?.color ? { "--tp": topic.color } : undefined);

/** "12 upcoming events · 30 clubs"; null when the API didn't count (an older one). */
export function topicCounts(topic) {
  const parts = [
    topic.upcoming_events !== null && topic.upcoming_events !== undefined ? plural(topic.upcoming_events, "upcoming event") : null,
    topic.clubs !== null && topic.clubs !== undefined ? plural(topic.clubs, "club") : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** A topic's mark: its emoji, else its first letter, on a wash of its colour. */
export function TopicMark({ topic, size = 48 }) {
  return (
    <span className="tp-mark" style={{ width: size, height: size, fontSize: Math.round(size * 0.48) }} aria-hidden="true">
      {topic.icon || topic.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * An event's or a club's topics as chips, each a link to the topic's page;
 * nothing when it has none (an older API sends none).
 */
export function TopicChips({ topics, className = "tp-chips" }) {
  if (!topics?.length) return null;
  return (
    <ul className={className} aria-label="Topics">
      {topics.map((t) => (
        <li key={t.slug}>
          <Link className="tp-chip" to={topicPagePath(t)} style={topicTone(t)}>
            <span className="tp-chip-dot" aria-hidden="true" />
            {t.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
