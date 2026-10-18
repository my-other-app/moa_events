import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn() } }));

const { ANYWHERE, MAX_OFFSET, clubsQuery, discoverApi, eventsQuery, nextPage, parseEventsPage, parseThreadsPage } = await import("@/api/discover");
const { Finder, MoreResults } = await import("./finderislands.jsx");

/*
 * Paging the discover lists, in the two shapes the API comes in:
 *   cursors   each page says `next_cursor`; the next is asked for `after=` it,
 *             with no offset (the newer API, which refuses offsets past 1,000)
 *   offsets   no `next_cursor` (today's production): by offset, but never past
 *             1,000, where the newer API would answer 422
 */
const ev = (id) => ({ id, slug: `event-${id}`, name: `Event ${id}`, starts_at: "2026-10-30T12:30:00Z", status: "upcoming" });
const run = (from, n) => Array.from({ length: n }, (_, i) => ev(from + i));
const params = (i) => get.mock.calls[i][1].params;

beforeEach(() => {
  get.mockReset();
});

describe("the paging rules", () => {
  it("reads a page's cursor, and says where the next page starts", () => {
    const cursored = parseEventsPage({ items: [ev(1)], next_cursor: "c1" });
    expect(cursored).toMatchObject({ cursored: true, cursor: "c1" });
    expect(nextPage(cursored, 12)).toEqual({ after: "c1" });
    expect(nextPage(parseEventsPage({ items: [], next_cursor: null }), 12)).toBeNull();
    const today = parseEventsPage({ items: [ev(1)], total: 30 });
    expect(today).toMatchObject({ cursored: false, cursor: null });
    expect(nextPage(today, 12)).toEqual({ offset: 12 });
    expect(nextPage(today, MAX_OFFSET)).toEqual({ offset: 1000 });
    expect(nextPage(today, 1001)).toBeNull();
    expect(nextPage(parseThreadsPage({ items: [] }), 5000, Infinity)).toEqual({ offset: 5000 });
  });

  it("sends a cursor without an offset, and an offset without a cursor", () => {
    expect(eventsQuery({ type: "online" }, ANYWHERE, { after: "c1", limit: 12 })).toEqual({ type: "online", radius_km: 0, after: "c1", limit: 12 });
    expect(eventsQuery({}, ANYWHERE, { offset: 24, limit: 12 })).toEqual({ radius_km: 0, offset: 24, limit: 12 });
    expect(clubsQuery({ topic: "arts" }, ANYWHERE, { after: "k9", offset: 36 })).toEqual({ topic: "arts", radius_km: 0, after: "k9", limit: 12 });
  });
});

const more = (first, { ids = run(1, 12).map((e) => e.id), total = 40, capped = false } = {}) =>
  render(
    <MemoryRouter>
      <Finder path="/events" filters={{ topic: "development" }}>
        <MoreResults kind="events" ids={ids} total={total} capped={capped} first={first} noun="events" />
      </Finder>
    </MemoryRouter>
  );

describe("Load more, with cursors", () => {
  it("asks for the page after each cursor, with no offset, until the cursor is null", async () => {
    get.mockResolvedValueOnce({ data: { items: run(13, 12), total: 30, next_cursor: "c2" } }).mockResolvedValueOnce({ data: { items: run(25, 6), total: 30, next_cursor: null } });
    more({ cursored: true, cursor: "c1" }, { total: 30 });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Event 24" })).toBeInTheDocument();
    expect(params(0)).toEqual({ topic: "development", radius_km: 0, after: "c1", limit: 12 });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Event 30" })).toBeInTheDocument();
    expect(params(1)).toEqual({ topic: "development", radius_km: 0, after: "c2", limit: 12 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText("That's all 30 events.")).toBeInTheDocument();
  });

  it("goes past 1,000 by cursor (the API stopped counting), and ends on a null cursor", async () => {
    get.mockResolvedValueOnce({ data: { items: run(1001, 12), total: 1000, total_capped: true, next_cursor: "deep" } });
    more({ cursored: true, cursor: "c" }, { ids: run(1, 996).map((e) => e.id), total: 1000, capped: true });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Event 1012" })).toBeInTheDocument();
    expect(params(0)).not.toHaveProperty("offset");
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("has nothing more to load when the first page's cursor is null", () => {
    more({ cursored: true, cursor: null }, { total: 40 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

describe("Load more, without cursors (today's API)", () => {
  it("pages by offset as before", async () => {
    get.mockResolvedValueOnce({ data: { items: run(13, 12), total: 40 } });
    more({ cursored: false, cursor: null });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Event 24" })).toBeInTheDocument();
    expect(params(0)).toEqual({ topic: "development", radius_km: 0, offset: 12, limit: 12 });
  });

  it("stops at offset 1,000 rather than ask for a page the API refuses, and says how to see the rest", async () => {
    get.mockResolvedValueOnce({ data: { items: run(997, 12), total: 1000, total_capped: true } });
    more({ cursored: false, cursor: null }, { ids: run(1, 996).map((e) => e.id), total: 1000, capped: true });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("link", { name: "Event 1008" })).toBeInTheDocument();
    expect(params(0)).toMatchObject({ offset: 996 });
    // The next offset (1,008) is past what the API serves: no button, no request.
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getByText("Showing the first 1,008 events. Narrow the search or the filters to see the rest.")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("still pages the posts past 1,000 (their list has no such limit)", async () => {
    get.mockResolvedValueOnce({ data: { items: [{ id: "t1", club: { name: "A" }, body: "Hi" }], total: 2000 } });
    render(
      <MemoryRouter>
        <MoreResults kind="threads" ids={Array.from({ length: 1200 }, (_, i) => `x${i}`)} total={2000} noun="posts" className="dc-threads" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(params(0)).toEqual({ offset: 1200, limit: 12 });
  });
});

describe("the calendar's month", () => {
  it("follows cursors page by page", async () => {
    get
      .mockResolvedValueOnce({ data: { items: run(1, 48), total: 100, next_cursor: "m2" } })
      .mockResolvedValueOnce({ data: { items: run(49, 48), total: 100, next_cursor: "m3" } })
      .mockResolvedValueOnce({ data: { items: run(97, 4), total: 100, next_cursor: null } });
    const month = await discoverApi.monthEvents({}, ANYWHERE, "2026-11");
    expect(month.items).toHaveLength(100);
    expect(get.mock.calls.map((c) => c[1].params.after ?? c[1].params.offset)).toEqual([0, "m2", "m3"]);
  });

  it("asks for the rest at once by offset when the API has no cursors", async () => {
    get.mockResolvedValueOnce({ data: { items: run(1, 48), total: 100 } }).mockResolvedValue({ data: { items: [], total: 100 } });
    await discoverApi.monthEvents({}, ANYWHERE, "2026-11");
    expect(get.mock.calls.map((c) => c[1].params.offset)).toEqual([0, 48, 96]);
  });
});
