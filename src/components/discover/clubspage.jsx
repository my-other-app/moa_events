import { Link } from "@/lib/router";
import { filtersToSearch } from "@/api/parse";
import { activeClubFilters } from "@/seo/listings";
import { formatCount, formatTotal } from "@/utils/format";
import { EmptyState } from "./bits";
import { ClubCard } from "./clubcard";
import { ClubFilters, FilterLink, Finder, FinderPlace, FinderSearchBox, MoreResults, Results, SheetButton } from "./finderislands";
import Icon from "./icons";

/**
 * Find clubs: by name, by interest, nearest or most followed. Filters live
 * in the address (q, interest, sort, radius_km, near). Rendered on the
 * server for the address (src/app/clubs/page.jsx) with the first page; the
 * islands change the address and add later pages.
 *
 *   state     clubsPageState(params): {filters, near}
 *   page      the first page (parseClubsPage, images stable): {items, total, where, interests}
 *   heading   the <h1> (clubsHead)
 */
export function ClubsView({ state, page, heading }) {
  const { filters } = state;
  const hrefFor = (patch) => {
    const search = filtersToSearch({ ...filters, ...patch }).toString();
    return search ? `/clubs?${search}` : "/clubs";
  };
  const active = activeClubFilters(filters);
  const interests =
    filters.interest && !page.interests.some((i) => String(i.id) === filters.interest)
      ? [...page.interests, { id: filters.interest, name: "Chosen interest", clubs: null }]
      : page.interests;

  let results;
  if (!page.items.length) {
    results = (
      <EmptyState title="No clubs match" message={active || filters.q ? "Try another interest, a wider distance or a shorter search." : "No clubs are listed here yet."}>
        {active || filters.q ? (
          <Link className="dc-btn" to="/clubs">
            Clear search and filters
          </Link>
        ) : (
          <Link className="dc-btn" to="/events">
            Browse events
          </Link>
        )}
      </EmptyState>
    );
  } else {
    results = (
      <MoreResults key={hrefFor({})} kind="clubs" ids={page.items.map((c) => c.id ?? c.slug)} total={page.total} capped={page.capped} noun="clubs">
        {page.items.map((c) => (
          <ClubCard key={c.slug || c.id} club={c} headingLevel={2} />
        ))}
      </MoreResults>
    );
  }

  return (
    <Finder path="/clubs" filters={filters}>
      <div className="dc-wrap">
        <header className="dc-findhead">
          <h1>{heading}</h1>
          <div className="dc-findhead-row">
            <FinderSearchBox label="Search clubs" placeholder="Search clubs by name" />
            <FinderPlace where={page.where} sortAsked={state.sortAsked} />
            <SheetButton>
              <Icon name="sliders" size={16} /> Sort{active ? ` · ${active} on` : ""}
            </SheetButton>
          </div>
        </header>

        <ClubFilters count={page.total} capped={page.capped} />

        {interests.length ? (
          <div className="dc-chiprow" role="group" aria-label="Interests">
            <FilterLink className={`dc-chipbtn${filters.interest ? "" : " is-on"}`} href={hrefFor({ interest: "" })} current={!filters.interest}>
              All
            </FilterLink>
            {interests.map((i) => {
              const on = filters.interest === String(i.id);
              return (
                <FilterLink key={i.id} className={`dc-chipbtn${on ? " is-on" : ""}`} href={hrefFor({ interest: on ? "" : String(i.id) })} current={on}>
                  {i.name}
                  {i.clubs !== null ? <small>{formatCount(i.clubs)}</small> : null}
                </FilterLink>
              );
            })}
          </div>
        ) : null}

        <div className="dc-resultline" aria-live="polite">
          <span>
            <strong>{formatTotal(page.total, page.capped)}</strong> {page.total === 1 && !page.capped ? "club" : "clubs"}
          </span>
        </div>

        <Results>{results}</Results>
      </div>
    </Finder>
  );
}
