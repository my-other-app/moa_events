import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fullEvent } from "@/test/eventFixture";

/*
 * The registration form with ticket types, discount codes, the waiting list
 * and cancelled events (the API's docs/TICKETING.md). The API is mocked
 * (the ticketing module answers with what it parses); Razorpay is a fake;
 * nothing leaves the test.
 */
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY", "rzp_test_not_a_real_key");
});
vi.mock("@/api/events", () => ({ eventsApi: { fetchEvent: vi.fn(), fetchStoreCatalog: vi.fn(), registerForEvent: vi.fn() } }));
vi.mock("@/api/payments", () => ({ paymentsApi: { createPaymentOrder: vi.fn(), verifyPayment: vi.fn() } }));
vi.mock("@/utils/loadScript", () => ({ loadScript: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/api/ticketing", () => ({
  ticketingApi: { types: vi.fn(), checkCode: vi.fn(), joinWaitlist: vi.fn(), myWaitlist: vi.fn(), leaveWaitlist: vi.fn() },
}));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { eventsApi } = await import("@/api/events");
const { paymentsApi } = await import("@/api/payments");
const { ticketingApi } = await import("@/api/ticketing");
const { parseEventPage } = await import("@/api/discover");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { apiFailure, parseTicketing } = await import("@/utils/ticketing");
const { forgetTicketing } = await import("./tickets.jsx");
const Register = (await import("./register.jsx")).default;
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const paid = parseEventPage(fullEvent());
const variant = (over) => parseEventPage(fullEvent({ event: { ...fullEvent().event, ...over } }));

/* The event's `ticketing`, as the API sends it (docs/TICKETING.md §2). */
const TT = (over = {}) => ({
  id: 12,
  name: "Early bird",
  description: "Until Friday",
  price: 199,
  currency: "INR",
  is_free: false,
  capacity: 100,
  available: 23,
  status: "on_sale",
  sales_start: null,
  sales_end: null,
  per_person_limit: 1,
  is_hidden: false,
  waitlist: false,
  ...over,
});
const SEVERAL = {
  types: [TT(), TT({ id: 13, name: "VIP", description: null, price: 499, available: 5 }), TT({ id: 14, name: "Student", description: null, price: 99, status: "sold_out", available: 0, waitlist: true })],
  requires_choice: true,
  available: 28,
  sold_out: false,
  waitlist: { enabled: true, offer_hours: 24 },
  viewer_waitlist: [],
};
const ONE = { types: [TT()], requires_choice: false, available: 23, sold_out: false, waitlist: { enabled: true, offer_hours: 24 }, viewer_waitlist: [] };

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>;
}

function show(page, { ticketing = undefined, info = {}, path = null } = {}) {
  eventsApi.fetchEvent.mockResolvedValue({ id: page.event.id, additional_details: [], reg_fee: page.event.fee, ...(ticketing !== undefined ? { ticketing } : {}), ...info });
  eventsApi.fetchStoreCatalog.mockResolvedValue({ enabled: false, items: [] });
  return render(
    <MemoryRouter initialEntries={[path || `/events/${page.event.slug}/register`]}>
      <AuthProvider>
        <Routes>
          <Route path="/events/:slug/register" element={<Register event={page.event} club={page.club} />} />
          <Route path="/tickets/:id" element={<p>ticket page</p>} />
        </Routes>
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const field = (re) => screen.getByLabelText(re);
const go = () => fireEvent.click(document.querySelector(".rg-go"));
const heading = (name) => screen.findByRole("heading", { level: 1, name });
const refuse = (status, message, error_code, errors = null) => Object.assign(new Error(message), { status, data: { message, errors, error_code } });

function fillDetails() {
  fireEvent.change(field(/^Full name/), { target: { value: "Asha Rao" } });
  fireEvent.change(field(/^Email/), { target: { value: "asha@example.org" } });
  fireEvent.change(field(/^Phone number/), { target: { value: "98765 43210" } });
}

async function toReview(page, options) {
  show(page, options);
  await heading(/Your details/);
  fillDetails();
  go();
  await heading(/Review and/);
}

let razorpay;
beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  forgetTicketing();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  razorpay = null;
  window.Razorpay = vi.fn(function (options) {
    razorpay = options;
    this.open = vi.fn();
  });
  // A code typed but not applied is checked after a pause: by default the check never answers.
  ticketingApi.checkCode.mockImplementation(() => new Promise(() => {}));
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterEach(() => {
  delete window.Razorpay;
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("choosing a ticket", () => {
  it("asks which ticket first, each with its price and what's left, then sends the one chosen and shows it on the ticket", async () => {
    eventsApi.registerForEvent.mockResolvedValue({
      ticket_id: "MOA1",
      pay_amount: 499,
      event_registration_id: "r1",
      full_name: "Asha Rao",
      email: "asha@example.org",
      ticket_type: { id: 13, name: "VIP" },
      price: 499,
      discount: null,
      is_paid: false,
    });
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 49900, razorpay_order_id: "order_1" });
    paymentsApi.verifyPayment.mockResolvedValue({ status: "captured" });
    show(paid, { ticketing: SEVERAL });
    expect(await heading(/Choose your ticket/)).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Registration steps" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Ticket", "Details", "Review"]);
    expect(screen.getByRole("radio", { name: /Early bird/ })).toBeEnabled();
    expect(screen.getByText("Only 5 left")).toBeInTheDocument();
    // Sold out, with its waiting list open: can't be chosen, can be waited for.
    expect(screen.getByRole("radio", { name: /Student/ })).toBeDisabled();
    expect(screen.getByText("Sold out · waiting list open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join the waiting list for Student" })).toBeInTheDocument();

    go();
    expect(await screen.findByText("Choose a ticket.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /VIP/ }));
    expect(screen.queryByText("Choose a ticket.")).toBeNull();
    go();
    await heading(/Your details/);
    fillDetails();
    go();
    await heading(/Review and pay/);
    const ticketBlock = screen.getByRole("region", { name: "Your ticket" });
    expect(within(ticketBlock).getByText("VIP · ₹499")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay ₹499" })).toBeInTheDocument();
    go();
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    const payload = eventsApi.registerForEvent.mock.calls[0][1];
    expect(payload).toMatchObject({ full_name: "Asha Rao", ticket_type_id: 13 });
    expect(payload).not.toHaveProperty("discount_code");
    await act(() => razorpay.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" }));
    const ticket = await screen.findByRole("region", { name: "Your ticket" });
    expect(within(ticket).getByText("VIP")).toBeInTheDocument();
  });

  it("opens the waiting list for a sold-out ticket right there", async () => {
    ticketingApi.joinWaitlist.mockResolvedValue({ id: "w1", ticketTypeId: 14, ticketTypeName: "Student", status: "waiting", position: 2, created: true });
    show(paid, { ticketing: SEVERAL });
    await heading(/Choose your ticket/);
    fireEvent.click(screen.getByRole("button", { name: "Join the waiting list for Student" }));
    const join = screen.getByRole("group", { name: "Join the waiting list" });
    expect(within(join).getByText("Join the waiting list for Student")).toBeInTheDocument();
    fireEvent.change(within(join).getByLabelText(/^Name/), { target: { value: "Asha Rao" } });
    fireEvent.change(within(join).getByLabelText(/^Email/), { target: { value: "asha@example.org" } });
    fireEvent.click(within(join).getByRole("button", { name: "Join the waiting list" }));
    expect(await screen.findByText("You're number 2 in line for Student")).toBeInTheDocument();
    expect(ticketingApi.joinWaitlist).toHaveBeenCalledWith("123", { ticketTypeId: 14, name: "Asha Rao", email: "asha@example.org", phone: null, whatsapp: false });
    expect(screen.getByText(/We'll tell you at asha@example.org/)).toBeInTheDocument();
  });

  it("a link to a hidden ticket lists it, chooses it and sends it, even when the event's own answer comes first", async () => {
    const withHidden = parseTicketing({ ...ONE, types: [TT(), TT({ id: 15, name: "Sponsor", description: "For our sponsors", price: 0, is_free: true, is_hidden: true, available: null })] });
    // The list naming the hidden type lands well after GET /events/info (which knows only the visible one).
    ticketingApi.types.mockImplementation(() => new Promise((r) => setTimeout(() => r(withHidden), 60)));
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA3", pay_amount: 0, event_registration_id: "r3", full_name: "Asha Rao", email: "asha@example.org", ticket_type: { id: 15, name: "Sponsor" } });
    show(paid, { ticketing: ONE, path: "/events/hack-night-04/register?ticket_type=15" });
    expect(await heading(/Choose your ticket/)).toBeInTheDocument();
    expect(ticketingApi.types).toHaveBeenCalledWith("123", { ticketType: 15 });
    expect(screen.getByRole("radio", { name: /Sponsor/ })).toBeChecked();
    go();
    await heading(/Your details/);
    fillDetails();
    go();
    await heading(/Review and confirm/);
    expect(screen.getByRole("button", { name: "Confirm registration" })).toBeInTheDocument();
    go();
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(eventsApi.registerForEvent.mock.calls[0][1].ticket_type_id).toBe(15);
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("a ticket that sold out meanwhile sends them back to choose another, and reads the tickets again", async () => {
    eventsApi.registerForEvent.mockRejectedValue(refuse(409, "Sold out", "TICKET_TYPE_SOLD_OUT", { ticket_type_id: 13, waitlist: false }));
    show(paid, { ticketing: SEVERAL });
    await heading(/Choose your ticket/);
    fireEvent.click(screen.getByRole("radio", { name: /VIP/ }));
    go();
    await heading(/Your details/);
    fillDetails();
    go();
    await heading(/Review and pay/);
    const reads = eventsApi.fetchEvent.mock.calls.length;
    go();
    expect(await heading(/Choose your ticket/)).toBeInTheDocument();
    expect(screen.getByText("This ticket just sold out. Choose another.")).toBeInTheDocument();
    await waitFor(() => expect(eventsApi.fetchEvent.mock.calls.length).toBeGreaterThan(reads));
    expect(window.Razorpay).not.toHaveBeenCalled();
  });
});

describe("a discount code", () => {
  it("is checked when applied, takes its share off the order, and a code that covers it all skips checkout", async () => {
    ticketingApi.checkCode.mockResolvedValue({ code: "EARLY20", ticket_type_id: 12, price: 199, discount: 199, amount: 0, free: true });
    eventsApi.registerForEvent.mockResolvedValue({
      ticket_id: "MOA2",
      pay_amount: 0,
      event_registration_id: "r2",
      full_name: "Asha Rao",
      email: "asha@example.org",
      ticket_type: { id: 12, name: "Early bird" },
      price: 199,
      discount: { code: "EARLY20", amount: 199 },
      is_paid: true,
    });
    await toReview(paid, { ticketing: ONE });
    expect(screen.getByRole("button", { name: "Pay ₹199" })).toBeInTheDocument();
    fireEvent.change(field(/^Discount code/), { target: { value: "early20" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("applied", { exact: false })).toBeInTheDocument();
    expect(ticketingApi.checkCode).toHaveBeenCalledWith("123", { code: "early20", ticketTypeId: 12, email: "asha@example.org", phone: "98765 43210" });
    const order = screen.getByRole("region", { name: "Your order" });
    expect(within(order).getByText("Discount")).toBeInTheDocument();
    expect(within(order).getByText("−₹199")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm registration" })).toBeInTheDocument();

    go();
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(screen.getByText(/Your code EARLY20 covered the ticket/)).toBeInTheDocument();
    const payload = eventsApi.registerForEvent.mock.calls[0][1];
    expect(payload.discount_code).toBe("EARLY20");
    // One ticket, chosen by nobody: sent as it always was.
    expect(payload).not.toHaveProperty("ticket_type_id");
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
    expect(window.Razorpay).not.toHaveBeenCalled();
  });

  it("says why a code won't do, under the field, and Enter never sends the form", async () => {
    ticketingApi.checkCode.mockRejectedValue(apiFailure({ response: { status: 409, data: { error_code: "DISCOUNT_CODE_EXPIRED" } } }));
    await toReview(paid, { ticketing: ONE });
    fireEvent.change(field(/^Discount code/), { target: { value: "OLD" } });
    fireEvent.keyDown(field(/^Discount code/), { key: "Enter" });
    expect(await screen.findByText("That code has expired.")).toBeInTheDocument();
    expect(eventsApi.registerForEvent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pay ₹199" })).toBeInTheDocument();
  });

  it("a code the registration refuses is said beside the field, on the review", async () => {
    ticketingApi.checkCode.mockResolvedValue({ code: "LAST1", ticket_type_id: 12, price: 199, discount: 50, amount: 149, free: false });
    eventsApi.registerForEvent.mockRejectedValue(refuse(409, "No uses left", "DISCOUNT_CODE_USED_UP"));
    await toReview(paid, { ticketing: ONE });
    fireEvent.change(field(/^Discount code/), { target: { value: "last1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("button", { name: "Pay ₹149" })).toBeInTheDocument();
    const before = screen.getByTestId("where").textContent;
    go();
    expect(await screen.findByText("That code has been used up.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /Review and pay/ })).toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toBe(before);
    expect(screen.getByRole("button", { name: "Pay ₹199" })).toBeInTheDocument();
    expect(window.Razorpay).not.toHaveBeenCalled();
  });

  it("isn't offered for a free ticket, nor by an older server", async () => {
    await toReview(paid);
    expect(screen.queryByLabelText(/^Discount code/)).toBeNull();
    go();
    await waitFor(() => expect(eventsApi.registerForEvent).toHaveBeenCalled());
    const payload = eventsApi.registerForEvent.mock.calls[0][1];
    expect(payload).not.toHaveProperty("ticket_type_id");
    expect(payload).not.toHaveProperty("discount_code");
  });
});

describe("a full event", () => {
  it("offers its waiting list when registering finds it full", async () => {
    eventsApi.registerForEvent.mockRejectedValue(refuse(400, "Event is full", "EVENT_FULL", { max_participants: 120, waitlist: true }));
    ticketingApi.joinWaitlist.mockResolvedValue({ id: "w2", ticketTypeId: 12, ticketTypeName: "Early bird", status: "waiting", position: 4, created: true });
    await toReview(paid, { ticketing: ONE });
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event is full");
    expect(alert).toHaveTextContent("Join the waiting list and we'll email you");
    const join = within(alert).getByRole("group", { name: "Join the waiting list" });
    fireEvent.change(within(join).getByLabelText(/^Name/), { target: { value: "Asha Rao" } });
    fireEvent.change(within(join).getByLabelText(/^Email/), { target: { value: "asha@example.org" } });
    fireEvent.change(within(join).getByLabelText(/^Phone number/), { target: { value: "98765 43210" } });
    fireEvent.click(within(join).getByLabelText(/Tell me on WhatsApp too/));
    fireEvent.click(within(join).getByRole("button", { name: "Join the waiting list" }));
    expect(await screen.findByText("You're number 4 in line for Early bird")).toBeInTheDocument();
    expect(ticketingApi.joinWaitlist).toHaveBeenCalledWith("123", { ticketTypeId: 12, name: "Asha Rao", email: "asha@example.org", phone: "98765 43210", whatsapp: true });
  });

  it("whose page says it's full offers the waiting list instead of the form", async () => {
    ticketingApi.types.mockResolvedValue(parseTicketing({ ...ONE, sold_out: true, types: [TT({ status: "sold_out", available: 0, waitlist: true })] }));
    ticketingApi.joinWaitlist.mockRejectedValue(apiFailure({ response: { status: 409, data: { error_code: "WAITLIST_NOT_NEEDED", errors: { available: 2 } } } }));
    show(variant({ status: "full", seats_left: 0 }));
    expect(await heading("This event is full")).toBeInTheDocument();
    expect(await screen.findByText(/You can still join its waiting list, below/)).toBeInTheDocument();
    expect(screen.getByText(/Early bird is sold out. Join the waiting list/)).toBeInTheDocument();
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Join the waiting list" }));
    const join = screen.getByRole("group", { name: "Join the waiting list" });
    fireEvent.click(within(join).getByRole("button", { name: "Join the waiting list" }));
    expect(await within(join).findByText("Enter your name.")).toBeInTheDocument();
    expect(ticketingApi.joinWaitlist).not.toHaveBeenCalled();
    fireEvent.change(within(join).getByLabelText(/^Name/), { target: { value: "Asha Rao" } });
    fireEvent.change(within(join).getByLabelText(/^Email/), { target: { value: "asha@example.org" } });
    fireEvent.click(within(join).getByRole("button", { name: "Join the waiting list" }));
    expect(await screen.findByText(/tickets are available again/)).toBeInTheDocument();
  });
});

describe("a cancelled event", () => {
  const off = variant({ status: "cancelled", cancellation: { reason: "The venue flooded.", cancelled_at: "2026-10-12T10:00:00+05:30" } });

  it("says so with the organisers' reason, and there's nothing to fill in", async () => {
    show(off);
    expect(await heading("This event was cancelled")).toBeInTheDocument();
    expect(screen.getByText("The venue flooded.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Cancelled on 12 Oct 2026, so it isn.t taking registrations/)).toBeInTheDocument();
    expect(screen.getByText("If you registered and paid online, your payment is being refunded in full.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Full name/)).toBeNull();
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
  });

  it("signed in with a paid ticket: the ticket is void and the money is on its way back, with no Finish payment", async () => {
    enableSignIn();
    signInAs();
    show(off, { info: { is_registered: true, is_paid: true, registration_id: "r9", ticket_id: "MOA9" } });
    expect(await screen.findByText("Your payment is being refunded.")).toBeInTheDocument();
    expect(screen.getByText(/Your ticket for it is no longer valid/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish payment" })).toBeNull();
  });

  it("signed in and waiting for payment: nothing to pay", async () => {
    enableSignIn();
    signInAs();
    show(off, { info: { is_registered: true, is_paid: false, registration_id: "r9", ticket_id: "MOA9" } });
    expect(await screen.findByText(/there's nothing to pay/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish payment" })).toBeNull();
  });

  it("cancelled while the form was open: registering says so", async () => {
    eventsApi.registerForEvent.mockRejectedValue(refuse(400, "This event was cancelled", "REGISTRATIONS_CLOSED", { closed_reason: "cancelled" }));
    await toReview(paid);
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event was cancelled");
    expect(alert).toHaveTextContent("Nothing was charged");
  });

  it("cancelled before the payment: checkout says so and charges nothing", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA4", pay_amount: 250, event_registration_id: "r4" });
    paymentsApi.createPaymentOrder.mockRejectedValue(Object.assign(new Error("This event was cancelled"), { code: "EVENT_CANCELLED", status: 409 }));
    await toReview(paid);
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event was cancelled");
    expect(alert).toHaveTextContent("nothing was charged");
    expect(window.Razorpay).not.toHaveBeenCalled();
  });
});

/* An event whose club confirms each place has no waiting list: the form and the full page offer none. */
describe("an event whose club confirms each place: no waiting list", () => {
  it("the ticket picker shows a sold-out ticket as sold out, with no list to join", async () => {
    // As an older server might still send it: the list on, the sold-out type offering it.
    show(variant({ requires_approval: true }), { ticketing: SEVERAL, info: { requires_approval: true } });
    expect(await heading(/Choose your ticket/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Student/ })).toBeDisabled();
    expect(screen.queryByText("Sold out · waiting list open")).toBeNull();
    expect(screen.queryByRole("button", { name: /Join the waiting list/ })).toBeNull();
  });

  it("whose page says it's full: no waiting list, only the way back", async () => {
    ticketingApi.types.mockResolvedValue(parseTicketing({ ...ONE, sold_out: true, types: [TT({ status: "sold_out", available: 0, waitlist: true })] }));
    show(variant({ status: "full", seats_left: 0, requires_approval: true }));
    expect(await heading("This event is full")).toBeInTheDocument();
    await waitFor(() => expect(ticketingApi.types).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByText(/Keep an eye on the event page in case a seat opens up/)).toBeInTheDocument();
    expect(screen.queryByText(/join its waiting list/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Join the waiting list" })).toBeNull();
  });
});
