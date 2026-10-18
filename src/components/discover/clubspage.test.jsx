import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { parseClubsPage } = await import("@/api/parse");
const { FindClubsAt } = await import("@/test/serverlike");

/* Find clubs as the server renders it, with its islands (see eventspage.test.jsx). */
const club = (id, over = {}) => ({ id, slug: `club-${id}`, name: `Club ${id}`, followers: 10 * id, upcoming_events: 1, interests: ["Robotics"], ...over });
const INTERESTS = [
  { id: 12, name: "Robotics", clubs: 4 },
  { id: 13, name: "Music", clubs: 2 },
];
const firstPage = (over = {}) => parseClubsPage({ items: [club(1), club(2)], total: 20, where: { source: "none" }, interests: INTERESTS, ...over });

const show = (path, page) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clubs" element={<FindClubsAt page={page} />} />
      </Routes>
    </MemoryRouter>
  );
const search = () => screen.getByTestId("search").textContent;

beforeEach(() => {
  get.mockReset();
  localStorage.clear();
});

describe("find clubs", () => {
  it("shows the first clubs, with interests as links, and the order in the address", async () => {
    const page = vi.fn(() => firstPage());
    show("/clubs", page);
    expect(screen.getByRole("heading", { level: 1, name: "Clubs on MyOtherApp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Club 1" })).toHaveAttribute("href", "/clubs/club-1");
    expect(document.querySelector(".dc-resultline")).toHaveTextContent("20 clubs");
    const robotics = within(screen.getByRole("group", { name: "Interests" })).getByRole("link", { name: /Robotics/ });
    expect(robotics).toHaveAttribute("href", "/clubs?interest=12");
    fireEvent.click(robotics);
    await waitFor(() => expect(search()).toBe("?interest=12"));
    expect(screen.getByRole("heading", { level: 1, name: "Robotics clubs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sort · 1 on/ })).toBeInTheDocument();

    // "Nearby" needs a place.
    const sort = screen.getAllByLabelText("Sort by")[0];
    expect(within(sort).getByRole("option", { name: /Nearby/ })).toBeDisabled();
    fireEvent.change(sort, { target: { value: "newest" } });
    await waitFor(() => expect(search()).toBe("?interest=12&sort=newest"));
    expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ filters: expect.objectContaining({ interest: "12", sort: "newest" }) }));
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    await waitFor(() => expect(search()).toBe("?sort=newest"));
  });

  it("reads later pages in the browser, everywhere", async () => {
    get.mockResolvedValueOnce({ data: { items: [club(13), club(14, { distance_km: 4 })], total: 14 } });
    show("/clubs?q=drone", () => firstPage({ items: Array.from({ length: 12 }, (_, i) => club(i + 1)), total: 14 }));
    expect(screen.getByRole("heading", { level: 1, name: "Clubs matching “drone”" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Club 14" })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/api/v1/discover/clubs", { params: { q: "drone", radius_km: 0, offset: 12, limit: 12 }, skipAuth: true });
    expect(screen.queryByText(/km away/)).toBeNull();
  });

  it("says when nothing matches", () => {
    show("/clubs?interest=99", () => firstPage({ items: [], total: 0 }));
    expect(screen.getByRole("heading", { name: "No clubs match" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search and filters" })).toHaveAttribute("href", "/clubs");
    // An interest the API doesn't list still shows as chosen.
    expect(within(screen.getByRole("group", { name: "Interests" })).getByRole("link", { name: "Chosen interest" })).toHaveAttribute("aria-current", "true");
  });
});
