import { Link } from "@/lib/router";
import { cityClubsPath, cityEventsPath, CITIES_PATH } from "@/seo/cities";
import { cityClubsHead, cityClubsIntro, cityEventsHead, cityEventsIntro, cityFinderPath, CITIES_DESCRIPTION, CITIES_TITLE } from "@/seo/citypages";
import { EmptyState, Section } from "./bits";
import { ClubCard } from "./clubcard";
import { EventCard } from "./eventcard";
import Icon from "./icons";
import { TopicChips } from "./topicbits";

/*
 * The city landing pages ("Events in Kochi", "Clubs in Kochi", the
 * /events/in hub) and the "Browse by city" links. Server-rendered views
 * with no state of their own: the cards are the site's (client components,
 * as on every list), the classes the topic and find pages' (no new styles).
 * Their words and structured data come from src/seo/citypages.js.
 */

/** Visible breadcrumbs, as the page's BreadcrumbList says them: [[name, path or null for here]]. */
export function Crumbs({ trail }) {
  return (
    <nav className="tp-crumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map(([name, to]) =>
          to ? (
            <li key={name}>
              <Link to={to}>{name}</Link>
            </li>
          ) : (
            <li key={name} aria-current="page">
              {name}
            </li>
          )
        )}
      </ol>
    </nav>
  );
}

/**
 * Cities as links, with how many upcoming events each has. `summaries` are
 * getCitySummaries()'s, already narrowed to those worth a link.
 */
export function CityChips({ summaries, label = "Cities", to = cityEventsPath }) {
  if (!summaries?.length) return null;
  return (
    <ul className="dc-chiprow dc-chiprow--wrap" aria-label={label}>
      {summaries.map((s) => (
        <li key={s.city.slug}>
          <Link className="dc-chipbtn" to={to(s.city)}>
            {s.city.name}
            {s.events ? <small>{s.moreEvents ? `${s.events}+` : s.events}</small> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "Browse by city": a section of city links, for the find page and the city pages. */
export function CityLinks({ summaries, title = "Browse by city", sub = "Hackathons, workshops and meetups near you", id = "by-city" }) {
  if (!summaries?.length) return null;
  return (
    <div className="dc-wrap">
      <Section id={id} title={title} sub={sub} seeAll={CITIES_PATH}>
        <CityChips summaries={summaries} />
      </Section>
    </div>
  );
}

/**
 * /events/in/{city}.
 *   events    the city's upcoming events (parsed, stable), soonest first
 *   more      the API had more than it sent (the count says "60+")
 *   clubs     the city's clubs (cards, stable), most followed first; the first few show
 *   topics    every topic (for "Browse by topic"), or []
 *   others    the other cities worth a link (summaries)
 */
const CLUBS_SHOWN = 4;

export function CityEventsView({ city, events, more = false, clubs = [], topics = [], others = [] }) {
  const { heading } = cityEventsHead(city);
  const hosts = new Set(events.map((e) => e.club?.slug || e.club?.id).filter(Boolean)).size;
  return (
    <div className="dc-wrap tp">
      <Crumbs trail={[["Home", "/"], ["Events", "/events"], [`Events in ${city.name}`, null]]} />
      <header className="dc-findhead tp-head">
        <h1>{heading}</h1>
        <p className="tp-lede">{cityEventsIntro(city, { count: events.length, more, clubs: hosts })}</p>
      </header>

      <section className="tp-section" aria-labelledby="city-events-title">
        <div className="dc-resultline">
          <h2 id="city-events-title" className="tp-h2">
            {`Upcoming events in ${city.name}`}
          </h2>
          {events.length ? (
            <Link className="dc-seeall" to={cityFinderPath(city)}>
              {more ? "See them all" : "Filter by day, price and type"} <Icon name="arrowRight" size={16} />
            </Link>
          ) : null}
        </div>
        {events.length ? (
          <div className="dc-grid dc-grid--4">
            {events.map((e) => (
              <EventCard key={e.id} event={e} headingLevel={3} />
            ))}
          </div>
        ) : (
          <EmptyState title={`No upcoming events in ${city.name} right now`} message="Clubs add new events all the time. See everything that's on, or join one online.">
            <Link className="dc-btn" to="/events">
              Browse all events
            </Link>
            <Link className="dc-btn dc-btn--ghost" to="/events?type=online">
              Online events
            </Link>
          </EmptyState>
        )}
      </section>

      {clubs.length ? (
        <Section id="city-clubs" title={`Clubs in ${city.name}`} sub={`Follow them to hear about their next event first`} seeAll={cityClubsPath(city)}>
          <div className="dc-grid dc-grid--4">
            {clubs.slice(0, CLUBS_SHOWN).map((c) => (
              <ClubCard key={c.slug || c.id} club={c} headingLevel={3} />
            ))}
          </div>
        </Section>
      ) : null}

      {topics.length ? (
        <Section id="city-topics" title="Browse by topic" seeAll="/topics">
          <TopicChips topics={topics} className="tp-chips tp-chips--wide" />
        </Section>
      ) : null}

      {others.length ? (
        <Section id="other-cities" title="Events in other cities" seeAll={CITIES_PATH}>
          <CityChips summaries={others} label="Other cities" />
        </Section>
      ) : null}
    </div>
  );
}

/** /clubs/in/{city}. */
export function CityClubsView({ city, clubs, more = false, others = [] }) {
  const { heading } = cityClubsHead(city);
  return (
    <div className="dc-wrap tp">
      <Crumbs trail={[["Home", "/"], ["Clubs", "/clubs"], [heading, null]]} />
      <header className="dc-findhead tp-head">
        <h1>{heading}</h1>
        <p className="tp-lede">{cityClubsIntro(city, { count: clubs.length, more })}</p>
      </header>
      <section className="tp-section" aria-labelledby="city-clubs-title">
        <div className="dc-resultline">
          <h2 id="city-clubs-title" className="tp-h2">
            {`Clubs in and around ${city.name}`}
          </h2>
          <Link className="dc-seeall" to={cityEventsPath(city)}>
            {`Events in ${city.name}`} <Icon name="arrowRight" size={16} />
          </Link>
        </div>
        {clubs.length ? (
          <div className="dc-grid dc-grid--4">
            {clubs.map((c) => (
              <ClubCard key={c.slug || c.id} club={c} headingLevel={3} />
            ))}
          </div>
        ) : (
          <EmptyState title={`No clubs in ${city.name} yet`} message="Browse the clubs on MyOtherApp, or bring yours.">
            <Link className="dc-btn" to="/clubs">
              Browse clubs
            </Link>
            <Link className="dc-btn dc-btn--ghost" to="/for-clubs">
              For clubs
            </Link>
          </EmptyState>
        )}
      </section>
      {others.length ? (
        <Section id="other-cities" title="Clubs in other cities" seeAll={CITIES_PATH}>
          <CityChips summaries={others} label="Other cities" to={cityClubsPath} />
        </Section>
      ) : null}
    </div>
  );
}

/** /events/in: the cities with upcoming events, Kerala's first. `groups` are cityGroups()'s. */
export function CitiesView({ groups }) {
  return (
    <div className="dc-wrap tp">
      <Crumbs trail={[["Home", "/"], ["Events", "/events"], [CITIES_TITLE, null]]} />
      <header className="dc-findhead tp-head">
        <h1>{CITIES_TITLE}</h1>
        <p className="tp-lede">{CITIES_DESCRIPTION}</p>
      </header>
      {groups.length ? (
        groups.map(([name, rows]) => (
          <Section key={name} id={`cities-${name.toLowerCase().replace(/\W+/g, "-")}`} title={name}>
            <CityChips summaries={rows} label={`Cities in ${name}`} />
          </Section>
        ))
      ) : (
        <EmptyState title="No city has upcoming events right now" message="Clubs add new events all the time. See everything that's on, or join one online.">
          <Link className="dc-btn" to="/events">
            Browse all events
          </Link>
          <Link className="dc-btn dc-btn--ghost" to="/events?type=online">
            Online events
          </Link>
        </EmptyState>
      )}
    </div>
  );
}
