import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  EVENT_SORT_OPTIONS,
  PAGE_SIZE,
  PRICE_OPTIONS,
  RADIUS_OPTIONS,
  TYPE_OPTIONS,
  WHEN_OPTIONS,
  discoverApi,
  filtersToSearch,
  readEventFilters,
} from "@/api/discover";
import { usePageMeta } from "@/utils/meta";
import { usePagedList } from "@/utils/paged";
import { useWhere } from "@/utils/where";
import { formatCount } from "@/utils/format";
import { SitePage } from "./chrome";
import { EmptyState, ErrorState } from "./bits";
import { EventCard, EventRailSkeleton } from "./eventcard";
import { FilterSelect, FilterSheet, FinderSearch, LoadMore } from "./finder";
import { LocationPill } from "./locationpill";
import Icon from "./icons";

const RADIUS_SELECT = [["", "Any distance"], ...RADIUS_OPTIONS.map((r) => [String(r), `Within ${r} km`])];
const FILTER_KEYS = ["when", "type", "price", "category", "radius_km"];

/**
 * Find events. Every filter lives in the address (q, when, type, price,
 * category, sort, radius_km), so a search can be shared or bookmarked and
 * the back button undoes a filter.
 */
export default function FindEvents() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const filters = useMemo(() => readEventFilters(new URLSearchParams(search)), [search]);
  const [stored, setStored] = useWhere();
  const [sheet, setSheet] = useState(false);

  const list = usePagedList(
    (offset) => discoverApi.events(filters, stored, { offset, limit: PAGE_SIZE }),
    `${search}|${stored?.lat ?? ""},${stored?.lng ?? ""}`
  );

  const page = list.page;
  const where = page?.where || null;
  const knowsWhere = Boolean(stored) || (where !== null && where.lat !== null);
  const city = where?.city;
  const categories = useMemo(() => {
    const cats = page?.categories || [];
    if (filters.category && !cats.some((c) => String(c.id) === filters.category)) {
      return [...cats, { id: filters.category, name: "Chosen category", upcoming: null }];
    }
    return cats;
  }, [page, filters.category]);

  const heading = filters.q
    ? `Events matching “${filters.q}”`
    : filters.type === "online"
      ? "Online events"
      : city
        ? `Events near ${city}`
        : "Upcoming events";
  usePageMeta(
    `${heading} · MyOtherApp`,
    `${heading}: find what's on — by day, type, price and category — on MyOtherApp.`
  );

  const update = (patch) => setParams(filtersToSearch({ ...filters, ...patch }));
  // Sorting is not a filter: clearing keeps it, and the search words.
  const clearAll = () => setParams(filtersToSearch({ q: filters.q, sort: filters.sort }));
  const active = FILTER_KEYS.filter((k) => filters[k]).length;

  const controls = (
    <>
      <FilterSelect label="When" value={filters.when} options={WHEN_OPTIONS} onChange={(v) => update({ when: v })} />
      <FilterSelect label="Type" value={filters.type} options={TYPE_OPTIONS} onChange={(v) => update({ type: v })} />
      <FilterSelect label="Price" value={filters.price} options={PRICE_OPTIONS} onChange={(v) => update({ price: v })} />
      <FilterSelect
        label="Sort by"
        value={filters.sort || "date"}
        defaultValue="date"
        options={EVENT_SORT_OPTIONS}
        onChange={(v) => update({ sort: v === "date" ? "" : v })}
      />
      {knowsWhere ? (
        <FilterSelect
          label="Distance"
          value={filters.radius_km ? String(filters.radius_km) : ""}
          options={RADIUS_SELECT}
          onChange={(v) => update({ radius_km: v ? Number(v) : null })}
        />
      ) : null}
    </>
  );

  let results;
  if (list.status === "loading") {
    results = <EventRailSkeleton count={8} grid />;
  } else if (list.status === "error") {
    results = <ErrorState message="We couldn't load events right now. Check your connection and try again." onRetry={list.retry} />;
  } else if (!list.items.length) {
    results = (
      <EmptyState
        title="No events match"
        message={active || filters.q ? "Try another day, a wider distance or fewer filters." : "Nothing is listed here yet. Clubs add new events all the time."}
      >
        {active || filters.q ? (
          <button type="button" className="dc-btn" onClick={() => setParams(new URLSearchParams())}>
            Clear search and filters
          </button>
        ) : (
          <Link className="dc-btn" to="/clubs">
            Browse clubs
          </Link>
        )}
      </EmptyState>
    );
  } else {
    results = (
      <>
        <div className="dc-grid dc-grid--4">
          {list.items.map((e) => (
            <EventCard key={e.id} event={e} headingLevel={2} />
          ))}
        </div>
        <LoadMore shown={list.items.length} total={list.total} busy={list.more.busy} error={list.more.error} onMore={list.loadMore} noun="events" />
      </>
    );
  }

  return (
    <SitePage>
      <div className="dc-wrap">
        <header className="dc-findhead">
          <h1>{heading}</h1>
          <div className="dc-findhead-row">
            <FinderSearch key={filters.q} initial={filters.q} label="Search events" placeholder="Search events or topics" onSearch={(q) => update({ q })} />
            <LocationPill where={where} stored={stored} onChange={setStored} />
            <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm dc-filters-toggle" aria-haspopup="dialog" onClick={() => setSheet(true)}>
              <Icon name="sliders" size={16} /> Filters{active ? ` (${active})` : ""}
            </button>
          </div>
        </header>

        <div className="dc-filterbar" role="group" aria-label="Filters">
          {controls}
          {active ? (
            <button type="button" className="dc-filterbar-clear" onClick={clearAll}>
              Clear filters
            </button>
          ) : null}
        </div>

        {categories.length ? (
          <div className="dc-chiprow" role="group" aria-label="Categories">
            <button type="button" className="dc-chipbtn" aria-pressed={!filters.category} onClick={() => update({ category: "" })}>
              All
            </button>
            {categories.map((c) => {
              const on = filters.category === String(c.id);
              return (
                <button key={c.id} type="button" className="dc-chipbtn" aria-pressed={on} onClick={() => update({ category: on ? "" : String(c.id) })}>
                  {c.name}
                  {c.upcoming !== null ? <small>{formatCount(c.upcoming)}</small> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="dc-resultline" aria-live="polite">
          {list.status === "ready" ? (
            <span>
              <strong>{formatCount(list.total)}</strong> {list.total === 1 ? "event" : "events"}
              {filters.radius_km ? ` within ${filters.radius_km} km` : ""}
            </span>
          ) : list.status === "loading" ? (
            <span>Finding events…</span>
          ) : null}
        </div>

        {results}
      </div>

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        onClear={active ? clearAll : null}
        doneLabel={list.status === "ready" ? `Show ${formatCount(list.total)} ${list.total === 1 ? "event" : "events"}` : "Show results"}
      >
        {controls}
      </FilterSheet>
    </SitePage>
  );
}
