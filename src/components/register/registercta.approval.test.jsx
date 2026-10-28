import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The event page's register button for an event whose club reviews every
 * registration (registration approval): signed in, the viewer's own open
 * registration (`ticketing.viewer_request`) replaces "Register" with where it
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
const CLAIM = "Cl4im-token-abcdefghijklmnop";
const OPEN = { kind: "open", label: "Register", href: "/events/hack-night-04/register", also: null };
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

const show = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <div className="ep-cta-go">
          <RegisterGo eventId="123" state={OPEN} approval />
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

describe("signed in, with a registration open", () => {
  it("under review: says so, and opens the registration", async () => {
    answer({ id: "r1", status: "pending", token: TOKEN, status_url: `https://myotherapp.in/requests/${TOKEN}` });
    show();
    expect(await screen.findByRole("link", { name: "See your registration" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.getByText("Your registration is under review.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });

  it("confirmed and not paid: pay now, on the registration's page", async () => {
    answer({ id: "r1", status: "approved", token: TOKEN, status_url: `https://myotherapp.in/requests/${TOKEN}` });
    show();
    expect(await screen.findByRole("link", { name: "Pay now" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.getByText("Your registration is confirmed. Pay to get your ticket.")).toBeInTheDocument();
  });

  it("confirmed, with the pay link when the API sends one: the amount and the time, on the claim page", async () => {
    answer({ id: "r1", status: "approved", token: TOKEN, pay: { amount: 199, pay_by: "2026-10-27T10:15:00+05:30", claim_token: CLAIM } });
    show();
    expect(await screen.findByRole("link", { name: "Pay ₹199" })).toHaveAttribute("href", `/claim/${CLAIM}`);
    expect(screen.getByText("Your registration is confirmed. Pay ₹199 by Tue, 27 Oct · 10:15 AM IST to get your ticket.")).toBeInTheDocument();
  });

  it.each([
    ["none open", null],
    ["a declined one", { id: "r1", status: "declined", token: TOKEN }],
  ])("%s: the server's button", async (_, viewerRequest) => {
    answer(viewerRequest);
    show();
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/events/123/ticket-types", expect.anything()));
    await act(async () => {});
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/hack-night-04/register");
    expect(screen.queryByText(/under review/)).toBeNull();
  });
});
