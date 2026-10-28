import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fullEvent, sparseEvent } from "@/test/eventFixture";

/*
 * The registration form for an event whose club reviews every registration
 * (registration approval). The form always says it understands that
 * (`accepts_approval: true`); the server answers with a registration under
 * review (`approval`) instead of a ticket, and nothing is paid. The API is
 * mocked; Razorpay is a fake that must never open; nothing leaves the test.
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
const reviewing = (page) => ({ ...page, event: { ...page.event, requires_approval: true } });

const TOKEN = "Rq7abcdefghijklmnopqrstuvwxyz012";
const CLAIM = "Cl4im-token-abcdefghijklmnop";
const APPROVAL = {
  approval: { id: "r1", status: "pending", submitted_at: "2026-10-26T10:15:00+05:30", token: TOKEN, status_url: `https://myotherapp.in/requests/${TOKEN}` },
  event_registration_id: null,
};
const TEE = { id: "tee", name: "Hack Night tee", description: null, photo_url: null, price: 450, left: null, variants: [{ id: "m", label: "M", left: 30 }] };
// Never said on an event that reviews registrations.
const OLD_WORDS = /request a place|confirms each place|your request|waiting list|send request/i;

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

describe("a paid event whose club reviews every registration", () => {
  it("says so on the way, says Register, and pays nothing", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ...APPROVAL, auth_token: { access_token: "guest-a", refresh_token: "guest-r" } });
    show(paid, { info: { requires_approval: true }, items: [TEE] });
    await heading(/Your details/);
    expect(screen.getByText(/reviews every registration/, { selector: ".rg-lede" })).toHaveTextContent(
      "It takes a minute. Circuit Society reviews every registration and emails tickets to the people it confirms.",
    );
    // No add-ons when registrations are reviewed: Details, then Review.
    expect(within(screen.getByRole("list", { name: "Registration steps" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Details", "Review"]);
    fillDetails();
    go();
    expect(await heading(/Review and register/)).toBeInTheDocument();
    expect(screen.getByText(/then register/)).toHaveTextContent(
      "Check everything is right, then register. Circuit Society reviews every registration and emails tickets to the people it confirms. You pay only if yours is confirmed.",
    );
    expect(screen.getByText(/confirms your registration/, { selector: ".rg-mailnote span" })).toHaveTextContent(
      "If Circuit Society confirms your registration, we’ll email asha@example.org a link to pay.",
    );
    expect(screen.getByText(/Add-ons can.t be picked/)).toHaveTextContent("Add-ons can’t be picked when registrations are reviewed.");
    expect(screen.queryByText(/handled securely by Razorpay/)).toBeNull();
    expect(document.querySelector(".rg-bar-total")).toHaveTextContent("Price₹250");
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
    expect(document.querySelector(".rg-main")).not.toHaveTextContent(OLD_WORDS);

    go();
    expect(await heading("You’re registered!")).toBeInTheDocument();
    const [, payload] = eventsApi.registerForEvent.mock.calls[0];
    expect(payload).toEqual({ full_name: "Asha Rao", email: "asha@example.org", phone: "98765 43210", additional_details: {}, accepts_approval: true });
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
    expect(window.Razorpay).not.toHaveBeenCalled();

    expect(screen.getByText(/If yours is confirmed, your ticket/)).toHaveTextContent(
      "Circuit Society reviews every registration. If yours is confirmed, your ticket will come by email.",
    );
    expect(screen.getByText(/check on your registration/)).toHaveTextContent("We’ve emailed you a link to check on your registration, at asha@example.org.");
    expect(screen.getByText(/Nothing has been charged/)).toHaveTextContent("Nothing has been charged. If yours is confirmed, we’ll email you a link to pay ₹250.");
    expect(screen.getByRole("link", { name: "See your registration" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.getAllByText("asha@example.org").length).toBeGreaterThan(0);
    expect(document.querySelector(".rg-main")).not.toHaveTextContent(OLD_WORDS);
    // No ticket, no QR.
    expect(screen.queryByRole("region", { name: "Your ticket" })).toBeNull();
  });

  it("says it's registering while it does", async () => {
    eventsApi.registerForEvent.mockReturnValue(new Promise(() => {}));
    await toReview(reviewing(paid));
    go();
    expect(await screen.findByRole("button", { name: /Registering…/ })).toBeDisabled();
  });

  it("is still registered after a reload, and leaving the page forgets it", async () => {
    eventsApi.registerForEvent.mockResolvedValue(APPROVAL);
    await toReview(reviewing(paid));
    go();
    await heading("You’re registered!");
    expect(JSON.parse(sessionStorage.getItem("moa.register.done.123"))).toMatchObject({ kind: "request", request: { token: TOKEN } });
    cleanup();
    show(reviewing(paid));
    expect(await heading("You’re registered!")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your registration" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    cleanup();
    await waitFor(() => expect(sessionStorage.getItem("moa.register.done.123")).toBeNull());
  });

  it("goes by the event page's word when the form's own read doesn't say", async () => {
    await toReview(reviewing(paid));
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  it("goes by the form's own read over the event page's", async () => {
    await toReview(reviewing(paid), { info: { requires_approval: false } });
    expect(screen.getByRole("button", { name: "Pay ₹250" })).toBeInTheDocument();
  });
});

describe("the form sent again for an address with a registration open", () => {
  it("signed out: the answer has no link, so it says the link was emailed again", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ approval: { ...APPROVAL.approval, token: null, status_url: null }, event_registration_id: null });
    await toReview(reviewing(paid));
    go();
    expect(await heading("You’ve already registered")).toBeInTheDocument();
    expect(screen.getByText(/emailed the link to your registration/)).toHaveTextContent("We’ve emailed the link to your registration to asha@example.org again.");
    expect(screen.queryByText(/check on your registration/)).toBeNull();
    expect(screen.queryByRole("link", { name: "See your registration" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/hack-night-04");
  });

  it("one the club confirmed already says so", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ approval: { ...APPROVAL.approval, status: "approved" }, event_registration_id: null });
    await toReview(reviewing(paid));
    go();
    expect(await heading("Your registration is confirmed")).toBeInTheDocument();
    expect(screen.getByText(/has confirmed it/)).toHaveTextContent("You registered for Hack Night 04 already, and Circuit Society has confirmed it.");
    expect(screen.queryByText(/Nothing has been charged/)).toBeNull();
    expect(screen.getByRole("link", { name: "See your registration" })).toHaveAttribute("href", `/requests/${TOKEN}`);
  });
});

describe("signed in, with a registration open already", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it("under review: its page instead of the form", async () => {
    show(reviewing(paid), { info: { requires_approval: true, ticketing: { types: [], viewer_request: { id: "r1", status: "pending", token: TOKEN, status_url: null } } } });
    expect(await heading("Your registration is under review")).toBeInTheDocument();
    expect(screen.getByText(/If yours is confirmed/)).toHaveTextContent("Circuit Society reviews every registration. If yours is confirmed, your ticket will come by email.");
    expect(screen.getByRole("link", { name: "See your registration" })).toHaveAttribute("href", `/requests/${TOKEN}`);
    expect(screen.queryByLabelText(/^Full name/)).toBeNull();
  });

  it("confirmed and not paid: pay now, on its page", async () => {
    show(reviewing(paid), { info: { requires_approval: true, ticketing: { types: [], viewer_request: { id: "r1", status: "approved", token: TOKEN, status_url: null } } } });
    expect(await heading("Your registration is confirmed")).toBeInTheDocument();
    expect(screen.getByText("Pay to get your ticket.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pay now" })).toHaveAttribute("href", `/requests/${TOKEN}`);
  });

  it("confirmed, with a pay link from the API: the amount, the time and the claim page", async () => {
    const viewer_request = { id: "r1", status: "approved", token: TOKEN, pay: { amount: 250, pay_by: "2026-10-27T10:15:00+05:30", claim_token: CLAIM } };
    show(reviewing(paid), { info: { requires_approval: true, ticketing: { types: [], viewer_request } } });
    expect(await heading("Your registration is confirmed")).toBeInTheDocument();
    expect(screen.getByText(/to get your ticket/)).toHaveTextContent("Pay ₹250 by Tue, 27 Oct · 10:15 AM IST to get your ticket.");
    expect(screen.getByRole("link", { name: "Pay ₹250" })).toHaveAttribute("href", `/claim/${CLAIM}`);
  });

  it("a closed one leaves the form", async () => {
    show(reviewing(paid), { info: { requires_approval: true, ticketing: { types: [], viewer_request: { id: "r1", status: "declined", token: TOKEN } } } });
    expect(await heading(/Your details/)).toBeInTheDocument();
  });
});

describe("a free event whose club reviews every registration", () => {
  it("registers, and the ticket follows by email if it is confirmed", async () => {
    eventsApi.registerForEvent.mockResolvedValue(APPROVAL);
    await toReview(reviewing(free));
    expect(screen.getByText(/confirms your registration/, { selector: ".rg-mailnote span" })).toHaveTextContent(
      "If Yasya confirms your registration, we’ll email asha@example.org your ticket.",
    );
    expect(screen.queryByText(/You pay only/)).toBeNull();
    expect(document.querySelector(".rg-bar-total")).toHaveTextContent("PriceFree");
    go();
    expect(await heading("You’re registered!")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing has been charged/)).toBeNull();
  });

  it("signed in, says it's in My tickets too, under Under review", async () => {
    enableSignIn();
    signInAs();
    eventsApi.registerForEvent.mockResolvedValue(APPROVAL);
    show(reviewing(free));
    await heading(/Your details/);
    fireEvent.change(field(/^Phone number/), { target: { value: "98765 43210" } });
    go();
    await heading(/Review and register/);
    go();
    expect(await heading("You’re registered!")).toBeInTheDocument();
    expect(screen.getByText(/too, under/)).toHaveTextContent("It’s in My tickets too, under “Under review”.");
    expect(screen.getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/me/tickets");
  });
});

describe("the club's refusals", () => {
  it("one declined before is said plainly, with the way back", async () => {
    eventsApi.registerForEvent.mockRejectedValue(refuse(409, "The organisers couldn't confirm your registration.", "REQUEST_DECLINED"));
    await toReview(reviewing(paid));
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You can't register again");
    expect(alert).toHaveTextContent("Circuit Society couldn't confirm your registration for this event, so you can't register again with this email.");
    expect(within(alert).getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.queryByText("You're already registered")).toBeNull();
  });

  it("APPROVAL_REQUIRED (never expected from this form) asks for a reload", async () => {
    eventsApi.registerForEvent.mockRejectedValue(refuse(409, "This event reviews every registration.", "APPROVAL_REQUIRED"));
    await toReview(paid);
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event reviews registrations now");
    expect(alert).toHaveTextContent("Reload this page and register again.");
    expect(within(alert).getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });
});

describe("add-ons sent after the club turned reviewing on", () => {
  it("ADD_ONS_NOT_ALLOWED: the add-ons come off, and registering again sends none", async () => {
    eventsApi.registerForEvent.mockRejectedValueOnce(refuse(422, "Add-ons can't be picked when registrations are reviewed.", "ADD_ONS_NOT_ALLOWED")).mockResolvedValueOnce(APPROVAL);
    show(paid, { items: [TEE] });
    await heading(/Your details/);
    fillDetails();
    go();
    await heading(/Add to your ticket/);
    fireEvent.click(screen.getByRole("radio", { name: /^M/ }));
    go();
    await heading(/Review and pay/);
    expect(screen.getByRole("button", { name: "Pay ₹700" })).toBeInTheDocument();
    go();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event reviews registrations now");
    expect(alert).toHaveTextContent("Add-ons can't be picked when registrations are reviewed, so they've been removed. Check your details and register again.");
    expect(within(alert).queryByRole("button", { name: "Reload the page" })).toBeNull();
    // The form is the reviewing event's now: no add-ons step, the ticket's price only, and Register.
    const steps = within(screen.getByRole("list", { name: "Registration steps" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toHaveLength(2);
    expect(steps.join(" ")).not.toMatch(/Add-ons/);
    expect(document.querySelector(".rg-bar-total")).toHaveTextContent("Price₹250");
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
    expect(eventsApi.registerForEvent.mock.calls[0][1].store).toEqual([{ item_id: "tee", variant_id: "m", qty: 1 }]);
    go();
    expect(await heading("You’re registered!")).toBeInTheDocument();
    expect(eventsApi.registerForEvent.mock.calls[1][1]).not.toHaveProperty("store");
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });
});

describe("an event without the setting", () => {
  it("is the form it always was, saying only that it understands reviewed registrations", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA1", pay_amount: 0, full_name: "Asha Rao", email: "asha@example.org" });
    await toReview(free);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Review and confirm");
    expect(screen.queryByText(/reviews every registration/)).toBeNull();
    expect(document.querySelector(".rg-bar-total")).toHaveTextContent("TotalFree");
    go();
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(eventsApi.registerForEvent.mock.calls[0][1].accepts_approval).toBe(true);
  });

  it("still shows the registration under review when the server answers with one (the club turned it on meanwhile)", async () => {
    eventsApi.registerForEvent.mockResolvedValue(APPROVAL);
    await toReview(paid);
    expect(screen.getByRole("button", { name: "Pay ₹250" })).toBeInTheDocument();
    go();
    expect(await heading("You’re registered!")).toBeInTheDocument();
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("registers and pays as before when the club turned it off meanwhile", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA2", pay_amount: 250, event_registration_id: "r2", full_name: "Asha Rao", email: "asha@example.org" });
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 25000, razorpay_order_id: "order_2" });
    await toReview(reviewing(paid));
    go();
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("123", "r2");
  });
});
