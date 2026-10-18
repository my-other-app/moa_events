/**
 * For tests of the server-rendered find pages (/events, /clubs): renders
 * the page's view for the address a <MemoryRouter> is at, and again after
 * every navigation — as the server does when an island changes the
 * address. `page(state)` is what the server would have read for that state
 * (the first page of results); it is called with each state, so a test can
 * check what was asked for.
 *
 *   render(<MemoryRouter initialEntries={["/events?type=online"]}>
 *     <Routes><Route path="/events" element={<FindEventsAt page={page} />} /></Routes>
 *   </MemoryRouter>)
 *
 * The address is shown in <output data-testid="search">.
 */
import { useLocation } from "react-router-dom";
import { EventsView } from "@/components/discover/eventspage";
import { ClubsView } from "@/components/discover/clubspage";
import { clubsHead, clubsPageState, eventsHead, eventsPageState } from "@/seo/listings";

export function FindEventsAt({ page }) {
  const loc = useLocation();
  const state = eventsPageState(new URLSearchParams(loc.search));
  const data = page(state);
  const categoryName = state.filters.category ? data.categories.find((c) => String(c.id) === state.filters.category)?.name : null;
  const { heading } = eventsHead(state, { categoryName, city: state.near ? data.where.city : null });
  return (
    <>
      <EventsView state={state} page={data} heading={heading} />
      <output data-testid="search">{loc.search}</output>
    </>
  );
}

export function FindClubsAt({ page }) {
  const loc = useLocation();
  const state = clubsPageState(new URLSearchParams(loc.search));
  const data = page(state);
  const interestName = state.filters.interest ? data.interests.find((i) => String(i.id) === state.filters.interest)?.name : null;
  const { heading } = clubsHead(state, { interestName, city: state.near ? data.where.city : null });
  return (
    <>
      <ClubsView state={state} page={data} heading={heading} />
      <output data-testid="search">{loc.search}</output>
    </>
  );
}
