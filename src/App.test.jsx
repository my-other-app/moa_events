import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/api/events", () => ({
  eventsApi: {
    fetchEvent: vi.fn(() => new Promise(() => {})),
    fetchAgenda: vi.fn(() => Promise.resolve(null)),
    fetchStoreCatalog: vi.fn(() => Promise.resolve({ enabled: false, items: [] })),
    fetchTicketDetails: vi.fn(() => new Promise(() => {})),
    fetchCertificateStyle: vi.fn(() => new Promise(() => {})),
    registerForEvent: vi.fn(),
  },
}));
vi.mock("@/api/live", () => ({
  errorLine: (e, f) => f,
  liveApi: { fetchFeed: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/api/competition", () => ({
  errorLine: (e, f) => f,
  competitionApi: { leaderboard: vi.fn(() => new Promise(() => {})), mine: vi.fn(() => new Promise(() => {})) },
}));
vi.mock("@/api/discover", async (importOriginal) => {
  const real = await importOriginal();
  const pending = () => vi.fn(() => new Promise(() => {}));
  return {
    ...real,
    discoverApi: { home: pending(), events: pending(), clubs: pending(), club: pending(), threads: pending(), thread: pending(), comments: pending(), locate: pending() },
  };
});

const { eventsApi } = await import("@/api/events");
const { liveApi } = await import("@/api/live");
const { discoverApi } = await import("@/api/discover");
const { AppRoutes } = await import("./App.jsx");

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

const discoverCalls = () => Object.values(discoverApi).reduce((n, fn) => n + fn.mock.calls.length, 0);

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
});

describe("the routes", () => {
  it("still opens an event page at /{id}, as printed QR codes expect", async () => {
    at("/123");
    await waitFor(() => expect(eventsApi.fetchEvent).toHaveBeenCalledWith("123"));
    expect(discoverCalls()).toBe(0);
  });

  it("keeps the event's live room at /{id}/live", async () => {
    at("/123/live");
    await waitFor(() => expect(liveApi.fetchFeed).toHaveBeenCalledWith("123"));
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
  });

  it("serves the discovery pages at their fixed words, never as an event id", async () => {
    at("/");
    await waitFor(() => expect(discoverApi.home).toHaveBeenCalled());
    at("/events?when=today");
    await waitFor(() => expect(discoverApi.events).toHaveBeenCalled());
    at("/clubs");
    await waitFor(() => expect(discoverApi.clubs).toHaveBeenCalled());
    at("/clubs/circuit-society");
    await waitFor(() => expect(discoverApi.club).toHaveBeenCalledWith("circuit-society"));
    at("/threads");
    await waitFor(() => expect(discoverApi.threads).toHaveBeenCalled());
    at("/threads/abc");
    await waitFor(() => expect(discoverApi.thread).toHaveBeenCalledWith("abc"));
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
  });

  it("keeps tickets, certificates and registration where they were", async () => {
    at("/tickets/tk-1");
    await waitFor(() => expect(eventsApi.fetchTicketDetails).toHaveBeenCalledWith("tk-1"));
    at("/certificates/tk-2");
    await waitFor(() => expect(eventsApi.fetchCertificateStyle).toHaveBeenCalledWith("tk-2"));
    expect(eventsApi.fetchEvent).not.toHaveBeenCalledWith("tickets");
    expect(discoverCalls()).toBe(0);
  });

  it("shows the not-found page for anything else deeper", () => {
    at("/a/b/c/d");
    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
