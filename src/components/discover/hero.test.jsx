import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { parseHome } from "@/api/discover";
import { HomeHero } from "./hero";
import { NearYou } from "./homeislands";

/* The hero is rendered on the server from the home data; its search (and the place in it) is an island inside <NearYou>. */
let where;
beforeEach(() => {
  where = { source: "none" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ where, near: [], clubs: [] }))));
});
afterEach(() => vi.unstubAllGlobals());

const event = (id, over = {}) => ({
  id,
  name: `Event ${id}`,
  starts_at: "2026-10-17T12:30:00Z",
  status: "upcoming",
  has_fee: false,
  going: 3,
  category: { id: 1, name: "Workshop" },
  club: { id: 5, name: "Circuit Society", slug: "circuit-society", logo: "https://cdn.example/logo.png" },
  ...over,
});

function Where() {
  const loc = useLocation();
  return <p data-testid="at">{loc.pathname + loc.search}</p>;
}

const show = (props) =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <NearYou>
              <HomeHero {...props} />
            </NearYou>
          }
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

describe("the home hero", () => {
  it("fans out real events coming up, live first, and each one opens its page", async () => {
    where = { city: "Pune", source: "ip", lat: 18.5, lng: 73.8 };
    const data = parseHome({
      where: { city: "Pune", source: "ip" },
      this_week: [event(1), event(2, { status: "live", poster: "https://cdn.example/p2.jpg" }), event(3, { status: "ended" })],
      popular: [event(1), event(4)],
      categories: [
        { id: 2, name: "Competition", upcoming: 1 },
        { id: 1, name: "Workshop", upcoming: 6 },
      ],
      clubs: [{ id: 5, name: "Circuit Society", slug: "circuit-society", logo: "https://cdn.example/logo.png" }],
      stats: { upcoming_events: 7, clubs: 4, cities: 3 },
    });
    // The API is adding slugs; a card links by one when it is there.
    data.popular[1] = { ...data.popular[1], slug: "event-four" };
    show({ data });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find your people. Show up.");
    const fan = screen.getByRole("list", { name: "Coming up" });
    const tiles = within(fan).getAllByRole("link");
    expect(tiles.map((a) => a.getAttribute("href"))).toEqual(["/2", "/1", "/events/event-four"]);
    expect(tiles[0]).toHaveAccessibleName("Event 2, Sat, 17 Oct · 6:00 PM");
    expect(within(tiles[0]).getByText("Live now")).toBeInTheDocument();
    // A poster keeps its date badge; an event without one gets a drawn cover with the date, and no second title.
    expect(tiles[0].querySelector("img")).toHaveAttribute("src", "https://cdn.example/p2.jpg");
    expect(tiles[0].querySelector(".dc-datebadge")).toHaveTextContent("Oct17");
    expect(tiles[1].querySelector(".dc-cover")).not.toBeNull();
    expect(within(tiles[1]).getAllByText("Event 1")).toHaveLength(1);
    // Nothing that has ended.
    expect(within(fan).queryByText("Event 3")).toBeNull();

    // The live one is also one tap from the headline.
    expect(screen.getByRole("link", { name: /Live now/ })).toHaveAttribute("href", "/2");

    // Categories, busiest first.
    const cats = within(screen.getByRole("navigation", { name: "Browse by category" })).getAllByRole("link");
    expect(cats.map((a) => a.getAttribute("href"))).toEqual(["/events?category=1", "/events?category=2"]);
    expect(cats[0]).toHaveTextContent("Workshop6");

    expect(screen.getByText("upcoming events", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("cities")).toBeInTheDocument();
    // The place is the visitor's, filled in by the island.
    expect(screen.getByText("Anywhere")).toBeInTheDocument();
    expect(await screen.findByText("Near Pune")).toBeInTheDocument();
  });

  it("still sells the place when there is nothing on yet", () => {
    show({ data: parseHome({ where: { city: "Pune", source: "ip" } }) });
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Coming up" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Browse by category" })).toBeNull();
    expect(screen.queryByText("upcoming events", { exact: false })).toBeNull();
    expect(screen.queryByRole("link", { name: /Live now/ })).toBeNull();
    // The drawn covers stand in, as decoration only: no links, hidden from screen readers.
    const idle = document.querySelector(".dc-fan--idle");
    expect(idle).toHaveAttribute("aria-hidden", "true");
    expect(idle.querySelectorAll("a")).toHaveLength(0);
    expect(within(idle).getByText("Hackathons")).toBeInTheDocument();
    // Search still works.
    const box = screen.getByPlaceholderText("Search events or topics");
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(box).toHaveAccessibleName("Search events");
  });

  it("searches into find-events", async () => {
    show({ data: parseHome({}) });
    const box = screen.getByPlaceholderText("Search events or topics");
    fireEvent.change(box, { target: { value: "robots" } });
    fireEvent.submit(box.closest("form"));
    await waitFor(() => expect(screen.getByTestId("at")).toHaveTextContent("/events?q=robots"));
  });
});
