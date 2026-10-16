import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/api/discover", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, discoverApi: { home: vi.fn() } };
});

const { discoverApi, parseHome } = await import("@/api/discover");
const DiscoverHome = (await import("./homepage.jsx")).default;

const event = (id, over = {}) => ({ id, name: `Event ${id}`, starts_at: "2026-10-17T12:30:00Z", status: "upcoming", has_fee: false, going: 3, ...over });

function Where() {
  const loc = useLocation();
  return <p data-testid="at">{loc.pathname + loc.search}</p>;
}

const show = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<DiscoverHome />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.scrollTo = vi.fn();
});

describe("the home page", () => {
  it("shows only the sections that have something in them", async () => {
    discoverApi.home.mockResolvedValue(
      parseHome({
        where: { city: "Pune", source: "ip", lat: 18.52, lng: 73.86 },
        near: [event(1), event(2)],
        clubs: [{ id: 5, name: "Circuit Society", slug: "circuit-society", followers: 120, upcoming_events: 2, interests: ["Robotics"] }],
        categories: [{ id: 4, name: "Tech", upcoming: 12 }],
        stats: { upcoming_events: 34, clubs: 9 },
      })
    );
    show();
    expect(await screen.findByRole("heading", { name: "Events near Pune" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clubs near you" })).toBeInTheDocument();
    // The categories sit in the hero now, one tap under the search.
    const cats = screen.getByRole("navigation", { name: "Browse by category" });
    expect(within(cats).getByRole("link", { name: /Tech/ })).toHaveAttribute("href", "/events?category=4");
    // The hero fans out the real events coming up.
    const fan = screen.getByRole("list", { name: "Coming up" });
    expect(within(fan).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/1", "/2"]);
    expect(screen.getByRole("link", { name: "See all: Events near Pune" })).toHaveAttribute("href", "/events?sort=distance");
    expect(screen.queryByRole("heading", { name: "This week" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Online events" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Popular" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "From the clubs" })).toBeNull();
    expect(screen.getByText("Near Pune")).toBeInTheDocument();
    expect(screen.getByText("upcoming events", { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Events and clubs near Pune · MyOtherApp"));
    // No location stored yet: the server guesses from the connection.
    expect(discoverApi.home).toHaveBeenCalledWith(null);
  });

  it("says something friendly when there is nothing at all", async () => {
    discoverApi.home.mockResolvedValue(parseHome({ where: { city: "Pune", source: "ip" } }));
    show();
    expect(await screen.findByRole("heading", { name: "It's quiet near Pune" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Events near/ })).toBeNull();
  });

  it("offers a retry when the page fails, and asks with the stored location", async () => {
    localStorage.setItem("moa.where", JSON.stringify({ lat: 18.52, lng: 73.86 }));
    discoverApi.home.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(parseHome({ this_week: [event(9)], where: { city: "Pune", source: "browser" } }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "This week" })).toBeInTheDocument();
    expect(discoverApi.home).toHaveBeenCalledTimes(2);
    expect(discoverApi.home).toHaveBeenLastCalledWith({ lat: 18.52, lng: 73.86 });
  });

  it("searches into find-events", async () => {
    discoverApi.home.mockResolvedValue(parseHome({ near: [event(1)] }));
    show();
    await screen.findByRole("heading", { name: "Events near you" });
    const heroSearch = screen.getByPlaceholderText("Search events or topics");
    fireEvent.change(heroSearch, { target: { value: "drones" } });
    fireEvent.submit(heroSearch.closest("form"));
    await waitFor(() => expect(screen.getByTestId("at")).toHaveTextContent("/events?q=drones"));
  });

  it("uses the browser's location when asked, and keeps the guess when it is refused", async () => {
    discoverApi.home.mockResolvedValue(parseHome({ near: [event(1)], where: { city: "Pune", source: "ip", lat: 18.5, lng: 73.8 } }));
    const getCurrentPosition = vi.fn((ok, fail) => fail({ code: 1 }));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Change location/ }));
    fireEvent.click(screen.getByRole("button", { name: /Use my location/ }));
    expect(await screen.findByText(/kept the area we guessed/)).toBeInTheDocument();
    expect(localStorage.getItem("moa.where")).toBeNull();

    getCurrentPosition.mockImplementation((ok) => ok({ coords: { latitude: 9.93123, longitude: 76.26734 } }));
    fireEvent.click(screen.getByRole("button", { name: /Use my location/ }));
    await waitFor(() => expect(discoverApi.home).toHaveBeenLastCalledWith({ lat: 9.931, lng: 76.267 }));
    expect(JSON.parse(localStorage.getItem("moa.where"))).toMatchObject({ lat: 9.931, lng: 76.267 });
  });
});
