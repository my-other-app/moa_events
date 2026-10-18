import { Link } from "@/lib/router";
import { formatCount, formatTotal } from "@/utils/format";
import { feeds, topicPagePath } from "@/seo/urls";
import { EmptyState, Section } from "./bits";
import { ClubCard } from "./clubcard";
import { EventCard } from "./eventcard";
import { FilterLink, Finder, MoreResults, Results } from "./finderislands";
import Icon from "./icons";
import { TopicChips, TopicMark, topicCounts, topicTone } from "./topicbits";

/*
 * Topics: the main categories (Development, Deep Tech, Arts, ...), each a
 * page of its upcoming events and its clubs, filtered by its interests.
 * Everything here renders on the server; the interest chips, the dimming
 * while a new list comes and "Load more" are the find pages' islands
 * (finderislands.jsx). A topic's colour is the API's, checked to be a hex
 * colour before it gets here (@/api/parse), and set as --tp.
 */

const MAX_INTERESTS_ON_CARD = 4;

/** One topic on /topics: the whole card opens its page. */
function TopicCard({ topic }) {
  const counts = topicCounts(topic);
  const shown = topic.interests.slice(0, MAX_INTERESTS_ON_CARD).map((i) => i.name);
  const more = topic.interests.length - shown.length;
  return (
    <Link className="tp-card" to={topicPagePath(topic)} style={topicTone(topic)}>
      <TopicMark topic={topic} />
      <div className="tp-card-body">
        <h2 className="tp-card-name">{topic.name}</h2>
        {topic.description ? <span className="tp-card-text">{topic.description}</span> : null}
        {shown.length ? (
          <span className="tp-card-interests">
            {shown.join(" · ")}
            {more > 0 ? ` · +${more} more` : ""}
          </span>
        ) : null}
        {counts ? <span className="tp-card-counts">{counts}</span> : null}
      </div>
      <Icon name="arrowRight" size={18} className="tp-card-go" />
    </Link>
  );
}

/**
 * /topics: every topic as a card. `topics` are parseTopics' (in the API's
 * order); without counts (an API without /interests/topics) the cards just
 * leave them out.
 */
export function TopicsView({ topics }) {
  return (
    <div className="dc-wrap tp">
      <header className="dc-findhead tp-head">
        <h1>Topics</h1>
        <p className="tp-lede">Find events and clubs by what you&rsquo;re into: pick a topic, then narrow it down by interest.</p>
      </header>
      <ul className="tp-grid">
        {topics.map((t) => (
          <li key={t.slug}>
            <TopicCard topic={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Home › Topics › the topic, as people see it (the page's BreadcrumbList says the same). */
function Crumbs({ topic }) {
  return (
    <nav className="tp-crumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/topics">Topics</Link>
        </li>
        <li aria-current="page">{topic.name}</li>
      </ol>
    </nav>
  );
}

/**
 * A topic's page (/topics/{slug}): the topic, its interests as chips (each
 * a real link, ?interest={id}, the same page filtered), its upcoming events
 * with "Load more", its first clubs, and the other topics.
 *
 *   data     getTopicPage's: {topic, interest, filters, events, clubs}
 *   others   the other topics (for the links at the end), or []
 */
export function TopicView({ data, others = [] }) {
  const { topic, interest, filters, events, clubs } = data;
  const path = topicPagePath(topic);
  const counts = topicCounts(topic);
  const what = interest ? interest.name : topic.name;
  const clubsLink = interest ? `/clubs?interest=${encodeURIComponent(interest.id)}` : `/clubs?topic=${encodeURIComponent(topic.slug)}`;

  return (
    <Finder path={path} filters={filters}>
      <div className="dc-wrap tp" style={topicTone(topic)}>
        <Crumbs topic={topic} />
        <header className="tp-hero">
          <TopicMark topic={topic} size={64} />
          <div className="tp-hero-text">
            <h1>{topic.name}</h1>
            {topic.description ? <p className="tp-lede">{topic.description}</p> : null}
            <p className="tp-meta">
              {counts ? <span>{counts}</span> : null}
              <a className="tp-feed" href={feeds.topic(topic.slug, interest ? interest.id : null)} type="application/rss+xml">
                <Icon name="rss" size={14} /> {`Follow ${what} events by RSS`}
              </a>
            </p>
          </div>
        </header>

        {topic.interests.length ? (
          <div className="dc-chiprow tp-interests" role="group" aria-label={`Interests in ${topic.name}`}>
            <FilterLink className={`dc-chipbtn${interest ? "" : " is-on"}`} href={path} current={!interest}>
              All
            </FilterLink>
            {topic.interests.map((i) => {
              const on = Boolean(interest) && String(interest.id) === String(i.id);
              return (
                <FilterLink key={i.id} className={`dc-chipbtn${on ? " is-on" : ""}`} href={on ? path : topicPagePath(topic, i.id)} current={on}>
                  {i.icon ? <span aria-hidden="true">{i.icon}</span> : null}
                  {i.name}
                  {i.upcoming_events !== null ? <small>{formatCount(i.upcoming_events)}</small> : null}
                </FilterLink>
              );
            })}
          </div>
        ) : null}

        <section className="tp-section" aria-labelledby="tp-events-title">
          <div className="dc-resultline">
            <h2 id="tp-events-title" className="tp-h2">
              {`Upcoming ${what} events`}
            </h2>
            <span aria-live="polite">
              <strong>{formatTotal(events.total, events.capped)}</strong> {events.total === 1 && !events.capped ? "event" : "events"}
            </span>
          </div>
          <Results>
            {events.items.length ? (
              <MoreResults key={topicPagePath(topic, interest?.id)} kind="events" ids={events.items.map((e) => e.id)} total={events.total} capped={events.capped} first={{ cursored: events.cursored, cursor: events.cursor }} noun="events" headingLevel={3}>
                {events.items.map((e) => (
                  <EventCard key={e.id} event={e} headingLevel={3} />
                ))}
              </MoreResults>
            ) : (
              <EmptyState title={`No upcoming ${what} events right now`} message="Clubs add new events all the time. Follow a club below to hear first, or see everything that's on.">
                <Link className="dc-btn" to="/events">
                  Browse all events
                </Link>
                {interest ? (
                  <Link className="dc-btn dc-btn--ghost" to={path}>
                    {`All of ${topic.name}`}
                  </Link>
                ) : null}
              </EmptyState>
            )}
          </Results>
        </section>

        {clubs && clubs.items.length ? (
          <Section id="clubs" title={`${what} clubs`} sub={`Clubs into ${what} on MyOtherApp`} seeAll={clubsLink}>
            <div className="dc-grid dc-grid--4">
              {clubs.items.map((c) => (
                <ClubCard key={c.slug || c.id} club={c} headingLevel={3} />
              ))}
            </div>
          </Section>
        ) : null}

        {others.length ? (
          <Section id="more-topics" title="More topics" seeAll="/topics">
            <TopicChips topics={others} className="tp-chips tp-chips--wide" />
          </Section>
        ) : null}
      </div>
    </Finder>
  );
}

/** The page for a topic the API doesn't know (or doesn't have yet). */
export function TopicMissing() {
  return (
    <div className="dc-wrap">
      <div className="dc-section">
        <EmptyState as="h1" title="We couldn't find that topic" message="The link may be old, or the topic may have a new name.">
          <Link className="dc-btn" to="/events">
            Find events
          </Link>
          <Link className="dc-btn dc-btn--ghost" to="/clubs">
            Browse clubs
          </Link>
        </EmptyState>
      </div>
    </div>
  );
}
