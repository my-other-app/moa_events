import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";

vi.mock("@/api/client", () => ({ default: { get: vi.fn(() => Promise.reject(new Error("offline"))), post: vi.fn() } }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => Promise.reject(new Error("no room"))), fetchBanner: vi.fn(() => Promise.reject(new Error("no room"))) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => Promise.reject(new Error("none"))) } }));

const { parseEventPage } = await import("@/api/discover");
const { EventView } = await import("./eventpage.jsx");

/*
 * An event whose club confirms each place (registration approval): its
 * page asks for a place rather than registering, and says beside the button
 * that the club confirms each one. Without the setting, nothing changes.
 */
const show = (event = {}, club = undefined) => {
  const base = fullEvent();
  const page = parseEventPage({ ...base, event: { ...base.event, ...event }, ...(club !== undefined ? { club } : {}) });
  return render(
    <MemoryRouter initialEntries={[`/events/${page.event.slug}`]}>
      <EventView page={page} />
    </MemoryRouter>,
  );
};
const card = () => screen.getByRole("region", { name: "Registration" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("an event whose club confirms each place", () => {
  it("asks for a place, and says the club confirms each one", () => {
    show({ requires_approval: true, status: "upcoming", registration_open: true, reg_closes_at: "2099-01-01T00:00:00+05:30" });
    expect(within(card()).getByRole("link", { name: "Request a place" })).toHaveAttribute("href", "/events/hack-night-04/register");
    expect(within(card()).queryByRole("link", { name: "Register" })).toBeNull();
    expect(within(card()).getByText(/confirms each place/)).toHaveTextContent("Circuit Society confirms each place. You’ll get your ticket by email when they do.");
  });

  it("says the club when the page names none", () => {
    show({ requires_approval: true, status: "upcoming", registration_open: true }, null);
    expect(within(card()).getByText(/confirms each place/)).toHaveTextContent("The club confirms each place.");
  });

  it("says nothing of it when no place can be asked for (full, closed)", () => {
    show({ requires_approval: true, status: "full" });
    expect(within(card()).queryByText(/confirms each place/)).toBeNull();
  });
});

describe("an event without the setting", () => {
  it("registers, as it always did", () => {
    show({ status: "upcoming", registration_open: true });
    expect(within(card()).getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/hack-night-04/register");
    expect(screen.queryByText(/confirms each place/)).toBeNull();
  });
});
