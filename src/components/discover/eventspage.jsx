import { useMemo, useState } from "react";
import { Link, useSearchParams } from "@/lib/router";
import {
  PAGE_SIZE,
  PRICE_OPTIONS,
  RADIUS_OPTIONS,
  TYPE_OPTIONS,
  WHEN_OPTIONS,
  discoverApi,
  eventSortOptions,
  filtersToSearch,
  readEventFilters,
} from "@/api/discover";
import { usePageMeta } from "@/utils/meta";
import { usePagedList } from "@/utils/paged";
import { useWhere } from "@/utils/where";
import { isMonth, istDay, monthOf, monthWord, rangeLabel } from "@/utils/days";
import { formatCount } from "@/utils/format";
import { SitePage } from "./chrome";
import { EmptyState, ErrorState } from "./bits";
import { EventCard, EventRailSkeleton } from "./eventcard";
import { FilterSelect, FilterSheet, FinderSearch, LoadMore, SortSelect, ViewToggle } from "./finder";
import { CalendarView } from "./calendarview";
import { monthCount } from "@/utils/eventcalendar";
import { DatePicker, DatePopover, DateSheet } from "./datepicker";
import { LocationPill } from "./locationpill";
import Icon from "./icons";

const RADIUS_SELECT = [["", "Any distance"], ...RADIUS_OPTIONS.map((r) => [String(r), `Within ${r} km`])];
const FILTER_KEYS = ["when", "from", "type", "price", "category", "radius_km"];
const CALENDAR_FILTER_KEYS = ["type", "price", "category", "radius_km"];

const scrollTop = () => {
  try {
    window.scrollTo(0, 0);
  } catch {
    /* not in a browser */
  }
};

/**
 * Find events. Every filter lives in the address (q, when or from/to,
 * type, price, category, sort, radius_km), so a search can be shared or
 * bookmarked and the back button undoes a filter. `view=calendar` shows
 * the month instead of the list (`month=YYYY-MM` picks which).
 */
export default function FindEvents() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const filters = useMemo(() => readEventFilters(new URLSearchParams(search)), [search]);
  const calendar = params.get("view") === "calendar";
  const monthParam = isMonth(params.get("month")) ? params.get("month") : "";
  const today = istDay();
  const month = monthParam || monthOf(filters.from || today);
  const [stored, setStored] = useWhere();
  const [sheet, setSheet] = useState(false);
  const [picker, setPicker] = useState(null); // "popover" on a wide screen, "sheet" on a phone

  const list = usePagedList(
    (offset) => (calendar ? discoverApi.monthEvents(filters, stored, month) : discoverApi.events(filters, stored, { offset, limit: PAGE_SIZE })),
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
  const dates = filters.from ? rangeLabel(filters.from, filters.to, today) : "";

  const heading = filters.q
    ? `Events matching “${filters.q}”`
    : filters.type === "online"
      ? "Online events"
      : city
        ? `Events near ${city}`
        : dates || calendar
          ? "Find events"
          : "Upcoming events";
  usePageMeta(
    `${heading} · MyOtherApp`,
    `${heading}: find what's on — by day, type, price and category — on MyOtherApp.`
  );

  // The calendar keeps its place while its filters change.
  const keep = calendar ? { view: "calendar", month: monthParam } : {};
  const update = (patch) => setParams(filtersToSearch({ ...filters, ...patch, ...keep }));
  // Sorting is not a filter: clearing keeps it, and the search words.
  const clearAll = () => setParams(filtersToSearch({ q: filters.q, sort: filters.sort, ...keep }));
  const active = (calendar ? CALENDAR_FILTER_KEYS : FILTER_KEYS).filter((k) => filters[k]).length;

  const setView = (next) => {
    if (next === (calendar ? "calendar" : "list")) return;
    setParams(filtersToSearch({ ...filters, ...(next === "calendar" ? { view: "calendar" } : {}) }));
  };
  const showMonth = (m) => setParams(filtersToSearch({ ...filters, view: "calendar", month: m }));
  const showDay = (day) => {
    setParams(filtersToSearch({ ...filters, when: "", from: day, to: day }));
    scrollTop();
  };
  const applyDates = (from, to) => {
    setPicker(null);
    update({ when: "", from, to });
  };

  const picking = (
    <DatePicker key={`${filters.from}|${filters.to}`} filters={filters} where={stored} from={filters.from} to={filters.to} onApply={applyDates} />
  );

  const whenControl = (inSheet) => {
    const options = [...WHEN_OPTIONS, ...(dates ? [["dates", dates]] : []), ["pick", "Pick dates…"]];
    return (
      <div className="dc-when">
        <FilterSelect
          label="When"
          value={dates ? "dates" : filters.when}
          options={options}
          onChange={(v) => {
            if (v === "pick") {
              if (inSheet) setSheet(false);
              setPicker(inSheet ? "sheet" : "popover");
            } else if (v !== "dates") {
              update({ when: v, from: "", to: "" });
            }
          }}
        />
        {inSheet ? null : (
          <DatePopover open={picker === "popover"} onClose={() => setPicker(null)}>
            {picking}
          </DatePopover>
        )}
      </div>
    );
  };

  const controls = (inSheet) => (
    <>
      {calendar ? null : whenControl(inSheet)}
      <FilterSelect label="Type" value={filters.type} options={TYPE_OPTIONS} onChange={(v) => update({ type: v })} />
      <FilterSelect label="Price" value={filters.price} options={PRICE_OPTIONS} onChange={(v) => update({ price: v })} />
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
  if (calendar) {
    results = (
      <CalendarView filters={filters} where={stored} month={month} items={list.items} status={list.status} onMonth={showMonth} onDay={showDay} onRetry={list.retry} />
    );
  } else if (list.status === "loading") {
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

  const count = calendar ? monthCount(list.items, list.total, month) : list.total;
  const sortOptions = eventSortOptions({ q: filters.q, knowsWhere });

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
          {controls(false)}
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

        <div className="dc-resultline">
          <div className="dc-resultline-main">
            <span aria-live="polite">
              {list.status === "ready" ? (
                <>
                  <strong>{formatCount(count)}</strong> {count === 1 ? "event" : "events"}
                  {calendar ? ` in ${monthWord(month)}` : ""}
                  {filters.radius_km ? ` within ${filters.radius_km} km` : ""}
                </>
              ) : list.status === "loading" ? (
                calendar ? "Finding this month's events…" : "Finding events…"
              ) : null}
            </span>
            {dates && !calendar ? (
              <button type="button" className="dc-chipbtn is-on dc-datechip" onClick={() => update({ from: "", to: "" })} aria-label={`Remove dates: ${dates}`}>
                <Icon name="calendar" size={14} />
                {dates}
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </div>
          <div className="dc-resulttools">
            <ViewToggle view={calendar ? "calendar" : "list"} onChange={setView} />
            {calendar ? null : (
              <SortSelect
                value={filters.sort || "date"}
                options={sortOptions}
                onChange={(v) => update({ sort: v === "date" ? "" : v })}
                hint={knowsWhere ? "" : "To sort by distance, set your location with “Change” next to the search."}
              />
            )}
          </div>
        </div>

        {results}
      </div>

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        onClear={active ? clearAll : null}
        doneLabel={list.status === "ready" ? `Show ${formatCount(count)} ${count === 1 ? "event" : "events"}` : "Show results"}
      >
        {controls(true)}
      </FilterSheet>
      <DateSheet open={picker === "sheet"} onClose={() => setPicker(null)}>
        {picking}
      </DateSheet>
    </SitePage>
  );
}
