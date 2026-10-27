import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The event page's register button for an event whose club confirms each
 * place (registration approval): signed in, the viewer's own open request
 * (`ticketing.viewer_request`) replaces "Request a place" with where it
 * stands. The API is mocked; nothing leaves the test.
 */
vi.mock("@/api/events", () => ({ eventsApi: { fetchEvent: vi.fn() } }));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { eventsApi } = await import("@/api/events");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { RegisterGo } = await import("./registercta.jsx");
const { forgetTicketing } = await import("./tickets.jsx");
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const TOKEN = "Rq7abcdefghijklmnopqrstuvwxyz001";
const OPEN = { kind: "open", label: "Request a place", href: "/events/hack-night-04/register", also: null };
const TICKETING = (viewer_request) => ({
  types: [{ id: 3, name: "Student", price: 199, is_free: false, status: "on_sale", available: 20 }],
  requires_choice: false,
  available: 20,
  sold_out: false,
  waitlist: { enabled: false, offer_hours: 24 },
  viewer_waitlist: [],
  requires_approval: true,
  viewer_request,
});

function answer(viewerRequest) {
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    if (url === "/api/v1/events/123/ticket-types") return { data: TICKETING(viewerRequest) };
    return { data: {} };
  });
}

const show = (club = { name: "Circuit Society" }) =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <div className="ep-cta-go">
          <RegisterGo eventId="123" state={OPEN} club={club} />
        </div>
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  forgetTicketing();
  enableSignIn();
  signInAs();
  eventsApi.fetchEvent.mockResolvedValue({ id: 123, is_registered: false });
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("signed in, with a request open", () => {
  it("waiting: says the club is to confirm, and opens the request", async () => {
    answer({ id: "r1", status: "pending", token: TOKEN, status_url: `https://myotherapp.in/requests/${TOKEN}` });
    show();
    expect(await screen.findByRole("link", { name: "View your request" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.getByText("Waiting for Circuit Society to confirm your place.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Request a place" })).toBeNull();
  });

  it("confirmed and not paid: pay to get the ticket, on the request's page", async () => {
    answer({ id: "r1", status: "approved", token: TOKEN, status_url: `https://myotherapp.in/requests/${TOKEN}` });
    show();
    expect(await screen.findByRole("link", { name: "Pay for your ticket" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.getByText("Circuit Society confirmed your place. Pay to get your ticket.")).toBeInTheDocument();
  });

  it("names the club as the club when the page names none", async () => {
    answer({ id: "r1", status: "pending", token: TOKEN, status_url: null });
    show(null);
    expect(await screen.findByText("Waiting for the club to confirm your place.")).toBeInTheDocument();
  });

  it.each([
    ["none open", null],
    ["a declined one", { id: "r1", status: "declined", token: TOKEN }],
  ])("%s: the server's button", async (_, viewerRequest) => {
    answer(viewerRequest);
    show();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/events/123/ticket-types", expect.anything()));
    await act(async () => {});
    expect(screen.getByRole("link", { name: "Request a place" })).toHaveAttribute("href", "/events/hack-night-04/register");
    expect(screen.queryByText(/to confirm your place/)).toBeNull();
  });
});
