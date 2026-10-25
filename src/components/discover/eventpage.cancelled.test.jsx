import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => Promise.reject(new Error("no room"))), fetchBanner: vi.fn(() => Promise.reject(new Error("no room"))) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => Promise.reject(new Error("none"))) } }));

const { parseEventPage } = await import("@/api/discover");
const { liveApi } = await import("@/api/live");
const { EventView } = await import("./eventpage.jsx");

/*
 * A cancelled event's page (the API's club tools): it still opens, from the
 * links in emails and on posters, and says it is off, why, and what happens
 * to the money. Nothing on it can be registered or paid.
 */
const show = (event) => {
  const page = parseEventPage(fullEvent({ event: { ...fullEvent().event, ...event } }));
  return render(
    <MemoryRouter initialEntries={[`/events/${page.event.slug}`]}>
      <EventView page={page} />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a cancelled event's page", () => {
  it("says it was cancelled, why and when, under its name", () => {
    show({ status: "cancelled", cancellation: { reason: "The venue flooded.", cancelled_at: "2026-10-12T10:00:00+05:30" } });
    const note = screen.getByRole("note", { name: "This event was cancelled" });
    expect(within(note).getByText("This event was cancelled")).toBeInTheDocument();
    expect(within(note).getByText("The venue flooded.", { exact: false })).toBeInTheDocument();
    expect(within(note).getByText(/Cancelled on 12 Oct 2026. Tickets for it are no longer valid, and anyone who paid online is being refunded in full/)).toBeInTheDocument();
  });

  it("puts Cancelled on the poster and the card, with no way to register", () => {
    show({ status: "cancelled", cancellation: { reason: null, cancelled_at: null } });
    expect(document.querySelector(".ep-poster .dc-pill--cancelled")).toHaveTextContent("Cancelled");
    const card = screen.getByRole("region", { name: "Registration" });
    expect(card).toHaveClass("ep-cta--cancelled");
    expect(within(card).getByText("Cancelled")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Event cancelled" })).toBeDisabled();
    expect(within(card).queryByRole("link", { name: "Register" })).toBeNull();
    expect(within(card).getByText("Anyone who paid online is being refunded in full.")).toBeInTheDocument();
    expect(within(card).getByText("Cancelled by the organisers")).toBeInTheDocument();
    // Nothing to put in a calendar, no seats to count, and no live room to look for.
    expect(screen.queryByRole("button", { name: /Add to calendar/ })).toBeNull();
    expect(screen.queryByText(/seats left/)).toBeNull();
    expect(liveApi.fetchBanner).not.toHaveBeenCalled();
    expect(liveApi.fetchFeed).not.toHaveBeenCalled();
  });

  it("an event that is on says nothing of it", () => {
    show({});
    expect(screen.queryByRole("note", { name: "This event was cancelled" })).toBeNull();
    expect(screen.getByRole("region", { name: "Registration" })).not.toHaveClass("ep-cta--cancelled");
  });
});
