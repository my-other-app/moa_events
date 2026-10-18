import { Link } from "@/lib/router";
import { eventSortOptions, filtersToSearch } from "@/api/parse";
import { activeEventFilters } from "@/seo/listings";
import { istDay, rangeLabel } from "@/utils/days";
import { formatCount, formatTotal } from "@/utils/format";
import { EmptyState } from "./bits";
import { EventCard } from "./eventcard";
import {
  DateChip,
  EventFilters,
  EventTools,
  EventsCalendar,
  FilterLink,
  Finder,
  FinderPlace,
  FinderSearchBox,
  MonthCount,
  MoreResults,
  Results,
  SheetButton,
} from "./finderislands";
import Icon from "./icons";

/** The category chips, as links: each a page of its own (src/seo/listings.js keeps one alone in search results). */
function CategoryChips({ categories, filters, hrefFor }) {
  if (!categories.length) return null;
  return (
    <div className="dc-chiprow" role="group" aria-label="Categories">
      <FilterLink className={`dc-chipbtn${filters.category ? "" : " is-on"}`} href={hrefFor({ category: "" })} current={!filters.category}>
        All
      </FilterLink>
      {categories.map((c) => {
        const on = filters.category === String(c.id);
        return (
          <FilterLink key={c.id} className={`dc-chipbtn${on ? " is-on" : ""}`} href={hrefFor({ category: on ? "" : String(c.id) })} current={on}>
            {c.name}
            {c.upcoming !== null ? <small>{formatCount(c.upcoming)}</small> : null}
          </FilterLink>
        );
      })}
    </div>
  );
}

/**
 * A picked topic's interests, as links (the topic page's chips, on the
 * list): "All Design", then each interest, with how many are coming up.
 */
function InterestChips({ topic, interest, hrefFor }) {
  if (!topic?.interests?.length) return null;
  return (
    <div className="dc-chiprow" role="group" aria-label={`Interests in ${topic.name}`}>
      <FilterLink className={`dc-chipbtn${interest ? "" : " is-on"}`} href={hrefFor({ topic: topic.slug, interest: "" })} current={!interest}>
        {`All ${topic.name}`}
      </FilterLink>
      {topic.interests.map((i) => {
        const on = Boolean(interest) && String(interest.id) === String(i.id);
        return (
          <FilterLink key={i.id} className={`dc-chipbtn${on ? " is-on" : ""}`} href={hrefFor({ topic: topic.slug, interest: on ? "" : String(i.id) })} current={on}>
            {i.name}
            {i.upcoming_events !== null && i.upcoming_events !== undefined ? <small>{formatCount(i.upcoming_events)}</small> : null}
          </FilterLink>
        );
      })}
    </div>
  );
}

/**
 * Find events. Every filter lives in the address (q, when or from/to,
 * type, price, category, topic, interest, sort, radius_km, near), so a search can be shared
 * or bookmarked and the back button undoes a filter; `view=calendar` shows
 * the month instead of the list (`month=YYYY-MM` picks which).
 *
 * No state of its own: the server renders it for the address
 * (src/app/events/page.jsx) with the first page of results. The islands
 * (finderislands.jsx) change the address, and add later pages.
 *
 *   state     eventsPageState(params): {filters, near, calendar, month}
 *   page      the first page (parseEventsPage, images stable): {items, total, where, categories}
 *   heading   the <h1> (eventsHead)
 *   topics    topicChoice(): the Topic filter's options, the picked topic and interest (none: no filter)
 */
export function EventsView({ state, page, heading, topics = null }) {
  const { filters, near, calendar, month } = state;
  const keep = calendar ? { view: "calendar", month } : null;
  const hrefFor = (patch) => {
    const search = filtersToSearch({ ...filters, ...patch, ...(keep || {}) }).toString();
    return search ? `/events?${search}` : "/events";
  };
  const dates = filters.from ? rangeLabel(filters.from, filters.to, istDay()) : "";
  const active = activeEventFilters(filters, calendar);
  const categories =
    filters.category && !page.categories.some((c) => String(c.id) === filters.category)
      ? [...page.categories, { id: filters.category, name: "Chosen category", upcoming: null }]
      : page.categories;

  let results;
  if (calendar) {
    results = <EventsCalendar month={month} />;
  } else if (!page.items.length) {
    results = (
      <EmptyState
        title="No events match"
        message={active || filters.q ? "Try another day, a wider distance or fewer filters." : "Nothing is listed here yet. Clubs add new events all the time."}
      >
        {active || filters.q ? (
          <Link className="dc-btn" to="/events">
            Clear search and filters
          </Link>
        ) : (
          <Link className="dc-btn" to="/clubs">
            Browse clubs
          </Link>
        )}
      </EmptyState>
    );
  } else {
    results = (
      <MoreResults key={hrefFor({})} kind="events" ids={page.items.map((e) => e.id)} total={page.total} capped={page.capped} first={{ cursored: page.cursored, cursor: page.cursor }} noun="events">
        {page.items.map((e) => (
          <EventCard key={e.id} event={e} headingLevel={2} />
        ))}
      </MoreResults>
    );
  }

  return (
    <Finder path="/events" filters={filters} keep={keep}>
      <div className="dc-wrap">
        <header className="dc-findhead">
          <h1>{heading}</h1>
          <div className="dc-findhead-row">
            <FinderSearchBox label="Search events" placeholder="Search events or topics" />
            <FinderPlace where={page.where} sortAsked={state.sortAsked} />
            <SheetButton>
              <Icon name="sliders" size={16} /> Filters{active ? ` (${active})` : ""}
            </SheetButton>
          </div>
        </header>

        <EventFilters
          count={calendar ? null : page.total}
          capped={page.capped}
          dates={dates}
          calendar={calendar}
          topics={topics?.options.map((t) => [t.slug, t.name])}
          topic={topics?.current?.slug || topics?.topicSlug || filters.topic}
        />

        <CategoryChips categories={categories} filters={filters} hrefFor={hrefFor} />

        <InterestChips topic={topics?.current} interest={topics?.interest} hrefFor={hrefFor} />

        <div className="dc-resultline">
          <div className="dc-resultline-main">
            <span aria-live="polite">
              {calendar ? (
                <MonthCount month={month || (filters.from || istDay()).slice(0, 7)} radiusKm={filters.radius_km} />
              ) : (
                <>
                  <strong>{formatTotal(page.total, page.capped)}</strong> {page.total === 1 && !page.capped ? "event" : "events"}
                  {filters.radius_km ? ` within ${filters.radius_km} km` : ""}
                </>
              )}
            </span>
            {dates && !calendar ? <DateChip dates={dates} /> : null}
          </div>
          <EventTools
            calendar={calendar}
            sortOptions={eventSortOptions({ q: filters.q, knowsWhere: Boolean(near) })}
            hint={near ? "" : "To sort by distance, set your location with “Change” next to the search."}
          />
        </div>

        <Results>{results}</Results>
      </div>
    </Finder>
  );
}
