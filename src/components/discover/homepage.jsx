import { Link } from "@/lib/router";
import { isEmptyHome } from "@/api/parse";
import { EmptyState, Section, StoreButtons } from "./bits";
import { EventRail } from "./eventcard";
import { ThreadCard } from "./threadcard";
import { HomeHero } from "./hero";
import { NearClubs, NearEvents, NearYou } from "./homeislands";

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
 * then what is on near you, this week, the clubs, online, popular, and the
 * clubs' latest posts. A section with nothing in it is left out.
 *
 * No state of its own: the server renders it for everyone (src/app/page.jsx,
 * statically regenerated) from the home data with nothing about the reader
 * in it. What is about the reader — where they are, the events near them,
 * the clubs nearest them, the search — are the islands in homeislands.jsx.
 */
export function HomeView({ data }) {
  return (
    <NearYou>
      <div className="dc-wrap">
        <HomeHero data={data} />

        <NearEvents />

        {isEmptyHome(data) ? (
          <div className="dc-section">
            <EmptyState title="It's quiet out here" message="No events or clubs to show yet. Clubs add new events all the time — look further afield, or get the app to hear first.">
              <Link className="dc-btn" to="/events">
                Browse all events
              </Link>
            </EmptyState>
          </div>
        ) : null}

        {data.this_week.length ? (
          <Section id="this-week" title="This week" seeAll="/events?when=this_week">
            <EventRail events={data.this_week} />
          </Section>
        ) : null}

        <NearClubs clubs={data.clubs.slice(0, 8)} />

        {data.online.length ? (
          <Section id="online" title="Online events" seeAll="/events?type=online">
            <EventRail events={data.online} />
          </Section>
        ) : null}

        {data.popular.length ? (
          <Section id="popular" title="Popular" seeAll="/events?sort=popular">
            <EventRail events={data.popular} />
          </Section>
        ) : null}

        {data.threads.length ? (
          <Section id="threads" title="From the clubs" sub="The latest posts and polls from clubs on MyOtherApp" seeAll="/threads">
            <div className="dc-threads dc-threads--cols">
              {data.threads.slice(0, 6).map((t) => (
                <ThreadCard key={t.id} thread={t} />
              ))}
            </div>
          </Section>
        ) : null}

        <AppBand />
      </div>
    </NearYou>
  );
}
