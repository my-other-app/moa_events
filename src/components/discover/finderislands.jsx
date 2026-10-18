"use client";

/**
 * The find pages' client islands (/events, /clubs, and "Load more" on
 * /threads). The pages are rendered on the server for their address — the
 * heading, the chips, the count and the first page of results are in the
 * HTML — and every filter lives in that address. These islands change it:
 * the search box, the place, the filter bar and its sheet, the dates, the
 * view and the order, and they add later pages to the list.
 *
 * <Finder> holds what they share: the page's filters, a way to move to new
 * ones (a navigation, so the server renders the new list), whether one is
 * under way (the list dims meanwhile), and which sheet is open.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Link, useNavigate } from "@/lib/router";
import {
  ANYWHERE,
  CLUB_SORT_OPTIONS,
  PAGE_SIZE,
  PRICE_OPTIONS,
  RADIUS_OPTIONS,
  TYPE_OPTIONS,
  WHEN_OPTIONS,
  discoverApi,
  filtersToSearch,
  nearParam,
  nearPoint,
} from "@/api/discover";
import { activeClubFilters, activeEventFilters } from "@/seo/listings";
import { monthCount } from "@/utils/eventcalendar";
import { istDay, monthOf, monthWord } from "@/utils/days";
import { formatCount, formatTotal } from "@/utils/format";
import { saveWhere, clearWhere, useWhere } from "@/utils/where";
import { ClubCard } from "./clubcard";
import { EventCard } from "./eventcard";
import { ThreadCard } from "./threadcard";
import { CalendarView } from "./calendarview";
import { DatePicker, DatePopover, DateSheet } from "./datepicker";
import { FilterSelect, FilterSheet, FinderSearch, LoadMore, SortSelect, ViewToggle } from "./finder";
import { LocationPill } from "./locationpill";
import Icon from "./icons";

const RADIUS_SELECT = [["", "Any distance"], ...RADIUS_OPTIONS.map((r) => [String(r), `Within ${r} km`])];

const FinderContext = createContext(null);
const useFinder = () => useContext(FinderContext);

const hrefOf = (path, params) => {
  const search = filtersToSearch(params).toString();
  return search ? `${path}?${search}` : path;
};

/**
 * The page's filters and how to change them.
 *   path      "/events" | "/clubs"
 *   filters   the filters the server rendered, tidied (src/seo/listings.js)
 *   keep      what stays across filter changes but isn't a filter (the calendar's view and month)
 */
export function Finder({ path, filters, keep = null, children }) {
  const navigate = useNavigate();
  const [pending, start] = useTransition();
  const [sheet, setSheet] = useState(false);
  const [picker, setPicker] = useState(null); // "popover" on a wide screen, "sheet" on a phone
  const [monthTotal, setMonthTotal] = useState(null); // the calendar's count, once its month is in
  const kept = useMemo(() => keep || {}, [keep]);

  const go = useCallback((href, { replace = false } = {}) => start(() => navigate(href, { replace })), [navigate]);
  const hrefFor = useCallback((patch) => hrefOf(path, { ...filters, ...patch, ...kept }), [path, filters, kept]);
  const update = useCallback((patch, options) => go(hrefFor(patch), options), [go, hrefFor]);
  const value = { path, filters, keep: kept, go, hrefFor, update, pending, sheet, setSheet, picker, setPicker, monthTotal, setMonthTotal };
  return <FinderContext.Provider value={value}>{children}</FinderContext.Provider>;
}

/** The results, dimmed while new ones are on their way. */
export function Results({ children }) {
  const { pending } = useFinder();
  return (
    <div className={pending ? "dc-results is-pending" : "dc-results"} aria-busy={pending || undefined}>
      {children}
    </div>
  );
}

/** A link to the list with other filters (a category chip): a real link for crawlers, a quiet navigation for people. */
export function FilterLink({ href, className, current = false, children }) {
  const { go } = useFinder();
  return (
    <Link
      to={href}
      className={className}
      aria-current={current ? "true" : undefined}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href);
      }}
    >
      {children}
    </Link>
  );
}

/** The search box: new words, the same filters. */
export function FinderSearchBox({ label, placeholder }) {
  const { filters, update } = useFinder();
  return <FinderSearch key={filters.q} initial={filters.q} label={label} placeholder={placeholder} onSearch={(q) => update({ q })} />;
}

/**
 * Where the list is about: the address's ?near=, or everywhere. Sharing a
 * location keeps it in this browser and puts it in the address; a location
 * kept from before is put in the address on arrival (the server then
 * renders the list near it), with the order by distance the address asked
 * for (`sortAsked`). `where` is the API's word for the place.
 */
export function FinderPlace({ where, sortAsked = "" }) {
  const { filters, update } = useFinder();
  const [stored] = useWhere();
  const here = nearPoint(filters.near);
  const anywhere = { near: "", radius_km: null, sort: filters.sort === "distance" || filters.sort === "nearby" ? "" : filters.sort };

  useEffect(() => {
    if (!stored || filters.near) return;
    // An order by distance in the link ("Events near you") was dropped for want of a place: it comes back with one.
    update({ near: nearParam(stored), ...(sortAsked === "distance" || sortAsked === "nearby" ? { sort: sortAsked } : {}) }, { replace: true });
    // Once the stored point is read (after hydration), and again if it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.lat, stored?.lng]);

  const change = (point) => {
    if (point) {
      saveWhere(point);
      update({ near: nearParam(point) });
    } else {
      clearWhere();
      update(anywhere);
    }
  };

  return <LocationPill where={here ? where : null} stored={stored} onChange={change} onAnywhere={here ? () => update(anywhere) : null} />;
}

/** "Filters (2)" / "Sort · 1 on": opens the sheet on a phone. The words come from the server. */
export function SheetButton({ children }) {
  const { setSheet } = useFinder();
  return (
    <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm dc-filters-toggle" aria-haspopup="dialog" onClick={() => setSheet(true)}>
      {children}
    </button>
  );
}

/**
 * The events' filter bar (when, type, price, distance; "Clear filters"),
 * the same controls in a sheet on a phone, and the date picker. `count` is
 * the list's size, for the sheet's button (`capped`: 1,000+); `dates` the
 * picked days in words; `calendar` hides "when" (the month picks it).
 */
export function EventFilters({ count = null, capped = false, dates = "", calendar = false }) {
  const { filters, update, sheet, setSheet, picker, setPicker } = useFinder();
  const knowsWhere = Boolean(filters.near);
  const where = nearPoint(filters.near) || ANYWHERE;
  const active = activeEventFilters(filters, calendar);
  const clearAll = () => update({ when: "", from: "", to: "", type: "", price: "", category: "", radius_km: null });
  const applyDates = (from, to) => {
    setPicker(null);
    update({ when: "", from, to });
  };

  const picking = <DatePicker key={`${filters.from}|${filters.to}`} filters={filters} where={where} from={filters.from} to={filters.to} onApply={applyDates} />;

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

  return (
    <>
      <div className="dc-filterbar" role="group" aria-label="Filters">
        {controls(false)}
        {active ? (
          <button type="button" className="dc-filterbar-clear" onClick={clearAll}>
            Clear filters
          </button>
        ) : null}
      </div>
      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        onClear={active ? clearAll : null}
        doneLabel={count === null ? "Show results" : `Show ${formatTotal(count, capped)} ${count === 1 && !capped ? "event" : "events"}`}
      >
        {controls(true)}
      </FilterSheet>
      <DateSheet open={picker === "sheet"} onClose={() => setPicker(null)}>
        {picking}
      </DateSheet>
    </>
  );
}

/** The clubs' filter bar (order and distance) and its sheet. */
export function ClubFilters({ count = null, capped = false }) {
  const { filters, update, sheet, setSheet } = useFinder();
  const knowsWhere = Boolean(filters.near);
  const active = activeClubFilters(filters);
  const clearAll = () => update({ interest: "", radius_km: null });
  const sorts = knowsWhere ? CLUB_SORT_OPTIONS : CLUB_SORT_OPTIONS.map(([v, l]) => (v === "nearby" ? [v, "Nearby · set your location first", true] : [v, l]));
  const controls = (
    <>
      <FilterSelect label="Sort by" value={filters.sort || "popular"} defaultValue="popular" options={sorts} onChange={(v) => update({ sort: v === "popular" ? "" : v })} />
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
  return (
    <>
      <div className="dc-filterbar" role="group" aria-label="Filters">
        {controls}
        {active ? (
          <button type="button" className="dc-filterbar-clear" onClick={clearAll}>
            Clear filters
          </button>
        ) : null}
      </div>
      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        onClear={active ? clearAll : null}
        doneLabel={count === null ? "Show results" : `Show ${formatTotal(count, capped)} ${count === 1 && !capped ? "club" : "clubs"}`}
      >
        {controls}
      </FilterSheet>
    </>
  );
}

/** The picked days as a chip that takes them off. */
export function DateChip({ dates }) {
  const { update } = useFinder();
  return (
    <button type="button" className="dc-chipbtn is-on dc-datechip" onClick={() => update({ from: "", to: "" })} aria-label={`Remove dates: ${dates}`}>
      <Icon name="calendar" size={14} />
      {dates}
      <Icon name="close" size={14} />
    </button>
  );
}

/** The calendar's count in the result line: "12 events in October", once the month is in. */
export function MonthCount({ month, radiusKm = null }) {
  const { monthTotal } = useFinder();
  if (monthTotal === null) return "Finding this month's events…";
  return (
    <>
      <strong>{formatCount(monthTotal)}</strong> {monthTotal === 1 ? "event" : "events"} in {monthWord(month)}
      {radiusKm ? ` within ${radiusKm} km` : ""}
    </>
  );
}

/**
 * List or calendar, and the order. `sortOptions` are [value, label,
 * disabled?] (from eventSortOptions); `hint` explains a switched-off one.
 */
export function EventTools({ calendar, sortOptions, hint = "" }) {
  const { filters, path, go, update } = useFinder();
  const setView = (next) => {
    if (next === (calendar ? "calendar" : "list")) return;
    go(hrefOf(path, { ...filters, ...(next === "calendar" ? { view: "calendar" } : {}) }));
  };
  return (
    <div className="dc-resulttools">
      <ViewToggle view={calendar ? "calendar" : "list"} onChange={setView} />
      {calendar ? null : <SortSelect value={filters.sort || "date"} options={sortOptions} onChange={(v) => update({ sort: v === "date" ? "" : v })} hint={hint} />}
    </div>
  );
}

/* ---------- more results ---------- */

const keyOf = (item) => item?.id ?? item?.slug;

/**
 * The list's later pages, a page at a time, added to the end of the grid
 * the server rendered (its cards are `children`, their ids `ids`).
 *   kind      "events" | "clubs" | "threads"
 *   total     how many the server said there are
 *   capped    the API stopped counting at `total` (1,000+): pages go on
 *             until one comes back short
 * The browser reads the API itself for these (as "Show more" on a club's
 * page does). A list about nowhere shows no distances, like the server's.
 */
export function MoreResults({ kind, ids, total, capped = false, noun, className = "dc-grid dc-grid--4", children }) {
  const finder = useFinder();
  const filters = finder?.filters || {};
  const point = nearPoint(filters.near);
  const [s, setS] = useState({ items: [], total, capped, busy: false, error: false });
  const count = useRef(ids.length);
  const seen = useRef(new Set(ids.map(String)));

  const load = (offset) => {
    if (kind === "threads") return discoverApi.threads({ offset, limit: PAGE_SIZE });
    if (kind === "clubs") return discoverApi.clubs(filters, point || ANYWHERE, { offset, limit: PAGE_SIZE });
    return discoverApi.events(filters, point || ANYWHERE, { offset, limit: PAGE_SIZE });
  };

  const loadMore = () => {
    setS((x) => ({ ...x, busy: true, error: false }));
    load(count.current).then(
      (page) => {
        count.current += page.items.length;
        const fresh = page.items.filter((i) => !seen.current.has(String(keyOf(i))));
        fresh.forEach((i) => seen.current.add(String(keyOf(i))));
        const items = point ? fresh : fresh.map((i) => (i.distance_km === null || i.distance_km === undefined ? i : { ...i, distance_km: null }));
        setS((x) => {
          const all = [...x.items, ...items];
          const shown = ids.length + all.length;
          // An empty page is the end, whatever the total said; past a capped total, so is a short one.
          const end = !page.items.length || ((page.capped || x.capped) && page.items.length < PAGE_SIZE);
          if (end) return { items: all, busy: false, error: false, total: shown, capped: false };
          return { items: all, busy: false, error: false, total: Math.max(page.total, page.capped ? 0 : shown), capped: page.capped };
        });
      },
      () => setS((x) => ({ ...x, busy: false, error: true }))
    );
  };

  const shown = ids.length + s.items.length;
  return (
    <>
      <div className={className}>
        {children}
        {s.items.map((item) =>
          kind === "threads" ? (
            <ThreadCard key={keyOf(item)} thread={item} headingLevel={2} />
          ) : kind === "clubs" ? (
            <ClubCard key={keyOf(item)} club={item} headingLevel={2} />
          ) : (
            <EventCard key={keyOf(item)} event={item} headingLevel={2} />
          )
        )}
      </div>
      <LoadMore shown={shown} total={s.total} capped={s.capped} busy={s.busy} error={s.error} onMore={loadMore} noun={noun} />
    </>
  );
}

/* ---------- the calendar ---------- */

/**
 * The month as a calendar (?view=calendar&month=YYYY-MM): the month's
 * events are read in the browser, a few pages at most; picking a day goes
 * back to the list for that day.
 */
export function EventsCalendar({ month: monthParam = "" }) {
  const { filters, path, go, setMonthTotal } = useFinder();
  const today = istDay();
  const month = monthParam || monthOf(filters.from || today);
  const where = nearPoint(filters.near) || ANYWHERE;
  const [state, setState] = useState({ status: "loading", items: [], total: 0 });
  const [attempt, setAttempt] = useState(0);
  const key = `${JSON.stringify(filters)}|${month}|${attempt}`;

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, status: "loading" }));
    setMonthTotal(null);
    discoverApi.monthEvents(filters, where, month).then(
      (page) => {
        if (!alive) return;
        setState({ status: "ready", items: page.items, total: page.total });
        setMonthTotal(monthCount(page.items, page.total, month));
      },
      () => alive && setState({ status: "error", items: [], total: 0 })
    );
    return () => {
      alive = false;
    };
    // The key is the filters, the month and the attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const showMonth = (m) => go(hrefOf(path, { ...filters, view: "calendar", month: m }));
  const showDay = (day) => {
    go(hrefOf(path, { ...filters, when: "", from: day, to: day }));
    try {
      window.scrollTo(0, 0);
    } catch {
      /* not in a browser */
    }
  };

  return <CalendarView filters={filters} where={where} month={month} items={state.items} status={state.status} onMonth={showMonth} onDay={showDay} onRetry={() => setAttempt((a) => a + 1)} />;
}
