import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { discoverApi, isEmptyHome } from "@/api/discover";
import { usePageMeta } from "@/utils/meta";
import { useWhere } from "@/utils/where";
import { formatCount } from "@/utils/format";
import { SitePage } from "./chrome";
import { EmptyState, ErrorState, Section, StoreButtons } from "./bits";
import { EventCard, EventRailSkeleton } from "./eventcard";
import { ClubCard } from "./clubcard";
import { ThreadCard } from "./threadcard";
import { LocationPill } from "./locationpill";
import Icon from "./icons";

const RAIL = 8;

function EventRail({ events }) {
  return (
    <div className="dc-rail">
      {events.slice(0, RAIL).map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}

function AppBand() {
  return (
    <section className="dc-band" aria-labelledby="dc-band-title">
      <div className="dc-band-inner">
        <div>
          <h2 id="dc-band-title">
            Your clubs, <em>in your pocket.</em>
          </h2>
          <p>Follow clubs, get your ticket in a tap, vote in polls and hear about events before they fill up — all in the MyOtherApp app.</p>
        </div>
        <StoreButtons tone="light" />
      </div>
    </section>
  );
}

/**
 * The front door: what is on near you, this week, by category, the clubs
 * around, online, popular, and the clubs' latest posts. A section with
 * nothing in it is left out.
 */
export default function DiscoverHome() {
  const navigate = useNavigate();
  const [stored, setStored] = useWhere();
  const [state, setState] = useState({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const searchId = useId();
  const lat = stored?.lat ?? null;
  const lng = stored?.lng ?? null;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ status: "loading", data: s.data }));
    discoverApi.home(lat !== null ? { lat, lng } : null).then(
      (data) => alive && setState({ status: "ready", data }),
      () => alive && setState({ status: "error", data: null })
    );
    return () => {
      alive = false;
    };
  }, [lat, lng, attempt]);

  const data = state.status === "ready" ? state.data : null;
  const where = state.data?.where || null;
  const city = where?.city;
  usePageMeta(
    city ? `Events and clubs near ${city} · MyOtherApp` : "MyOtherApp · Events and clubs near you",
    city
      ? `Find events, clubs and people near ${city}: hackathons, workshops, meetups and more on MyOtherApp.`
      : "Find events, clubs and people near you: hackathons, workshops, meetups and more on MyOtherApp."
  );

  const search = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/events?q=${encodeURIComponent(term)}` : "/events");
  };

  return (
    <SitePage>
      <div className="dc-wrap">
        <section className="dc-hero" aria-labelledby="dc-hero-title">
          <h1 id="dc-hero-title">
            Find your <span className="dc-hl">people.</span>
          </h1>
          <p className="dc-hero-lede">Events and clubs near you — hackathons, workshops, meetups and more, from the clubs on MyOtherApp.</p>
          <form className="dc-hero-search" role="search" onSubmit={search}>
            <div className="dc-field">
              <Icon name="search" size={18} />
              <label className="dc-sr" htmlFor={searchId}>
                Search events
              </label>
              <input id={searchId} type="search" placeholder="Search events or topics" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
            </div>
            <button type="submit" className="dc-btn">
              Search
            </button>
          </form>
          <div className="dc-hero-where">
            <LocationPill where={where} stored={stored} onChange={setStored} />
          </div>
        </section>

        {state.status === "loading" ? (
          <>
            <section className="dc-section" aria-busy="true">
              <div className="dc-section-head">
                <div className="dc-skel" style={{ width: 220, height: 30 }} />
              </div>
              <EventRailSkeleton />
            </section>
            <section className="dc-section" aria-hidden="true">
              <div className="dc-section-head">
                <div className="dc-skel" style={{ width: 160, height: 30 }} />
              </div>
              <EventRailSkeleton />
            </section>
          </>
        ) : null}

        {state.status === "error" ? (
          <div className="dc-section">
            <ErrorState message="We couldn't load what's on right now. Check your connection and try again." onRetry={() => setAttempt((a) => a + 1)} />
          </div>
        ) : null}

        {data && isEmptyHome(data) ? (
          <div className="dc-section">
            <EmptyState
              title={city ? `It's quiet near ${city}` : "It's quiet out here"}
              message="No events or clubs to show yet. Clubs add new events all the time — look further afield, or get the app to hear first."
            >
              <Link className="dc-btn" to="/events">
                Browse all events
              </Link>
              {stored ? (
                <button type="button" className="dc-btn dc-btn--ghost" onClick={() => setStored(null)}>
                  Forget my location
                </button>
              ) : null}
            </EmptyState>
          </div>
        ) : null}

        {data && data.near.length ? (
          <Section id="near" title={`Events near ${city || "you"}`} seeAll="/events?sort=distance">
            <EventRail events={data.near} />
          </Section>
        ) : null}

        {data && data.this_week.length ? (
          <Section id="this-week" title="This week" seeAll="/events?when=this_week">
            <EventRail events={data.this_week} />
          </Section>
        ) : null}

        {data && data.categories.length ? (
          <Section id="categories" title="Browse by category">
            <ul className="dc-chiprow dc-chiprow--wrap">
              {data.categories.map((c) => (
                <li key={c.id}>
                  <Link className="dc-chipbtn" to={`/events?category=${encodeURIComponent(c.id)}`}>
                    {c.name}
                    <small>{formatCount(c.upcoming)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {data && data.clubs.length ? (
          <Section id="clubs" title="Clubs near you" seeAll="/clubs">
            <div className="dc-rail">
              {data.clubs.slice(0, RAIL).map((c) => (
                <ClubCard key={c.slug || c.id} club={c} />
              ))}
            </div>
          </Section>
        ) : null}

        {data && data.online.length ? (
          <Section id="online" title="Online events" seeAll="/events?type=online">
            <EventRail events={data.online} />
          </Section>
        ) : null}

        {data && data.popular.length ? (
          <Section id="popular" title="Popular" seeAll="/events?sort=popular">
            <EventRail events={data.popular} />
          </Section>
        ) : null}

        {data && data.threads.length ? (
          <Section id="threads" title="From the clubs" sub="The latest posts and polls from clubs on MyOtherApp" seeAll="/threads">
            <div className="dc-threads dc-threads--cols">
              {data.threads.slice(0, 6).map((t) => (
                <ThreadCard key={t.id} thread={t} />
              ))}
            </div>
          </Section>
        ) : null}

        {state.status !== "loading" ? <AppBand /> : null}

        {data && (data.stats.upcoming_events > 0 || data.stats.clubs > 0) ? (
          <p className="dc-stats">
            <span className="dc-stat">
              <strong>{formatCount(data.stats.upcoming_events)}</strong> upcoming {data.stats.upcoming_events === 1 ? "event" : "events"}
            </span>
            <span className="dc-stat">
              <strong>{formatCount(data.stats.clubs)}</strong> {data.stats.clubs === 1 ? "club" : "clubs"}
            </span>
            {data.stats.cities > 1 ? (
              <span className="dc-stat">
                <strong>{formatCount(data.stats.cities)}</strong> cities
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </SitePage>
  );
}
