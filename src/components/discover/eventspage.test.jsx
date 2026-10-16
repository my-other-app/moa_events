import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const FindEvents = (await import("./eventspage.jsx")).default;

const ev = (id) => ({ id, name: `Event ${id}`, starts_at: "2026-10-17T12:30:00Z", status: "upcoming", has_fee: true, fee: 99, going: 1 });

function At() {
  const loc = useLocation();
  return <output data-testid="search">{loc.search}</output>;
}

const show = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/events"
          element={
            <>
              <FindEvents />
              <At />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

const lastParams = () => get.mock.calls[get.mock.calls.length - 1][1].params;

beforeEach(() => {
  get.mockReset();
  localStorage.clear();
  window.scrollTo = vi.fn();
});

describe("find events", () => {
  it("asks for what the address says, and puts every filter change back in the address", async () => {
    get.mockImplementation(async () => ({
      data: {
        items: [ev(1), ev(2)],
        total: 30,
        offset: 0,
        limit: 12,
        where: { city: "Pune", source: "ip", lat: 18.52, lng: 73.86 },
        categories: [{ id: 4, name: "Tech", upcoming: 12 }, { id: 5, name: "Music", upcoming: 3 }],
      },
    }));
    show("/events?when=this_week&type=online");

    expect(await screen.findByRole("heading", { level: 1, name: "Online events" })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/events", { params: { when: "this_week", type: "online", offset: 0, limit: 12 }, skipAuth: true });
    expect(screen.getByText("30")).toBeInTheDocument();

    // A filter goes into the address, and the list asks again.
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "free" } });
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent("?when=this_week&type=online&price=free"));
    await waitFor(() => expect(lastParams()).toEqual({ when: "this_week", type: "online", price: "free", offset: 0, limit: 12 }));

    // A category chip, then sorting by distance; the server's IP guess is enough to offer a radius.
    fireEvent.click(await screen.findByRole("button", { name: /Tech/ }));
    await waitFor(() => expect(lastParams()).toMatchObject({ category: "4" }));
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "distance" } });
    fireEvent.change(await screen.findByLabelText("Distance"), { target: { value: "25" } });
    await waitFor(() =>
      expect(screen.getByTestId("search")).toHaveTextContent("?when=this_week&type=online&price=free&category=4&sort=distance&radius_km=25")
    );
    await waitFor(() => expect(lastParams()).toMatchObject({ sort: "distance", radius_km: 25 }));

    // Clearing keeps the search words and the order, and drops the filters.
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent("?sort=distance"));
  });

  it("loads the next page after the first, and sends the stored location", async () => {
    localStorage.setItem("moa.where", JSON.stringify({ lat: 9.93, lng: 76.27 }));
    get
      .mockResolvedValueOnce({ data: { items: Array.from({ length: 12 }, (_, i) => ev(i + 1)), total: 14, where: { city: "Kochi", source: "browser", lat: 9.93, lng: 76.27 } } })
      .mockResolvedValueOnce({ data: { items: [ev(13), ev(14)], total: 14 } });
    show("/events?q=robots");
    expect(await screen.findByRole("heading", { level: 1, name: "Events matching “robots”" })).toBeInTheDocument();
    expect(get.mock.calls[0][1].params).toEqual({ q: "robots", lat: 9.93, lng: 76.27, offset: 0, limit: 12 });
    expect(screen.getByText("Showing 12 of 14")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Event 14" })).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ offset: 12 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByPlaceholderText("Search events or topics")).toHaveValue("robots");
  });

  it("explains an empty result and recovers from a failure", async () => {
    get.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: { items: [], total: 0, where: { source: "none" } } });
    show("/events?price=paid");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    const empty = await screen.findByRole("heading", { name: "No events match" });
    expect(within(empty.parentElement).getByRole("button", { name: "Clear search and filters" })).toBeInTheDocument();
    // Without any location the radius is not offered.
    expect(screen.queryByLabelText("Distance")).toBeNull();
  });
});
