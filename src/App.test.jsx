import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";

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
    discoverApi: {
      home: pending(),
      events: pending(),
      clubs: pending(),
      club: pending(),
      threads: pending(),
      thread: pending(),
      comments: pending(),
      locate: pending(),
      event: vi.fn(),
      sitemap: pending(),
    },
  };
});

const { eventsApi } = await import("@/api/events");
const { liveApi } = await import("@/api/live");
const { discoverApi, parseEventPage } = await import("@/api/discover");
const { AppRoutes } = await import("./App.jsx");

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}${l.hash}`}</output>;
}

const at = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Where />
    </MemoryRouter>
  );

const where = () => screen.getByTestId("where").textContent;

/** The event behind both its slug and its id; anything else is not public. */
const page = parseEventPage(fullEvent());
const lookUp = (ref) =>
  ref === "hack-night-04" || ref === "123" ? Promise.resolve(page) : Promise.reject(Object.assign(new Error("No such event"), { notFound: true }));

const discoverCalls = () => Object.values(discoverApi).reduce((n, fn) => n + fn.mock.calls.length, 0);

beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  discoverApi.event.mockImplementation(lookUp);
});

describe("the routes", () => {
  it("moves an old /{id} link (printed QR codes, emails) to /events/{slug}, keeping the query and fragment", async () => {
    at("/123?ref=x7k2m9pq&utm_source=whatsapp#agenda");
    expect(await screen.findByRole("heading", { level: 1, name: "Hack Night 04" }, { timeout: 4000 })).toBeInTheDocument();
    expect(discoverApi.event).toHaveBeenCalledWith("123", expect.anything());
    expect(where()).toBe("/events/hack-night-04?ref=x7k2m9pq&utm_source=whatsapp#agenda");
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
  });

  it("moves an old /{slug} link the same way", async () => {
    at("/hack-night-04?sref=site1234");
    expect(await screen.findByRole("heading", { level: 1, name: "Hack Night 04" }, { timeout: 4000 })).toBeInTheDocument();
    expect(where()).toBe("/events/hack-night-04?sref=site1234");
  });

  it("moves the old live room, competition and registration addresses under the event", async () => {
    at("/123/live?utm_source=poster");
    await waitFor(() => expect(where()).toBe("/events/hack-night-04/live?utm_source=poster"));
    // The room is still asked for by the event's numeric id.
    await waitFor(() => expect(liveApi.fetchFeed).toHaveBeenCalledWith("123"));
  });

  it("moves /register/{id} to the event's form", async () => {
    at("/register/123?ref=x7k2m9pq");
    await waitFor(() => expect(where()).toBe("/events/hack-night-04/register?ref=x7k2m9pq"));
    await waitFor(() => expect(eventsApi.fetchEvent).toHaveBeenCalledWith("123"));
  });

  it("shows the registration form at /events/{slug}/register, working with the event's id", async () => {
    eventsApi.fetchEvent.mockResolvedValueOnce({ id: 123, additional_details: [] });
    at("/events/hack-night-04/register");
    expect(await screen.findByLabelText(/^Full name/)).toBeInTheDocument();
    expect(discoverApi.event).toHaveBeenCalledWith("hack-night-04", expect.anything());
    await waitFor(() => expect(eventsApi.fetchEvent).toHaveBeenCalledWith("123"));
    expect(eventsApi.fetchStoreCatalog).toHaveBeenCalledWith("123");
    // The club comes with the event, for the summary beside the form.
    expect(screen.getByText("by Circuit Society")).toBeInTheDocument();
    // Back goes to the event's own page, by its slug.
    fireEvent.click(screen.getByRole("link", { name: /Back to event/ }));
    expect(where()).toBe("/events/hack-night-04");
  });

  it("shows the not-found page for an old address no event answers to", async () => {
    at("/no-such-event");
    expect(await screen.findByText("404")).toBeInTheDocument();
    at("/a.b");
    expect(screen.getAllByText("404").length).toBeGreaterThan(0);
    expect(discoverApi.event).not.toHaveBeenCalledWith("a.b", expect.anything());
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
    expect(discoverApi.event).not.toHaveBeenCalled();
  });

  it("keeps tickets, certificates and registration where they were", async () => {
    at("/tickets/tk-1");
    await waitFor(() => expect(eventsApi.fetchTicketDetails).toHaveBeenCalledWith("tk-1"));
    at("/certificates/tk-2");
    await waitFor(() => expect(eventsApi.fetchCertificateStyle).toHaveBeenCalledWith("tk-2"));
    expect(eventsApi.fetchEvent).not.toHaveBeenCalledWith("tickets");
    expect(discoverCalls()).toBe(0);
  });

  it("serves a person's own pages at /me/tickets and /me/following, never as an old event address", async () => {
    at("/me/tickets");
    expect(screen.getByRole("heading", { level: 1, name: "Your tickets are in the app" })).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    cleanup();
    at("/me/following");
    expect(screen.getByRole("heading", { level: 1, name: "Follow clubs in the app" })).toBeInTheDocument();
    cleanup();
    at("/me");
    expect(where()).toBe("/me/tickets");
    expect(discoverApi.event).not.toHaveBeenCalled();
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
  });

  it("shows the not-found page for anything else deeper", () => {
    at("/a/b/c/d");
    expect(screen.getByText("404")).toBeInTheDocument();
  });
});
