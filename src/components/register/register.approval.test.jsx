import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fullEvent, sparseEvent } from "@/test/eventFixture";

/*
 * The registration form for an event whose club confirms each place
 * (registration approval). The form always says it understands requests
 * (`accepts_approval: true`); the server answers with a request
 * (`approval`) instead of a ticket, and nothing is paid. The API is mocked;
 * Razorpay is a fake that must never open; nothing leaves the test.
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
const { forgetTicketing } = await import("./tickets.jsx");
const Register = (await import("./register.jsx")).default;
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const paid = parseEventPage(fullEvent());
const free = parseEventPage(sparseEvent());
const asking = (page) => ({ ...page, event: { ...page.event, requires_approval: true } });

const TOKEN = "Rq7abcdefghijklmnopqrstuvwxyz012";
const APPROVAL = {
  approval: { id: "r1", status: "pending", submitted_at: "2026-10-26T10:15:00+05:30", token: TOKEN, status_url: `https://myotherapp.in/requests/${TOKEN}` },
  event_registration_id: null,
};
const TEE = { id: "tee", name: "Hack Night tee", description: null, photo_url: null, price: 450, left: null, variants: [{ id: "m", label: "M", left: 30 }] };

function show(page, { info = {}, items = [] } = {}) {
  eventsApi.fetchEvent.mockResolvedValue({ id: page.event.id, additional_details: [], reg_fee: page.event.fee, ...info });
  eventsApi.fetchStoreCatalog.mockResolvedValue({ enabled: items.length > 0, items });
  return render(
    <MemoryRouter initialEntries={[`/events/${page.event.slug}/register`]}>
      <AuthProvider>
        <Routes>
          <Route path="/events/:slug/register" element={<Register event={page.event} club={page.club} />} />
        </Routes>
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

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  forgetTicketing();
  sessionStorage.clear();
  localStorage.clear();
  window.scrollTo = vi.fn();
  window.Razorpay = vi.fn(function () {
    this.open = vi.fn();
  });
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

describe("a paid event whose club confirms each place", () => {
  it("says so on the way, asks for a place, sends a request and pays nothing", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ...APPROVAL, auth_token: { access_token: "guest-a", refresh_token: "guest-r" } });
    show(paid, { info: { requires_approval: true }, items: [TEE] });
    await heading(/Your details/);
    expect(screen.getByText(/confirms each place/, { selector: ".rg-lede" })).toHaveTextContent(
      "It takes a minute. Circuit Society confirms each place, and your ticket comes by email when they do.",
    );
    // A request carries no add-ons: Details, then Review.
    expect(within(screen.getByRole("list", { name: "Registration steps" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Details", "Review"]);
    fillDetails();
    go();
    expect(await heading(/Review and send/)).toBeInTheDocument();
    expect(screen.getByText(/then send your request/)).toHaveTextContent(
      "Check everything is right, then send your request. Circuit Society confirms each place, and you pay only once they do.",
    );
    expect(screen.getByText(/as soon as/, { selector: ".rg-mailnote span" })).toHaveTextContent(
      "We’ll email asha@example.org as soon as Circuit Society confirms your place, with a link to pay.",
    );
    expect(screen.queryByText(/handled securely by Razorpay/)).toBeNull();
    expect(document.querySelector(".rg-bar-total")).toHaveTextContent("Price₹250");
    expect(screen.getByRole("button", { name: "Request a place" })).toBeInTheDocument();

    go();
    expect(await heading("You’re on the waiting list")).toBeInTheDocument();
    const [, payload] = eventsApi.registerForEvent.mock.calls[0];
    expect(payload).toEqual({ full_name: "Asha Rao", email: "asha@example.org", phone: "98765 43210", additional_details: {}, accepts_approval: true });
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
    expect(window.Razorpay).not.toHaveBeenCalled();

    expect(screen.getByText(/confirms each registration/)).toHaveTextContent(
      "Circuit Society confirms each registration. We’ve emailed you, and your ticket will come by email as soon as they confirm your place.",
    );
    expect(screen.getByText(/Nothing has been charged/)).toHaveTextContent("Nothing has been charged. If they confirm, the email has a link to pay ₹250.");
    expect(screen.getByRole("link", { name: "See your request" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.getByText("asha@example.org")).toBeInTheDocument();
    // No ticket, no QR.
    expect(screen.queryByRole("region", { name: "Your ticket" })).toBeNull();
  });

  it("is still a request after a reload, and leaving the page forgets it", async () => {
    eventsApi.registerForEvent.mockResolvedValue(APPROVAL);
    await toReview(asking(paid));
    go();
    await heading("You’re on the waiting list");
    expect(JSON.parse(sessionStorage.getItem("moa.register.done.123"))).toMatchObject({ kind: "request", request: { token: TOKEN } });
    cleanup();
    show(asking(paid));
    expect(await heading("You’re on the waiting list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your request" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    cleanup();
    await waitFor(() => expect(sessionStorage.getItem("moa.register.done.123")).toBeNull());
  });

  it("goes by the event page's word when the form's own read doesn't say", async () => {
    await toReview(asking(paid));
    expect(screen.getByRole("button", { name: "Request a place" })).toBeInTheDocument();
  });

  it("goes by the form's own read over the event page's", async () => {
    await toReview(asking(paid), { info: { requires_approval: false } });
    expect(screen.getByRole("button", { name: "Pay ₹250" })).toBeInTheDocument();
  });
});

describe("the form sent again for an address with a request open", () => {
  it("signed out: the answer has no link, so it says the link was emailed", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ approval: { ...APPROVAL.approval, token: null, status_url: null }, event_registration_id: null });
    await toReview(asking(paid));
    go();
    expect(await heading("You’re on the waiting list")).toBeInTheDocument();
    expect(screen.getByText(/emailed you the link/)).toHaveTextContent(
      "We’ve emailed you the link, at asha@example.org. It shows where your request stands, and lets you withdraw it.",
    );
    expect(screen.queryByRole("link", { name: "See your request" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/hack-night-04");
  });

  it("one the club confirmed already says so, not the waiting list", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ approval: { ...APPROVAL.approval, status: "approved" }, event_registration_id: null });
    await toReview(asking(paid));
    go();
    expect(await heading("Circuit Society confirmed your place")).toBeInTheDocument();
    expect(screen.getByText(/has confirmed it/)).toHaveTextContent("You asked for a place at Hack Night 04 already, and Circuit Society has confirmed it.");
    expect(screen.queryByText(/Nothing has been charged/)).toBeNull();
    expect(screen.getByRole("link", { name: "See your request" })).toHaveAttribute("href", `/requests/${TOKEN}`);
  });
});

describe("signed in, with a request open already", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it.each([
    ["pending", "You've asked for a place", "See your request"],
    ["approved", "Circuit Society confirmed your place", "Pay for your ticket"],
  ])("%s: its page instead of the form", async (status, title, go) => {
    show(asking(paid), { info: { requires_approval: true, ticketing: { types: [], viewer_request: { id: "r1", status, token: TOKEN, status_url: null } } } });
    expect(await heading(title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: go })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.queryByLabelText(/^Full name/)).toBeNull();
  });

  it("a closed one leaves the form", async () => {
    show(asking(paid), { info: { requires_approval: true, ticketing: { types: [], viewer_request: { id: "r1", status: "declined", token: TOKEN } } } });
    expect(await heading(/Your details/)).toBeInTheDocument();
  });
});

describe("a free event whose club confirms each place", () => {
  it("asks for a place, and the ticket follows by email", async () => {
    eventsApi.registerForEvent.mockResolvedValue(APPROVAL);
    await toReview(asking(free));
    expect(screen.getByText(/as soon as/, { selector: ".rg-mailnote span" })).toHaveTextContent(
      "We’ll email asha@example.org as soon as Yasya confirms your place, with your ticket.",
    );
    expect(document.querySelector(".rg-bar-total")).toHaveTextContent("PriceFree");
    go();
    expect(await heading("You’re on the waiting list")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing has been charged/)).toBeNull();
  });

  it("signed in, says it's in My tickets too", async () => {
    enableSignIn();
    signInAs();
    eventsApi.registerForEvent.mockResolvedValue(APPROVAL);
    show(asking(free));
    await heading(/Your details/);
    fireEvent.change(field(/^Phone number/), { target: { value: "98765 43210" } });
    go();
    await heading(/Review and send/);
    go();
    expect(await heading("You’re on the waiting list")).toBeInTheDocument();
    expect(screen.getByText(/under Waiting for confirmation/)).toHaveTextContent("It’s in My tickets too, under Waiting for confirmation.");
    expect(screen.getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/me/tickets");
  });
});

describe("the club's refusals", () => {
  it("a request declined before is said plainly, with the way back", async () => {
    eventsApi.registerForEvent.mockRejectedValue(refuse(409, "The club declined your request.", "REQUEST_DECLINED"));
    await toReview(asking(paid));
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You can't request a place again");
    expect(alert).toHaveTextContent("Circuit Society couldn't offer you a place at this event, so another request can't be sent from this email.");
    expect(within(alert).getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.queryByText("You're already registered")).toBeNull();
  });

  it("APPROVAL_REQUIRED (never expected from this form) asks for a reload", async () => {
    eventsApi.registerForEvent.mockRejectedValue(refuse(409, "This event needs the club to confirm each place.", "APPROVAL_REQUIRED"));
    await toReview(paid);
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event's places are confirmed by the club");
    expect(alert).toHaveTextContent("Reload this page and send your details again");
    expect(within(alert).getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });
});

describe("add-ons sent after the club turned it on", () => {
  it("ADD_ONS_NOT_ALLOWED asks for a reload", async () => {
    eventsApi.registerForEvent.mockRejectedValue(refuse(422, "A request holds no add-ons.", "ADD_ONS_NOT_ALLOWED"));
    await toReview(paid);
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("a request can't include add-ons");
    expect(within(alert).getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
  });
});

describe("an event without the setting", () => {
  it("is the form it always was, saying only that it understands requests", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA1", pay_amount: 0, full_name: "Asha Rao", email: "asha@example.org" });
    await toReview(free);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Review and confirm");
    expect(screen.queryByText(/confirms each place/)).toBeNull();
    expect(document.querySelector(".rg-bar-total")).toHaveTextContent("TotalFree");
    go();
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(eventsApi.registerForEvent.mock.calls[0][1].accepts_approval).toBe(true);
  });

  it("still shows a request when the server answers with one (the club turned it on meanwhile)", async () => {
    eventsApi.registerForEvent.mockResolvedValue(APPROVAL);
    await toReview(paid);
    expect(screen.getByRole("button", { name: "Pay ₹250" })).toBeInTheDocument();
    go();
    expect(await heading("You’re on the waiting list")).toBeInTheDocument();
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("registers and pays as before when the club turned it off meanwhile", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA2", pay_amount: 250, event_registration_id: "r2", full_name: "Asha Rao", email: "asha@example.org" });
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 25000, razorpay_order_id: "order_2" });
    await toReview(asking(paid));
    go();
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("123", "r2");
  });
});
