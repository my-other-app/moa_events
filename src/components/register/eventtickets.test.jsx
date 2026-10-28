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
const { forgetTicketing, WaitlistJoin } = await import("./tickets.jsx");
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

/*
 * An event whose club confirms each place has no waiting list: people
 * request a place and wait in the club's queue. The server now says the list
 * is off; an older one may still say it is on, and the page offers none.
 */
describe("an event whose club confirms each place", () => {
  const showApproval = (state, { approval = true } = {}) =>
    render(
      <MemoryRouter initialEntries={["/events/hack-night-04"]}>
        <AuthProvider>
          <div className="ep-cta-go">
            <RegisterGo eventId="123" state={state} club={{ name: "Circuit Society" }} approval={approval} />
          </div>
          <EventTickets eventId="123" kind={state.kind} registerHref={state.kind === "open" ? state.href : null} approval={approval} />
        </AuthProvider>
      </MemoryRouter>,
    );
  // A review event's button says Register, as any other.
  const REQUEST = { ...OPEN, label: "Register" };
  // What an older server still sends: the list on, and a sold-out type offering it.
  const stillOn = (over = {}) =>
    ticketing({
      sold_out: true,
      types: [TT({ status: "sold_out", available: 0, waitlist: true }), TT({ id: 13, name: "VIP", status: "sold_out", available: 0, waitlist: true })],
      ...over,
    });

  it("full: the card's button stays the server's, with no Join the waiting list anywhere", async () => {
    ticketingApi.types.mockResolvedValue(stillOn({ requires_approval: true }));
    showApproval(FULL);
    await waitFor(() => expect(ticketingApi.types).toHaveBeenCalled());
    const section = await screen.findByRole("region", { name: "Tickets" });
    expect(screen.getByRole("button", { name: "Event full" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Join the waiting list" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Join the waiting list/ })).toBeNull();
    expect(within(section).queryByText(/waiting list/)).toBeNull();
    expect(within(section).getAllByText("Sold out")).toHaveLength(2);
  });

  it("sold out while open: Sold out, not the waiting list", async () => {
    ticketingApi.types.mockResolvedValue(stillOn({ requires_approval: true, types: [TT({ status: "sold_out", available: 0, waitlist: true })], requires_choice: false }));
    showApproval(REQUEST);
    expect(await screen.findByRole("button", { name: "Sold out" })).toBeDisabled();
    expect(screen.queryByText(/waiting list/i)).toBeNull();
  });

  it("known only from the event (the tickets don't say): still no waiting list", async () => {
    ticketingApi.types.mockResolvedValue(stillOn());
    showApproval(FULL);
    await waitFor(() => expect(ticketingApi.types).toHaveBeenCalled());
    await screen.findByRole("region", { name: "Tickets" });
    expect(screen.queryByRole("link", { name: "Join the waiting list" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Join the waiting list/ })).toBeNull();
    expect(screen.queryByText(/waiting list open/)).toBeNull();
  });

  it("the same tickets on an event without the setting still offer the list", async () => {
    ticketingApi.types.mockResolvedValue(stillOn());
    showApproval(FULL, { approval: false });
    expect(await screen.findByRole("link", { name: "Join the waiting list" })).toBeInTheDocument();
  });
});

describe("joining refused because the club confirms each place", () => {
  it("says so plainly, with no button to try again", async () => {
    ticketingApi.joinWaitlist.mockRejectedValue({
      response: { status: 409, data: { message: "Waitlist is off", error_code: "WAITLIST_OFF_ON_APPROVAL_EVENTS" } },
    });
    render(
      <MemoryRouter>
        <WaitlistJoin eventId="123" types={[{ id: 12, name: "Early bird", price: 199, isFree: false }]} onJoined={vi.fn()} onCancel={vi.fn()} />
      </MemoryRouter>,
    );
    const form = screen.getByRole("group", { name: "Join the waiting list" });
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: "Asha Rao" } });
    fireEvent.change(within(form).getByLabelText(/^Email/), { target: { value: "asha@example.org" } });
    fireEvent.click(within(form).getByRole("button", { name: "Join the waiting list" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event has no waiting list: the club reviews every registration. Register instead, and they'll get back to you.",
    );
    expect(within(form).queryByRole("button", { name: "Join the waiting list" })).toBeNull();
    expect(within(form).getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });
});
