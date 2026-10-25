import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The event page's tickets and waiting list (client islands in the
 * server-rendered page): the register card's button and the "Tickets"
 * section, both read in the browser once the page is up.
 */
vi.mock("@/api/events", () => ({ eventsApi: { fetchEvent: vi.fn() } }));
vi.mock("@/api/payments", () => ({ paymentsApi: { createPaymentOrder: vi.fn(), verifyPayment: vi.fn() } }));
vi.mock("@/api/ticketing", () => ({
  ticketingApi: { types: vi.fn(), joinWaitlist: vi.fn(), myWaitlist: vi.fn(), leaveWaitlist: vi.fn(), checkCode: vi.fn() },
}));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { eventsApi } = await import("@/api/events");
const { ticketingApi } = await import("@/api/ticketing");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { parseTicketing } = await import("@/utils/ticketing");
const { RegisterGo } = await import("./registercta.jsx");
const { EventTickets } = await import("./eventtickets.jsx");
const { forgetTicketing } = await import("./tickets.jsx");
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const TT = (over = {}) => ({ id: 12, name: "Early bird", description: null, price: 199, is_free: false, available: 23, status: "on_sale", waitlist: false, ...over });
const ticketing = (over = {}) =>
  parseTicketing({
    types: [TT(), TT({ id: 13, name: "VIP", description: "Front rows", price: 499, available: 4 }), TT({ id: 14, name: "Student", price: 99, status: "sold_out", available: 0, waitlist: true })],
    requires_choice: true,
    available: 27,
    sold_out: false,
    waitlist: { enabled: true, offer_hours: 24 },
    viewer_waitlist: [],
    ...over,
  });

const OPEN = { kind: "open", label: "Register", href: "/events/hack-night-04/register", also: null };
const FULL = { kind: "full", label: "Event full", href: null, also: null };

const show = (state = OPEN) =>
  render(
    <MemoryRouter initialEntries={["/events/hack-night-04"]}>
      <AuthProvider>
        <div className="ep-cta-go">
          <RegisterGo eventId="123" state={state} />
        </div>
        <EventTickets eventId="123" kind={state.kind} registerHref={state.kind === "open" ? state.href : null} />
      </AuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  forgetTicketing();
  window.history.replaceState(null, "", "/events/hack-night-04");
  Element.prototype.scrollIntoView = vi.fn();
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
  eventsApi.fetchEvent.mockResolvedValue({ id: 123, is_registered: false });
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("the event's tickets", () => {
  it("lists each ticket with its price and what's left, one on sale a tap from the form with it chosen", async () => {
    ticketingApi.types.mockResolvedValue(ticketing());
    show();
    const section = await screen.findByRole("region", { name: "Tickets" });
    expect(within(section).getByText("Front rows")).toBeInTheDocument();
    expect(within(section).getByText("₹499")).toBeInTheDocument();
    expect(within(section).getByText("Only 4 left")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Register with VIP" })).toHaveAttribute("href", "/events/hack-night-04/register?ticket_type=13");
    expect(within(section).queryByRole("link", { name: "Register with Student" })).toBeNull();
    expect(within(section).getByText("Sold out · waiting list open")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Join the waiting list" })).toBeInTheDocument();
    // Asked once for both islands.
    expect(ticketingApi.types).toHaveBeenCalledTimes(1);
    expect(ticketingApi.types).toHaveBeenCalledWith("123", { ticketType: null });
  });

  it("says nothing for one ticket and no waiting list, and asks nothing for an ended event", async () => {
    ticketingApi.types.mockResolvedValue(parseTicketing({ types: [TT()], waitlist: { enabled: false } }));
    const { container, unmount } = show();
    await waitFor(() => expect(ticketingApi.types).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Tickets" })).toBeNull();
    expect(container.querySelector(".ep-tickets")).toBeNull();
    unmount();
    ticketingApi.types.mockClear();
    forgetTicketing();
    show({ kind: "ended", label: "This event has ended", href: null, also: null });
    expect(screen.getByRole("button", { name: "This event has ended" })).toBeDisabled();
    await new Promise((r) => setTimeout(r, 10));
    expect(ticketingApi.types).not.toHaveBeenCalled();
  });

  it("says nothing from a server without ticket types, and the button is the server's", async () => {
    ticketingApi.types.mockResolvedValue(null);
    show();
    await waitFor(() => expect(ticketingApi.types).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/hack-night-04/register");
    expect(screen.queryByRole("region", { name: "Tickets" })).toBeNull();
  });

  it("keeps a link's hidden ticket on the way to the form", async () => {
    window.history.replaceState(null, "", "/events/hack-night-04?ticket_type=15");
    ticketingApi.types.mockResolvedValue(ticketing({ types: [TT(), TT({ id: 15, name: "Sponsor", is_hidden: true, price: 0, is_free: true, available: null })], requires_choice: false }));
    show();
    await waitFor(() => expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/hack-night-04/register?ticket_type=15"));
    expect(ticketingApi.types).toHaveBeenCalledWith("123", { ticketType: 15 });
    expect(await screen.findByText("Shared with you")).toBeInTheDocument();
  });
});

describe("sold out, with a waiting list", () => {
  it("the card's button becomes Join the waiting list, and opens the form on the page", async () => {
    ticketingApi.types.mockResolvedValue(ticketing({ sold_out: true, types: [TT({ status: "sold_out", available: 0, waitlist: true })], requires_choice: false }));
    ticketingApi.joinWaitlist.mockResolvedValue({ id: "w1", ticketTypeId: 12, ticketTypeName: "Early bird", status: "waiting", position: 1, created: true });
    show(FULL);
    const join = await screen.findByRole("link", { name: "Join the waiting list" });
    expect(screen.getByText("Sold out: get a link if a place opens up.")).toBeInTheDocument();
    fireEvent.click(join);
    const form = await screen.findByRole("group", { name: "Join the waiting list" });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: "Asha Rao" } });
    fireEvent.change(within(form).getByLabelText(/^Phone number/), { target: { value: "98765 43210" } });
    fireEvent.keyDown(within(form).getByLabelText(/^Phone number/), { key: "Enter" });
    expect(await screen.findByText("You're next in line for Early bird")).toBeInTheDocument();
    expect(ticketingApi.joinWaitlist).toHaveBeenCalledWith("123", { ticketTypeId: 12, name: "Asha Rao", email: null, phone: "98765 43210", whatsapp: false });
    expect(screen.getByText(/Sign in with the same email to leave the list/)).toBeInTheDocument();
  });

  it("sold out with no list: the card says so, rather than Register", async () => {
    ticketingApi.types.mockResolvedValue(ticketing({ sold_out: true, waitlist: { enabled: false }, types: [TT({ status: "sold_out", available: 0 })], requires_choice: false }));
    show(OPEN);
    expect(await screen.findByRole("button", { name: "Sold out" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });
});

describe("signed in, in line", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it("the card says so, the page says where, and leaving takes a second tap", async () => {
    ticketingApi.types.mockResolvedValue(
      ticketing({ sold_out: true, viewer_waitlist: [{ id: "w1", ticket_type_id: 14, ticket_type_name: "Student", status: "waiting", position: 3 }] }),
    );
    ticketingApi.leaveWaitlist.mockResolvedValue({ left: 1 });
    show(FULL);
    expect(await screen.findByRole("link", { name: "You’re on the waiting list" })).toHaveAttribute("href", "#tickets");
    expect(await screen.findByText("You're number 3 in line for Student")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave the waiting list" }));
    expect(screen.getByText(/You’ll lose your place in line/)).toBeInTheDocument();
    expect(ticketingApi.leaveWaitlist).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(ticketingApi.leaveWaitlist).toHaveBeenCalledWith("123"));
    await waitFor(() => expect(screen.queryByText("You're number 3 in line for Student")).toBeNull());
  });

  it("a place offered: held until when, the link in their email", async () => {
    ticketingApi.types.mockResolvedValue(
      ticketing({ viewer_waitlist: [{ id: "w1", ticket_type_id: 14, ticket_type_name: "Student", status: "offered", offer_expires_at: "2026-11-02T18:00:00+05:30" }] }),
    );
    show(FULL);
    expect(await screen.findByText("A place for Student is yours to claim")).toBeInTheDocument();
    expect(screen.getByText(/held for you until Mon, 2 Nov · 6:00 PM IST/)).toBeInTheDocument();
    expect(screen.getByText("A place is held for you: check your email.")).toBeInTheDocument();
  });
});

describe("a cancelled event", () => {
  it("the card's button is out of reach, and nothing is asked", async () => {
    enableSignIn();
    signInAs();
    show({ kind: "cancelled", label: "Event cancelled", href: null, also: null });
    expect(screen.getByRole("button", { name: "Event cancelled" })).toBeDisabled();
    await new Promise((r) => setTimeout(r, 20));
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
    expect(ticketingApi.types).not.toHaveBeenCalled();
  });
});
