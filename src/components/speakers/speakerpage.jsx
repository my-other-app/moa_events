import { Link } from "@/lib/router";
import { eventPagePath, topicPagePath } from "@/seo/urls";
import { formatWhen } from "@/utils/format";
import { LINK_ICON } from "@/utils/speakers";
import { EmptyState, Img } from "../discover/bits";
import { EpIcon, Face, RichText } from "../discover/eventparts";
import Icon from "../discover/icons";
import { SpeakerFollow } from "./speakerislands";

/**
 * A speaker's page, laid out (src/app/speakers/[slug]/page.jsx renders it on
 * the server): their photo, name, headline, city, links and topics, Follow,
 * their bio, then their upcoming and past talks, each a link to its event.
 * `page` is parseSpeakerPage's result after stableSpeakerPage (every image a
 * /media address). Only Follow runs in the browser.
 */

function Talk({ talk }) {
  const href = talk.slug || talk.eventId !== null ? eventPagePath({ slug: talk.slug, id: talk.eventId }) : null;
  const when = formatWhen(talk.date);
  const body = (
    <>
      <span className="sp-talk-poster" aria-hidden="true">
        <EpIcon name="calendarPlus" size={22} />
        {talk.poster ? <Img src={talk.poster} alt="" /> : null}
      </span>
      <span className="sp-talk-body">
        {when ? <span className="sp-talk-when">{when} IST</span> : null}
        <span className="sp-talk-event">{talk.name}</span>
        {talk.talkTitle ? <span className="sp-talk-title">&ldquo;{talk.talkTitle}&rdquo;</span> : null}
        {talk.club ? <span className="sp-talk-club">by {talk.club.name}</span> : null}
      </span>
    </>
  );
  return <li>{href ? <Link className="sp-talk" to={href}>{body}</Link> : <span className="sp-talk">{body}</span>}</li>;
}

function Talks({ id, title, talks, empty }) {
  return (
    <section id={id} className="sp-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="sp-h2">
        {title}
        {talks.length ? <span className="sp-count">{talks.length}</span> : null}
      </h2>
      {talks.length ? (
        <ul className="sp-talks">
          {talks.map((t) => (
            <Talk key={`${t.eventId}`} talk={t} />
          ))}
        </ul>
      ) : (
        <p className="sp-empty">{empty}</p>
      )}
    </section>
  );
}

export function SpeakerView({ page }) {
  const talks = page.upcoming.length + page.past.length;
  return (
    <article className="sp" aria-labelledby="sp-title">
      <div className="dc-wrap sp-wrap">
        <header className="sp-head">
          <Face name={page.name} src={page.photo} size={128} />
          <div className="sp-intro">
            <p className="dc-eyebrow">
              <Icon name="award" size={16} /> Speaker
            </p>
            <h1 id="sp-title" className="sp-name">
              {page.name}
            </h1>
            {page.headline ? <p className="sp-headline">{page.headline}</p> : null}
            <p className="sp-facts">
              {page.city ? (
                <span>
                  <Icon name="pin" size={15} /> {page.city}
                </span>
              ) : null}
              {talks ? (
                <span>
                  <Icon name="comment" size={15} /> {talks} {talks === 1 ? "talk" : "talks"} on MyOtherApp
                </span>
              ) : null}
            </p>
            <div className="sp-actions">
              <SpeakerFollow slug={page.slug} name={page.name} followers={page.followers} />
              {page.links.length ? (
                <ul className="sp-links" aria-label={`${page.name} elsewhere`}>
                  {page.links.map((l) => (
                    <li key={l.kind}>
                      <a className="ep-iconlink" href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`${page.name} on ${l.label} (opens in a new tab)`}>
                        <Icon name={LINK_ICON[l.kind] || "link"} size={17} />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </header>

        {page.topics.length ? (
          <ul className="sp-topics" aria-label="Talks about">
            {page.topics.map((t) => (
              <li key={t.slug || t.name}>
                {t.slug ? (
                  <Link className="ep-chip ep-chip--topic" to={topicPagePath(t)}>
                    {t.name}
                  </Link>
                ) : (
                  <span className="ep-chip">{t.name}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {page.bio ? (
          <section className="sp-section" aria-labelledby="sp-about-title">
            <h2 id="sp-about-title" className="sp-h2">
              About {page.name.split(/\s+/)[0]}
            </h2>
            <RichText text={page.bio} className="sp-bio" />
          </section>
        ) : null}

        <Talks id="upcoming" title="Upcoming talks" talks={page.upcoming} empty={`Nothing coming up just now. Follow ${page.name.split(/\s+/)[0]} to hear when they're on a new event.`} />
        {page.past.length ? <Talks id="past" title="Past talks" talks={page.past} empty="" /> : null}
      </div>
    </article>
  );
}

/** A speaker address with no public page behind it: said kindly, with somewhere to go. */
export function SpeakerMissing() {
  return (
    <div className="dc-wrap">
      <div className="dc-section">
        <EmptyState as="h1" title="We couldn't find that speaker" message="The link may be old, or the speaker's page may not be public.">
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
