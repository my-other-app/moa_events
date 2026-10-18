import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { parseEventsPage } = await import("@/api/parse");
const { FindEventsAt } = await import("@/test/serverlike");
const { forgetCalendarCounts } = await import("@/utils/eventcalendar");

/*
 * The dates and the calendar on find events. The list is the server's
 * (FindEventsAt renders the page again for each address, as the server
 * does); the date picker's counts and the calendar's month are read in the
 * browser, everywhere (radius 0) unless the address names a place.
 */

/** An event on a day of October 2026, at 6 PM India time. */
const ev = (id, day = 20, extra = {}) => ({
  id,
  slug: `event-${id}`,
  name: `Event ${id}`,
  starts_at: `2026-10-${String(day).padStart(2, "0")}T12:30:00Z`,
  status: "upcoming",
  has_fee: false,
  going: 3,
  club: { id: 1, name: "Circuit Society", slug: "circuit-society" },
  location_name: "COEP, Pune",
  ...extra,
});

const COUNTS = { "2026-10": { "2026-10-17": 5, "2026-10-20": 1, "2026-10-21": 1, "2026-10-22": 1 }, "2026-11": { "2026-11-02": 2 } };
const MONTH_EVENTS = [
  ev(1, 17),
  ev(2, 17, { starts_at: "2026-10-17T04:30:00Z" }),
  ev(3, 17, { starts_at: "2026-10-17T14:30:00Z" }),
  ev(4, 17, { starts_at: "2026-10-17T15:30:00Z" }),
  // On for three days.
  ev(5, 20, { name: "Robotics Week", ends_at: "2026-10-22T12:00:00Z" }),
  ev(6, 3, { status: "ended" }),
];

const WHERE_NONE = { source: "none", lat: null, lng: null };
const WHERE_PUNE = { city: "Pune", source: "ip", lat: 18.52, lng: 73.86 };

/** What the browser reads: the calendar's counts and a month's events. */
function api({ calendar = true } = {}) {
  get.mockImplementation(async (url, config) => {
    const p = config.params;
    if (url === "/api/v1/discover/calendar") {
      if (!calendar) throw Object.assign(new Error("404"), { response: { status: 404 } });
      return { data: { month: p.month, days: COUNTS[p.month] || {} } };
    }
    if (p.from && p.to && p.from !== p.to) return { data: { items: MONTH_EVENTS, total: MONTH_EVENTS.length, where: WHERE_NONE } };
    return { data: { items: [ev(1), ev(2)], total: 2, where: WHERE_NONE } };
  });
}

/** What the server reads for each address: the first page. */
let page;
const serverPage = ({ where = WHERE_NONE } = {}) => vi.fn((state) => parseEventsPage({ items: [ev(1), ev(2)], total: 2, where: state.near ? where : WHERE_NONE }));

const show = (path, opts) => {
  page = serverPage(opts);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events" element={<FindEventsAt page={page} />} />
      </Routes>
    </MemoryRouter>
  );
};

const search = () => screen.getByTestId("search").textContent;
const eventCalls = () => get.mock.calls.filter(([url]) => url === "/api/v1/discover/events").map(([, c]) => c.params);
const lastEventsParams = () => eventCalls().at(-1);
const lastServerFilters = () => page.mock.calls.at(-1)[0].filters;

const openPicker = async () => {
  fireEvent.change(screen.getByLabelText("When"), { target: { value: "pick" } });
  return screen.findByRole("dialog", { name: "Pick dates" });
};

beforeEach(() => {
  get.mockReset();
  forgetCalendarCounts();
  localStorage.clear();
  window.scrollTo = vi.fn();
  // Saturday 17 October 2026, 11:30 in India.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-17T06:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  delete window.matchMedia;
});

describe("picking dates", () => {
  it("shows a Monday-first month with a dot on the days that have events, and writes a span to the address", async () => {
    api();
    show("/events?when=today&type=online");
    expect(await screen.findByRole("link", { name: "Event 2" })).toBeInTheDocument();

    const pop = await openPicker();
    const grid = within(pop).getByRole("grid", { name: "October 2026" });
    expect(within(grid).getAllByRole("columnheader").map((h) => h.getAttribute("aria-label"))).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    // 1 October 2026 is a Thursday: three empty cells first.
    const firstWeek = within(within(grid).getAllByRole("row")[1]).getAllByRole("gridcell");
    expect(firstWeek.map((c) => c.textContent)).toEqual(["", "", "", "1", "2", "3", "4"]);
    expect(within(grid).getAllByRole("button")).toHaveLength(31);

    // The counts come with the page's filters (not "when"), and put a dot on those days.
    const today = await within(grid).findByRole("button", { name: "Saturday, 17 October 2026, today, 5 events" });
    expect(get).toHaveBeenCalledWith("/api/v1/discover/calendar", { params: { month: "2026-10", type: "online", radius_km: 0 }, skipAuth: true });
    expect(today.querySelector(".dc-dp-dot")).not.toBeNull();
    expect(within(grid).getByRole("button", { name: "Sunday, 18 October 2026" }).querySelector(".dc-dp-dot")).toBeNull();
    expect(within(grid).getByRole("button", { name: "Tuesday, 20 October 2026, 1 event" })).toBeInTheDocument();
    // It opens on today, ready for the keyboard.
    expect(today).toHaveFocus();
    expect(today).toHaveAttribute("tabindex", "0");

    // A first day, then a last.
    fireEvent.click(today);
    expect(within(pop).getByText(/17 Oct — now pick the last day/)).toBeInTheDocument();
    fireEvent.click(within(grid).getByRole("button", { name: /^Saturday, 24 October 2026/ }));
    expect(within(pop).getByText("17–24 Oct · 8 days")).toBeInTheDocument();
    const selected = within(grid)
      .getAllByRole("gridcell")
      .filter((c) => c.getAttribute("aria-selected") === "true")
      .map((c) => c.textContent);
    expect(selected).toEqual(["17", "18", "19", "20", "21", "22", "23", "24"]);

    fireEvent.click(within(pop).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(search()).toBe("?from=2026-10-17&to=2026-10-24&type=online"));
    expect(screen.queryByRole("dialog", { name: "Pick dates" })).toBeNull();
    expect(lastServerFilters()).toMatchObject({ from: "2026-10-17", to: "2026-10-24", type: "online", when: "" });

    // The span shows as the filter's value and as a chip that takes it off.
    expect(screen.getByLabelText("When")).toHaveDisplayValue("17–24 Oct");
    const chip = screen.getByRole("button", { name: "Remove dates: 17–24 Oct" });
    expect(chip).toHaveTextContent("17–24 Oct");
    expect(screen.getByRole("button", { name: /Filters \(2\)/ })).toBeInTheDocument();
    fireEvent.click(chip);
    await waitFor(() => expect(search()).toBe("?type=online"));

    // A preset puts the span away.
    fireEvent.change(screen.getByLabelText("When"), { target: { value: "this_week" } });
    await waitFor(() => expect(search()).toBe("?when=this_week&type=online"));
  });

  it("moves by day, week and month with the keyboard, and picks with Enter: one day is a span of one", async () => {
    api();
    const user = userEvent.setup();
    show("/events");
    await screen.findByRole("link", { name: "Event 1" });
    const pop = await openPicker();
    const focused = () => document.activeElement.getAttribute("aria-label");
    expect(focused()).toMatch(/^Saturday, 17 October 2026/);

    await user.keyboard("{ArrowRight}");
    expect(focused()).toMatch(/^Sunday, 18 October 2026/);
    await user.keyboard("{ArrowDown}");
    expect(focused()).toMatch(/^Sunday, 25 October 2026/);
    await user.keyboard("{Home}");
    expect(focused()).toMatch(/^Monday, 19 October 2026/);
    await user.keyboard("{End}");
    expect(focused()).toMatch(/^Sunday, 25 October 2026/);
    // Past the end of the month, the month turns.
    await user.keyboard("{ArrowDown}");
    expect(focused()).toMatch(/^Sunday, 1 November 2026/);
    expect(within(pop).getByRole("grid", { name: "November 2026" })).toBeInTheDocument();
    await waitFor(() => expect(within(pop).getByRole("button", { name: "Monday, 2 November 2026, 2 events" })).toBeInTheDocument());
    await user.keyboard("{PageUp}");
    expect(focused()).toMatch(/^Thursday, 1 October 2026/);
    await user.keyboard("{PageDown}{ArrowLeft}{ArrowUp}");
    expect(focused()).toMatch(/^Saturday, 24 October 2026/);
    // Only the focused day is in the tab order.
    expect(within(pop).getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0")).toHaveLength(1);

    await user.keyboard("{Enter}{Enter}");
    expect(within(pop).getByText("24 Oct")).toBeInTheDocument();
    await user.click(within(pop).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(search()).toBe("?from=2026-10-24&to=2026-10-24"));
    expect(screen.getByRole("button", { name: "Remove dates: 24 Oct" })).toBeInTheDocument();
  });

  it("closes on Escape and gives focus back to the filter; works without counts when the API has none", async () => {
    api({ calendar: false });
    show("/events");
    await screen.findByRole("link", { name: "Event 1" });
    const pop = await openPicker();
    const grid = within(pop).getByRole("grid", { name: "October 2026" });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/discover/calendar", expect.anything()));
    expect(grid.querySelector(".dc-dp-dot")).toBeNull();
    expect(within(grid).getByRole("button", { name: "Saturday, 17 October 2026, today" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Pick dates" })).toBeNull();
    await waitFor(() => expect(screen.getByLabelText("When")).toHaveFocus());
  });

  it("opens as a sheet from the filters on a phone", async () => {
    api();
    show("/events");
    await screen.findByRole("link", { name: "Event 1" });
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const sheet = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.change(within(sheet).getByLabelText("When"), { target: { value: "pick" } });
    const dates = await screen.findByRole("dialog", { name: "Pick dates" });
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
    expect(dates).toHaveClass("dc-sheet");
    fireEvent.click(within(dates).getByRole("button", { name: /^Tuesday, 20 October 2026/ }));
    fireEvent.click(within(dates).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(search()).toBe("?from=2026-10-20&to=2026-10-20"));
  });
});

describe("the calendar view", () => {
  it("toggles in the address, names up to three events a day with +N more, and a day opens the list for it", async () => {
    api();
    show("/events?type=online&sort=popular");
    await screen.findByRole("link", { name: "Event 1" });
    const toggle = screen.getByRole("group", { name: "View" });
    expect(within(toggle).getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(toggle).getByRole("button", { name: "Calendar" }));
    await waitFor(() => expect(search()).toBe("?type=online&sort=popular&view=calendar"));
    expect(within(toggle).getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-pressed", "true");
    // The month's events, 48 at a time, in date order whatever the list's order was, everywhere.
    await waitFor(() => expect(lastEventsParams()).toEqual({ from: "2026-10-01", to: "2026-10-31", type: "online", radius_km: 0, offset: 0, limit: 48 }));

    const table = await screen.findByRole("table", { name: "October 2026" });
    // No "When" and no order while it's a calendar.
    expect(screen.queryByLabelText("When")).toBeNull();
    expect(screen.queryByLabelText("Sort by")).toBeNull();

    const cellOf = (name) => within(table).getByRole("button", { name }).closest("td");
    const today = await waitFor(() => cellOf("Saturday, 17 October 2026, today: 5 events. Show this day."));
    const names = within(today).getAllByRole("link");
    // In starting order, three of them, each to its page.
    expect(names.map((a) => a.textContent)).toEqual(["10 AMEvent 2", "6 PMEvent 1", "8 PMEvent 3"]);
    expect(names[0]).toHaveAttribute("href", "/events/event-2");
    // Five that day by the counts, three named.
    expect(within(today).getByRole("button", { name: "2 more on Saturday, 17 October 2026" })).toHaveTextContent("+2 more");
    // An event on for three days is on each of them.
    for (const d of ["Tuesday, 20", "Wednesday, 21", "Thursday, 22"]) {
      expect(within(cellOf(new RegExp(`^${d} October 2026`))).getByRole("link", { name: /Robotics Week/ })).toBeInTheDocument();
    }
    expect(screen.getByText("events in October", { exact: false })).toHaveTextContent("6 events in October");

    // Next month, in the address.
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(search()).toBe("?type=online&sort=popular&view=calendar&month=2026-11"));
    expect(await screen.findByRole("table", { name: "November 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "This month" }));
    await screen.findByRole("table", { name: "October 2026" });

    // A day goes back to the list, for just that day.
    fireEvent.click(await screen.findByRole("button", { name: /^Tuesday, 20 October 2026: 1 event/ }));
    await waitFor(() => expect(search()).toBe("?from=2026-10-20&to=2026-10-20&type=online&sort=popular"));
    expect(await screen.findByRole("button", { name: "Remove dates: 20 Oct" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "View" })).getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(lastServerFilters()).toMatchObject({ from: "2026-10-20", to: "2026-10-20", type: "online", sort: "popular" });
  });

  it("is an agenda grouped by day on a phone, with this month's past days folded away", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: query === "(max-width: 767px)", media: query, addEventListener() {}, removeEventListener() {} }));
    api();
    show("/events?view=calendar");
    expect(await screen.findByRole("region", { name: "Saturday, 17 October 2026, today" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    const days = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.querySelector(".dc-sr").textContent);
    expect(days()).toEqual(["Saturday, 17 October 2026, today", "Tuesday, 20 October 2026", "Wednesday, 21 October 2026", "Thursday, 22 October 2026"]);
    const sat = screen.getByRole("region", { name: /Saturday, 17 October 2026/ });
    expect(within(sat).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/events/event-2", "/events/event-1", "/events/event-3", "/events/event-4"]);
    expect(sat.querySelector(".dc-agday-today")).toHaveTextContent("Today");
    // 5 by the counts, four here: one more, on the list for that day.
    fireEvent.click(within(sat).getByRole("button", { name: "+1 more on Sat 17 Oct" }));
    await waitFor(() => expect(search()).toBe("?from=2026-10-17&to=2026-10-17"));
  });

  it("unfolds the month's earlier days on a phone", async () => {
    window.matchMedia = vi.fn((query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }));
    api();
    show("/events?view=calendar");
    fireEvent.click(await screen.findByRole("button", { name: /Earlier this month · 1 day/ }));
    expect(screen.getByRole("region", { name: "Saturday, 3 October 2026" })).toBeInTheDocument();
  });
});

describe("the order", () => {
  it("reads as a dropdown, offers relevance only with words, and distance only once the place is known", async () => {
    api();
    const { unmount } = show("/events");
    await screen.findByRole("link", { name: "Event 1" });
    const sort = screen.getByLabelText("Sort by");
    expect(sort.closest(".dc-sort")).toHaveTextContent("Sort: Date");
    const options = () => within(screen.getByLabelText("Sort by")).getAllByRole("option");
    expect(options().map((o) => o.value)).toEqual(["date", "distance", "popular"]);
    const distance = within(sort).getByRole("option", { name: /Distance/ });
    expect(distance).toBeDisabled();
    expect(distance).toHaveTextContent("Distance · set your location first");
    expect(sort).toHaveAccessibleDescription(/set your location/);
    fireEvent.change(sort, { target: { value: "popular" } });
    await waitFor(() => expect(search()).toBe("?sort=popular"));
    expect(screen.getByLabelText("Sort by").closest(".dc-sort")).toHaveTextContent("Sort: Popular");
    unmount();

    // With words, relevance; with a place in the address, distance.
    api();
    show("/events?q=robots&near=18.52,73.86", { where: WHERE_PUNE });
    await screen.findByRole("link", { name: "Event 1" });
    expect(within(screen.getByLabelText("Sort by")).getByRole("option", { name: "Distance" })).toBeEnabled();
    expect(options().map((o) => o.value)).toEqual(["relevance", "date", "distance", "popular"]);
    expect(screen.getByLabelText("Sort by")).not.toHaveAccessibleDescription();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "relevance" } });
    await waitFor(() => expect(lastServerFilters()).toMatchObject({ q: "robots", sort: "relevance" }));
  });

  it("forgets relevance when the words go, and distance without a place", async () => {
    api();
    show("/events?sort=relevance");
    await screen.findByRole("link", { name: "Event 1" });
    expect(screen.getByLabelText("Sort by")).toHaveValue("date");
    expect(lastServerFilters()).toMatchObject({ sort: "" });
    cleanup();
    show("/events?sort=distance&radius_km=25");
    expect(screen.getByLabelText("Sort by")).toHaveValue("date");
    expect(lastServerFilters()).toMatchObject({ sort: "", radius_km: null });
  });
});
