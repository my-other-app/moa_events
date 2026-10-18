import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { parseHome } from "@/api/parse";
import { stableHome } from "@/seo/stabilize";
import { everyoneHome } from "@/utils/home";
import { hydrate } from "@/test/hydrate";
import { HomeView } from "./homepage.jsx";

/*
 * The home page as the server renders it (src/app/page.jsx: the same for
 * everyone, statically regenerated), with its islands: near you is asked
 * of /api/near once the page is in the browser. The route is tested in
 * src/app/_tests/home-route.test.js, /api/near in near-route.test.js.
 */
const event = (id, over = {}) => ({ id, slug: `event-${id}`, name: `Event ${id}`, starts_at: "2026-10-17T12:30:00Z", status: "upcoming", has_fee: false, going: 3, ...over });
const club = (id, over = {}) => ({ id, name: `Club ${id}`, slug: `club-${id}`, followers: 120, upcoming_events: 2, interests: ["Robotics"], ...over });

const everyone = (over = {}) =>
  stableHome(
    everyoneHome(
      parseHome({
        this_week: [event(1), event(2)],
        online: [event(3, { is_online: true })],
        popular: [event(2), event(4)],
        clubs: [club(5), club(6)],
        categories: [{ id: 4, name: "Tech", upcoming: 12 }],
        threads: [{ id: 77, club: { id: 5, name: "Club 5", slug: "club-5" }, body: "Robots on Friday!", likes: 3, comments: 1, created_at: "2026-10-16T10:00:00Z" }],
        stats: { upcoming_events: 34, clubs: 9, cities: 3 },
        ...over,
      })
    )
  );

const NOWHERE = { where: { source: "none" }, near: [], clubs: [] };
let answers;
const nearFetch = vi.fn(async (url) => {
  const body = typeof answers === "function" ? answers(url) : answers;
  if (body instanceof Error) throw body;
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
});

function Where() {
  const loc = useLocation();
  return <p data-testid="at">{loc.pathname + loc.search}</p>;
}

const show = (data = everyone()) =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomeView data={data} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  answers = NOWHERE;
  vi.stubGlobal("fetch", nearFetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("the home page", () => {
  it("shows what's on for everyone, a section only when it has something", async () => {
    show(everyone({ online: [] }));
    for (const name of ["This week", "Popular clubs", "Popular", "From the clubs"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Online events" })).toBeNull();
    expect(screen.getByRole("link", { name: "See all: This week" })).toHaveAttribute("href", "/events?when=this_week");
    expect(screen.getByRole("link", { name: "See all: Popular" })).toHaveAttribute("href", "/events?sort=popular");
    // Every picture on a stable address, never an expiring link.
    expect(within(screen.getByRole("heading", { name: "From the clubs" }).closest("section")).getByRole("link", { name: "Club 5" })).toHaveAttribute("href", "/clubs/club-5");
    // Near you: placed by nothing here, so nothing shows once the answer is in.
    await waitFor(() => expect(nearFetch).toHaveBeenCalledWith("/api/near", expect.anything()));
    await waitFor(() => expect(screen.queryByLabelText("Finding events near you")).toBeNull());
    expect(screen.queryByRole("heading", { name: /Events near/ })).toBeNull();
    expect(screen.queryByText(/km away/)).toBeNull();
  });

  it("fills in the events near the visitor, and the clubs nearest them", async () => {
    answers = {
      where: { city: "Pune", region: "Maharashtra", lat: 18.52, lng: 73.86, source: "ip" },
      near: [event(8, { distance_km: 2.5, location_name: "COEP" }), event(9)],
      clubs: [club(7, { distance_km: 1.2 }), club(5, { distance_km: 9 })],
    };
    show();
    // A skeleton holds the place while it is asked.
    expect(screen.getByLabelText("Finding events near you")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByRole("heading", { name: "Events near Pune" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all: Events near Pune" })).toHaveAttribute("href", "/events?sort=distance&near=18.52%2C73.86");
    expect(screen.getByText("· 2.5 km away")).toBeInTheDocument();
    const clubs = screen.getByRole("heading", { name: "Clubs near Pune" }).closest("section");
    expect(within(clubs).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Club 7", "Club 5"]);
    expect(screen.getByText("Near Pune")).toBeInTheDocument();
  });

  it("keeps the popular clubs when none of the nearest has a place", async () => {
    answers = { where: { city: "Pune", lat: 18.52, lng: 73.86, source: "ip" }, near: [], clubs: [club(7)] };
    show();
    await screen.findByText("Near Pune");
    expect(screen.getByRole("heading", { name: "Popular clubs" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Events near/ })).toBeNull();
  });

  it("asks with the place kept in this browser, and again when a place is shared", async () => {
    localStorage.setItem("moa.where", JSON.stringify({ lat: 18.52, lng: 73.86 }));
    answers = (url) => (url.includes("lat=") ? { where: { lat: 18.52, lng: 73.86, source: "browser" }, near: [event(1)], clubs: [] } : NOWHERE);
    show();
    expect(await screen.findByRole("heading", { name: "Events near you" })).toBeInTheDocument();
    expect(nearFetch).toHaveBeenCalledTimes(1);
    expect(nearFetch).toHaveBeenCalledWith("/api/near?lat=18.52&lng=73.86", expect.anything());

    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 9.93123, longitude: 76.26734 } }));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: /Change location/ }));
    fireEvent.click(screen.getByRole("button", { name: /Use my location/ }));
    await waitFor(() => expect(nearFetch).toHaveBeenLastCalledWith("/api/near?lat=9.931&lng=76.267", expect.anything()));
    expect(JSON.parse(localStorage.getItem("moa.where"))).toMatchObject({ lat: 9.931, lng: 76.267 });

    // Forgetting it asks for the guess again.
    fireEvent.click(screen.getByRole("button", { name: /Change location/ }));
    fireEvent.click(screen.getByRole("button", { name: "Forget my location" }));
    await waitFor(() => expect(nearFetch).toHaveBeenLastCalledWith("/api/near", expect.anything()));
    expect(localStorage.getItem("moa.where")).toBeNull();
  });

  it("keeps the guess when the browser won't share a location", async () => {
    answers = { where: { city: "Pune", source: "ip", lat: 18.5, lng: 73.8 }, near: [event(1)], clubs: [] };
    const getCurrentPosition = vi.fn((ok, fail) => fail({ code: 1 }));
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Change location \(now near pune\)/ }));
    expect(screen.getByText("We guessed Pune from your connection.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Use my location/ }));
    expect(await screen.findByText(/kept the area we guessed/)).toBeInTheDocument();
    expect(localStorage.getItem("moa.where")).toBeNull();
    expect(nearFetch).toHaveBeenCalledTimes(1);
  });

  it("leaves near you out when it can't be had", async () => {
    answers = new TypeError("offline");
    show();
    await waitFor(() => expect(screen.queryByLabelText("Finding events near you")).toBeNull());
    expect(screen.queryByRole("heading", { name: /Events near/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "Popular clubs" })).toBeInTheDocument();
  });

  it("searches into find-events", async () => {
    show();
    const box = screen.getByPlaceholderText("Search events or topics");
    fireEvent.change(box, { target: { value: "drones" } });
    fireEvent.submit(box.closest("form"));
    await waitFor(() => expect(screen.getByTestId("at")).toHaveTextContent("/events?q=drones"));
  });

  it("says something friendly when there is nothing at all", () => {
    show(stableHome(everyoneHome(parseHome({}))));
    expect(screen.getByRole("heading", { name: "It's quiet out here" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse all events" })).toHaveAttribute("href", "/events");
  });

  it("is the same HTML for everyone, and hydrates without a mismatch for a visitor with a place kept", async () => {
    const element = (
      <MemoryRouter initialEntries={["/"]}>
        <HomeView data={everyone()} />
      </MemoryRouter>
    );
    const { html, problems, unmount } = await hydrate(element, { inBrowser: () => localStorage.setItem("moa.where", JSON.stringify({ lat: 18.52, lng: 73.86 })) });
    // On the server: everything but near you, which is a skeleton.
    expect(html).toContain("This week");
    expect(html).toContain('aria-label="Finding events near you"');
    expect(html).not.toMatch(/Events near/);
    expect(problems.filter((p) => /hydrat|did not match|mismatch/i.test(p))).toEqual([]);
    // In the browser, once hydrated: one question, with the kept place.
    await waitFor(() => expect(nearFetch).toHaveBeenCalledTimes(1));
    expect(nearFetch).toHaveBeenCalledWith("/api/near?lat=18.52&lng=73.86", expect.anything());
    unmount();
  });
});
