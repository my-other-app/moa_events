import { useEffect, useState } from "react";
import { Link } from "@/lib/router";
import { discoverApi, isEmptyHome } from "@/api/discover";
import { usePageMeta } from "@/utils/meta";
import { useWhere } from "@/utils/where";
import { SitePage } from "./chrome";
import { EmptyState, ErrorState, Section, StoreButtons } from "./bits";
import { EventCard, EventRailSkeleton } from "./eventcard";
import { ClubCard } from "./clubcard";
import { ThreadCard } from "./threadcard";
import { HomeHero } from "./hero";

const RAIL = 8;

/** A row of events: it scrolls sideways on a phone and is a one-row grid on a desk ("See all" has the rest). */
function EventRail({ events }) {
  return (
    <div className="dc-rail dc-rail--cards dc-rail--clip">
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
 * The front door: the hero (search, categories, a fan of what's coming up),
 * then what is on near you, this week, the clubs around, online, popular,
 * and the clubs' latest posts. A section with nothing in it is left out.
 */
export default function DiscoverHome() {
  const [stored, setStored] = useWhere();
  const [state, setState] = useState({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
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

  return (
    <SitePage>
      <div className="dc-wrap">
        <HomeHero data={state.data} loading={state.status === "loading"} where={where} stored={stored} onWhereChange={setStored} />

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

        {data && data.clubs.length ? (
          <Section id="clubs" title="Clubs near you" seeAll="/clubs">
            <div className="dc-rail dc-rail--cards dc-rail--clip">
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
      </div>
    </SitePage>
  );
}
