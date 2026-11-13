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
const TICKETING = (viewer_request, viewer_last_request) => ({
  types: [{ id: 3, name: "Student", price: 199, is_free: false, status: "on_sale", available: 20 }],
  requires_choice: false,
  available: 20,
  sold_out: false,
  waitlist: { enabled: false, offer_hours: 24 },
  viewer_waitlist: [],
  requires_approval: true,
  viewer_request,
  // An older server sends no `viewer_last_request` at all.
  ...(viewer_last_request === undefined ? {} : { viewer_last_request }),
});

function answer(viewerRequest, viewerLastRequest = undefined) {
  get.mockImplementation(async (url) => {
    if (url === "/api/v1/user/profile/me") return { data: PROFILE };
    if (url === "/api/v1/events/123/ticket-types") return { data: TICKETING(viewerRequest, viewerLastRequest) };
    return { data: {} };
  });
}

const show = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <div className="ep-cta-go">
          <RegisterGo eventId="123" state={OPEN} approval eventName="Hack Night 04" clubName="Circuit Society" />
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
    // An older server: nothing about an earlier one either.
    expect(document.querySelector(".ep-cta-mine")).toBeNull();
  });
});

/* `ticketing.viewer_last_request`: none open, and how the last one ended. */
const last = (status, over = {}) => ({
  id: "r1",
  status,
  token: TOKEN,
  status_url: `https://myotherapp.in/requests/${TOKEN}`,
  submitted_at: "2026-10-26T10:15:00+05:30",
  decided_at: "2026-10-27T09:00:00+05:30",
  decline_note: null,
  closed_reason: null,
  can_register_again: status !== "declined",
  ...over,
});

describe("signed in, with an earlier registration and none open", () => {
  it("declined: not confirmed, the club's note, and its page instead of Register", async () => {
    answer(null, last("declined", { decline_note: "We're full of returning members this time." }));
    show();
    expect(await screen.findByRole("link", { name: "See your registration" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.getByText("Your registration wasn't confirmed. You can't register for this event again.")).toBeInTheDocument();
    expect(screen.getByText("Circuit Society said: We're full of returning members this time.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });

  it("declined, without its link: a plain Not confirmed instead of Register", async () => {
    answer(null, last("declined", { token: null, status_url: null }));
    show();
    expect(await screen.findByRole("button", { name: "Not confirmed" })).toBeDisabled();
    expect(screen.queryByText(/said:/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });

  it.each([
    ["withdrawn", last("withdrawn"), "You cancelled your registration. If you've changed your mind, you can register again."],
    ["lapsed", last("lapsed"), "Your registration expired: it wasn't paid in time. You can register again."],
    ["closed: a ticket got another way", last("closed", { closed_reason: "registered_directly" }), "Your earlier registration is closed. It closed when you got a ticket another way. You can register again."],
  ])("%s: Register, with a line saying so", async (_, viewerLastRequest, line) => {
    answer(null, viewerLastRequest);
    show();
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/hack-night-04/register");
    expect(screen.queryByRole("link", { name: "See your registration" })).toBeNull();
  });

  it.each([
    ["cancelled", "event_cancelled", "This registration is closed. Hack Night 04 was cancelled."],
    ["ended", "event_ended", "This registration is closed. Hack Night 04 ended before Circuit Society could confirm your registration."],
  ])("closed because the event was %s: why, and no Register", async (_, reason, line) => {
    answer(null, last("closed", { closed_reason: reason }));
    show();
    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your registration" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });

  it("cancelled since, but declined before (can_register_again: false): no Register", async () => {
    answer(null, last("withdrawn", { can_register_again: false }));
    show();
    expect(await screen.findByText("You cancelled your registration. You can't register for this event again.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });

  it("one open wins over an earlier one", async () => {
    answer({ id: "r2", status: "pending", token: TOKEN }, last("declined"));
    show();
    expect(await screen.findByText("Your registration is under review.")).toBeInTheDocument();
    expect(screen.queryByText(/wasn.t confirmed/)).toBeNull();
  });
});
