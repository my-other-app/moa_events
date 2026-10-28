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

/*
 * Nobody going yet: where an open event says "Be the first to register",
 * one whose club confirms each place says the club confirms each place
 * (people may have asked already; the page shows no request numbers).
 */
describe("nobody going yet", () => {
  const facts = () => document.querySelector(".ep-facts");
  const meter = () => document.querySelector(".ep-meter-text");

  it("says the club confirms each place, beside the seats left and in the facts", () => {
    show({ requires_approval: true, status: "upcoming", registration_open: true, going: 0, capacity: 120, seats_left: 120 });
    expect(meter()).toHaveTextContent("Circuit Society confirms each place · 120 seats left");
    expect(screen.queryByText(/Be the first to register/)).toBeNull();
    expect(facts()).toHaveTextContent("Circuit Society confirms each place · 120 seats left");
  });

  it("says the club when the page names none", () => {
    show({ requires_approval: true, status: "upcoming", registration_open: true, going: 0, capacity: 120, seats_left: 120 }, null);
    expect(meter()).toHaveTextContent("The club confirms each place");
  });

  it("says how many are going once someone is, as before", () => {
    show({ requires_approval: true, status: "upcoming", registration_open: true, going: 12, capacity: 120, seats_left: 100 });
    expect(meter()).toHaveTextContent("12 going · 100 seats left");
    expect(document.querySelector(".ep-facts")).toHaveTextContent("12 going · 100 seats left");
  });

  it("an event without the setting still says Be the first to register", () => {
    show({ status: "upcoming", registration_open: true, going: 0, capacity: 120, seats_left: 120 });
    expect(meter()).toHaveTextContent("Be the first to register · 120 seats left");
    expect(document.querySelector(".ep-facts")).not.toHaveTextContent(/confirms each place/);
  });
});

describe("the High demand chip", () => {
  const chips = () => document.querySelector(".ep-chips");

  it("shows when the club has its label on, with no number", () => {
    show({ high_demand: true, requires_approval: true, status: "upcoming", registration_open: true });
    const chip = within(chips()).getByText("High demand");
    expect(chip).toHaveClass("ep-chip", "ep-chip--demand");
    expect(chip.textContent).toBe("High demand");
  });

  it("isn't there without the label", () => {
    show({ high_demand: false, status: "upcoming", registration_open: true });
    expect(screen.queryByText("High demand")).toBeNull();
  });

  it("isn't there once the event has ended", () => {
    show({ high_demand: true, status: "ended", registration_open: false });
    expect(screen.queryByText("High demand")).toBeNull();
  });
});
