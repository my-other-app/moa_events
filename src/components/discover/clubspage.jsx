import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CLUB_SORT_OPTIONS, PAGE_SIZE, RADIUS_OPTIONS, discoverApi, filtersToSearch, readClubFilters } from "@/api/discover";
import { usePageMeta } from "@/utils/meta";
import { usePagedList } from "@/utils/paged";
import { useWhere } from "@/utils/where";
import { formatCount } from "@/utils/format";
import { SitePage } from "./chrome";
import { EmptyState, ErrorState } from "./bits";
import { ClubCard, ClubRailSkeleton } from "./clubcard";
import { FilterSelect, FilterSheet, FinderSearch, LoadMore } from "./finder";
import { LocationPill } from "./locationpill";
import Icon from "./icons";

const RADIUS_SELECT = [["", "Any distance"], ...RADIUS_OPTIONS.map((r) => [String(r), `Within ${r} km`])];

/** Find clubs: by name, by interest, nearest or most followed. Filters live in the address. */
export default function FindClubs() {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const filters = useMemo(() => readClubFilters(new URLSearchParams(search)), [search]);
  const [stored, setStored] = useWhere();
  const [sheet, setSheet] = useState(false);

  const list = usePagedList(
    (offset) => discoverApi.clubs(filters, stored, { offset, limit: PAGE_SIZE }),
    `${search}|${stored?.lat ?? ""},${stored?.lng ?? ""}`
  );

  const page = list.page;
  const where = page?.where || null;
  const knowsWhere = Boolean(stored) || (where !== null && where.lat !== null);
  const city = where?.city;
  const interests = useMemo(() => {
    const all = page?.interests || [];
    if (filters.interest && !all.some((i) => String(i.id) === filters.interest)) {
      return [...all, { id: filters.interest, name: "Chosen interest", clubs: null }];
    }
    return all;
  }, [page, filters.interest]);

  const heading = filters.q ? `Clubs matching “${filters.q}”` : city ? `Clubs near ${city}` : "Clubs on MyOtherApp";
  usePageMeta(`${heading} · MyOtherApp`, `${heading}: find clubs by interest and follow the ones you like on MyOtherApp.`);

  const update = (patch) => setParams(filtersToSearch({ ...filters, ...patch }));
  // Sorting is not a filter: clearing keeps it, and the search words.
  const clearAll = () => setParams(filtersToSearch({ q: filters.q, sort: filters.sort }));
  const active = ["interest", "radius_km"].filter((k) => filters[k]).length;

  const controls = (
    <>
      <FilterSelect
        label="Sort by"
        value={filters.sort || "popular"}
        defaultValue="popular"
        options={CLUB_SORT_OPTIONS}
        onChange={(v) => update({ sort: v === "popular" ? "" : v })}
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
    results = <ClubRailSkeleton count={8} grid />;
  } else if (list.status === "error") {
    results = <ErrorState message="We couldn't load clubs right now. Check your connection and try again." onRetry={list.retry} />;
  } else if (!list.items.length) {
    results = (
      <EmptyState title="No clubs match" message={active || filters.q ? "Try another interest, a wider distance or a shorter search." : "No clubs are listed here yet."}>
        {active || filters.q ? (
          <button type="button" className="dc-btn" onClick={() => setParams(new URLSearchParams())}>
            Clear search and filters
          </button>
        ) : (
          <Link className="dc-btn" to="/events">
            Browse events
          </Link>
        )}
      </EmptyState>
    );
  } else {
    results = (
      <>
        <div className="dc-grid dc-grid--4">
          {list.items.map((c) => (
            <ClubCard key={c.slug || c.id} club={c} headingLevel={2} />
          ))}
        </div>
        <LoadMore shown={list.items.length} total={list.total} busy={list.more.busy} error={list.more.error} onMore={list.loadMore} noun="clubs" />
      </>
    );
  }

  return (
    <SitePage>
      <div className="dc-wrap">
        <header className="dc-findhead">
          <h1>{heading}</h1>
          <div className="dc-findhead-row">
            <FinderSearch key={filters.q} initial={filters.q} label="Search clubs" placeholder="Search clubs by name" onSearch={(q) => update({ q })} />
            <LocationPill where={where} stored={stored} onChange={setStored} />
            <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm dc-filters-toggle" aria-haspopup="dialog" onClick={() => setSheet(true)}>
              <Icon name="sliders" size={16} /> Sort{active ? ` · ${active} on` : ""}
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

        {interests.length ? (
          <div className="dc-chiprow" role="group" aria-label="Interests">
            <button type="button" className="dc-chipbtn" aria-pressed={!filters.interest} onClick={() => update({ interest: "" })}>
              All
            </button>
            {interests.map((i) => {
              const on = filters.interest === String(i.id);
              return (
                <button key={i.id} type="button" className="dc-chipbtn" aria-pressed={on} onClick={() => update({ interest: on ? "" : String(i.id) })}>
                  {i.name}
                  {i.clubs !== null ? <small>{formatCount(i.clubs)}</small> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="dc-resultline" aria-live="polite">
          {list.status === "ready" ? (
            <span>
              <strong>{formatCount(list.total)}</strong> {list.total === 1 ? "club" : "clubs"}
            </span>
          ) : list.status === "loading" ? (
            <span>Finding clubs…</span>
          ) : null}
        </div>

        {results}
      </div>

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        onClear={active ? clearAll : null}
        doneLabel={list.status === "ready" ? `Show ${formatCount(list.total)} ${list.total === 1 ? "club" : "clubs"}` : "Show results"}
      >
        {controls}
      </FilterSheet>
    </SitePage>
  );
}
