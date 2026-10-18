import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { parseEventsPage } = await import("@/api/parse");
const { stableCard, stablePage } = await import("@/seo/stabilize");
const { eventsHead, eventsPageState } = await import("@/seo/listings");
const { EventsView } = await import("./eventspage.jsx");
const { FindEventsAt } = await import("@/test/serverlike");
const { hydrate } = await import("@/test/hydrate");
const { LoadMore } = await import("./finder.jsx");

/*
 * Find events as the server renders it (src/app/events/page.jsx reads the
 * first page, then renders <EventsView>), with its islands working as in
 * the browser: every filter goes into the address (the server renders the
 * new list), and later pages are read in the browser. What the route asks
 * the API, and its head, are tested in src/app/_tests/listing-routes.test.js.
 */
const ev = (id, over = {}) => ({ id, slug: `event-${id}`, name: `Event ${id}`, starts_at: "2026-10-17T12:30:00Z", status: "upcoming", has_fee: true, fee: 99, going: 1, ...over });
const CATEGORIES = [
  { id: 4, name: "Tech", upcoming: 12 },
  { id: 5, name: "Music", upcoming: 3 },
];
const NOWHERE = { source: "none", lat: null, lng: null };

const firstPage = (over = {}) => stablePage(parseEventsPage({ items: [ev(1), ev(2)], total: 30, offset: 0, limit: 12, where: NOWHERE, categories: CATEGORIES, ...over }), stableCard);

const show = (path, page) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events" element={<FindEventsAt page={page} />} />
      </Routes>
    </MemoryRouter>
  );

const search = () => screen.getByTestId("search").textContent;

beforeEach(() => {
  get.mockReset();
  localStorage.clear();
  window.scrollTo = vi.fn();
});

describe("find events", () => {
  it("shows what the address asks for, and puts every filter change back in the address", async () => {
    const page = vi.fn(() => firstPage());
    show("/events?when=this_week&type=online&sort=popular", page);

    expect(screen.getByRole("heading", { level: 1, name: "Online events" })).toBeInTheDocument();
    expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ filters: expect.objectContaining({ when: "this_week", type: "online", sort: "popular" }), near: null }));
    expect(screen.getByText("30")).toBeInTheDocument();
    // The first page is in the HTML, each card a link to its event, with no distances: a list about nowhere.
    expect(screen.getByRole("link", { name: "Event 1" })).toHaveAttribute("href", "/events/event-1");
    expect(screen.queryByText(/km away/)).toBeNull();

    // A filter goes into the address; the server renders the new list.
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "free" } });
    await waitFor(() => expect(search()).toBe("?when=this_week&type=online&price=free&sort=popular"));
    expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ filters: expect.objectContaining({ price: "free" }) }));

    // The categories are links (each a page a crawler can reach), and move the list too.
    const chips = screen.getByRole("group", { name: "Categories" });
    const tech = within(chips).getByRole("link", { name: /Tech/ });
    expect(tech).toHaveAttribute("href", "/events?when=this_week&type=online&price=free&category=4&sort=popular");
    expect(within(chips).getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(tech);
    await waitFor(() => expect(search()).toBe("?when=this_week&type=online&price=free&category=4&sort=popular"));
    expect(within(screen.getByRole("group", { name: "Categories" })).getByRole("link", { name: /Tech/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { level: 1, name: "Online events" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters \(4\)/ })).toBeInTheDocument();

    // Without a place, no radius and no order by distance.
    expect(screen.queryByLabelText("Distance")).toBeNull();
    expect(within(screen.getByLabelText("Sort by")).getByRole("option", { name: /Distance/ })).toBeDisabled();

    // Clearing keeps the words and the order, and drops the filters.
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(search()).toBe("?sort=popular"));
    expect(screen.getByRole("heading", { level: 1, name: "Upcoming events" })).toBeInTheDocument();
  });

  it("searches by words, into the address", async () => {
    show("/events?category=4", () => firstPage());
    expect(screen.getByRole("heading", { level: 1, name: "Tech events" })).toBeInTheDocument();
    const box = screen.getByPlaceholderText("Search events or topics");
    fireEvent.change(box, { target: { value: "robots" } });
    fireEvent.submit(box.closest("form"));
    await waitFor(() => expect(search()).toBe("?q=robots&category=4"));
    expect(screen.getByRole("heading", { level: 1, name: "Events matching “robots”" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search events or topics")).toHaveValue("robots");
  });

  it("puts a place kept in this browser into the address, then offers a radius and the nearest first", async () => {
    localStorage.setItem("moa.where", JSON.stringify({ lat: 9.93, lng: 76.27 }));
    const page = vi.fn((state) => firstPage(state.near ? { where: { city: "Kochi", source: "browser", lat: 9.93, lng: 76.27 }, items: [ev(1, { distance_km: 2.4 })] } : {}));
    show("/events?type=in_person", page);
    await waitFor(() => expect(search()).toBe("?type=in_person&near=9.93%2C76.27"));
    expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ near: { lat: 9.93, lng: 76.27 } }));
    expect(screen.getByRole("heading", { level: 1, name: "Events near Kochi" })).toBeInTheDocument();
    expect(screen.getByText("2.4 km away")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Distance"), { target: { value: "25" } });
    await waitFor(() => expect(search()).toBe("?type=in_person&radius_km=25&near=9.93%2C76.27"));
    expect(screen.getByText(/within 25 km/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "distance" } });
    await waitFor(() => expect(search()).toBe("?type=in_person&sort=distance&radius_km=25&near=9.93%2C76.27"));

    // Forgetting the place takes it, its radius and its order out of the address.
    fireEvent.click(screen.getByRole("button", { name: /Change location/ }));
    fireEvent.click(screen.getByRole("button", { name: "Forget my location" }));
    await waitFor(() => expect(search()).toBe("?type=in_person"));
    expect(localStorage.getItem("moa.where")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "In-person events" })).toBeInTheDocument();
  });

  it("keeps the order by distance a link asked for, once a kept place is in the address", async () => {
    localStorage.setItem("moa.where", JSON.stringify({ lat: 9.93, lng: 76.27 }));
    show("/events?sort=distance", (state) => firstPage(state.near ? { where: { lat: 9.93, lng: 76.27, source: "browser" } } : {}));
    await waitFor(() => expect(search()).toBe("?sort=distance&near=9.93%2C76.27"));
    expect(screen.getByLabelText("Sort by")).toHaveValue("distance");
  });

  it("offers everywhere instead of a place that came with the link", async () => {
    show("/events?near=18.52,73.857", (state) => firstPage(state.near ? { where: { city: "Pune", source: "browser", lat: 18.52, lng: 73.857 } } : {}));
    expect(screen.getByRole("heading", { level: 1, name: "Events near Pune" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Change location/ }));
    expect(screen.getByText("Showing what is near Pune.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show everywhere" }));
    await waitFor(() => expect(search()).toBe(""));
  });

  it("reads later pages in the browser, everywhere, and adds them to the list", async () => {
    get.mockResolvedValueOnce({ data: { items: [ev(13, { distance_km: 3 }), ev(14), ev(2)], total: 14 } });
    show("/events?q=robots", () => firstPage({ items: Array.from({ length: 12 }, (_, i) => ev(i + 1)), total: 14 }));
    expect(screen.getByText("Showing 12 of 14")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Event 14" })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/events", { params: { q: "robots", radius_km: 0, offset: 12, limit: 12 }, skipAuth: true });
    // One already shown isn't shown twice, and nowhere has no distances.
    expect(screen.getAllByRole("link", { name: "Event 2" })).toHaveLength(1);
    expect(screen.queryByText(/km away/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText("That's all 14 events.")).toBeInTheDocument();
  });

  it("says so when a later page fails, and tries again", async () => {
    get.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: { items: [ev(13)], total: 13 } });
    show("/events", () => firstPage({ items: Array.from({ length: 12 }, (_, i) => ev(i + 1)), total: 13 }));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load more just now.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Event 13" })).toBeInTheDocument();
  });

  it("says 1,000+ when the API stopped counting, and loads on past it until a page comes back short", async () => {
    const full = (from) => Array.from({ length: 12 }, (_, i) => ev(from + i));
    get
      .mockResolvedValueOnce({ data: { items: full(13), total: 1000, total_capped: true } })
      .mockResolvedValueOnce({ data: { items: [ev(25), ev(26), ev(27)], total: 1000, total_capped: true } });
    show("/events", () => firstPage({ items: full(1), total: 1000, total_capped: true }));
    expect(document.querySelector(".dc-resultline")).toHaveTextContent("1,000+ events");
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(within(screen.getByRole("dialog", { name: "Filters" })).getByRole("button", { name: "Show 1,000+ events" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("Showing 12 of 1,000+")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Showing 24 of 1,000+")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("That's all 27 events.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("explains an empty result, with a way out", () => {
    show("/events?price=paid", () => firstPage({ items: [], total: 0 }));
    const empty = screen.getByRole("heading", { name: "No events match" });
    expect(within(empty.parentElement).getByRole("link", { name: "Clear search and filters" })).toHaveAttribute("href", "/events");
  });

  it("hydrates the server's HTML without a mismatch, even with a place kept in this browser", async () => {
    const state = eventsPageState(new URLSearchParams("type=online"));
    const page = firstPage();
    const { problems, html, unmount } = await hydrate(
      <MemoryRouter initialEntries={["/events?type=online"]}>
        <EventsView state={state} page={page} heading={eventsHead(state).heading} />
      </MemoryRouter>,
      { inBrowser: () => localStorage.setItem("moa.where", JSON.stringify({ lat: 9.93, lng: 76.27 })) }
    );
    expect(html).toContain("Event 1");
    expect(problems.filter((p) => /hydrat|did not match|mismatch/i.test(p))).toEqual([]);
    unmount();
  });
});

describe("Load more", () => {
  it("keeps going at and past a total the API stopped counting at", () => {
    const { rerender } = render(<LoadMore shown={1000} total={1000} capped busy={false} error={false} onMore={() => {}} noun="events" />);
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    expect(screen.getByText("Showing 1,000")).toBeInTheDocument();
    rerender(<LoadMore shown={1012} total={1000} capped busy={false} error={false} onMore={() => {}} noun="events" />);
    expect(screen.getByText("Showing 1,012")).toBeInTheDocument();
    // A counted total stops it, as before.
    rerender(<LoadMore shown={1000} total={1000} busy={false} error={false} onMore={() => {}} noun="events" />);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText("That's all 1000 events.")).toBeInTheDocument();
  });
});
