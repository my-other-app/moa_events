import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fullEvent, sparseEvent } from "@/test/eventFixture";

// A made-up test key, set before payment.js reads it: never a real one.
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY", "rzp_test_not_a_real_key");
});

vi.mock("@/api/events", () => ({
  eventsApi: {
    fetchEvent: vi.fn(),
    fetchStoreCatalog: vi.fn(),
    registerForEvent: vi.fn(),
  },
}));
vi.mock("@/api/payments", () => ({
  paymentsApi: { createPaymentOrder: vi.fn(), verifyPayment: vi.fn() },
}));
vi.mock("@/utils/loadScript", () => ({ loadScript: vi.fn(() => Promise.resolve(true)) }));
const get = vi.fn();
const post = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post, delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { eventsApi } = await import("@/api/events");
const { paymentsApi } = await import("@/api/payments");
const { parseEventPage } = await import("@/api/discover");
const { AuthProvider } = await import("@/auth/AuthProvider");
const Register = (await import("./register.jsx")).default;
const { PROFILE, accessToken, enableSignIn, googleCredential, resetAuth, signInAs, stubGoogle } = await import("@/test/auth");

const paid = parseEventPage(fullEvent());
const free = parseEventPage(sparseEvent());

function show(page) {
  eventsApi.fetchEvent.mockResolvedValue({ id: page.event.id, additional_details: [], reg_fee: page.event.fee });
  eventsApi.fetchStoreCatalog.mockResolvedValue({ enabled: false, items: [] });
  return render(
    <MemoryRouter initialEntries={[`/events/${page.event.slug}/register`]}>
      <AuthProvider>
        <Routes>
          <Route path="/events/:slug/register" element={<Register event={page.event} club={page.club} />} />
          <Route path="/me/tickets" element={<p>my tickets page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const field = (re) => screen.getByLabelText(re);
const go = () => fireEvent.click(document.querySelector(".rg-go"));
const heading = (name) => screen.findByRole("heading", { level: 1, name });

let razorpay;
beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  razorpay = null;
  window.Razorpay = vi.fn(function (options) {
    razorpay = options;
    this.open = vi.fn();
  });
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterEach(() => {
  delete window.Razorpay;
  delete window.matchMedia;
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("registering signed in", () => {
  beforeEach(() => {
    enableSignIn();
    stubGoogle();
    signInAs();
  });

  it("fills in the account's name and email, and the email can't be changed", async () => {
    show(free);
    expect(await heading(/Your details/)).toBeInTheDocument();
    expect(field(/^Full name/)).toHaveValue("Asha Rao");
    expect(field(/^Email/)).toHaveValue("asha@example.org");
    expect(field(/^Email/)).toHaveAttribute("readonly");
    expect(field(/^Phone number/)).toHaveValue("98765 43210");
    const note = screen.getByText(/Signed in as/).closest("p");
    expect(note).toHaveTextContent("Signed in as asha@example.org · Not you? Sign out");
    expect(within(note).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    // No "sign in" nudge for someone already signed in.
    expect(screen.queryByText(/Have the app\?/)).toBeNull();
    expect(screen.getByText(/lands in your MyOtherApp app/)).toBeInTheDocument();
  });

  it("registers as the account and says the ticket is in the app", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA77", pay_amount: 0, full_name: "Asha Rao", email: "asha@example.org" });
    show(free);
    await heading(/Your details/);
    go();
    await heading(/Review and confirm/);
    expect(screen.getByText(/and into your MyOtherApp app/)).toBeInTheDocument();
    go();
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(eventsApi.registerForEvent).toHaveBeenCalledWith("124", {
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: {},
      accepts_approval: true,
    });
    expect(screen.getByText("It’s in your MyOtherApp app")).toBeInTheDocument();
    expect(screen.queryByText("Your ticket is also in your email.")).toBeNull();
    expect(screen.queryByText(/Sign in to the MyOtherApp app with/)).toBeNull();
    expect(screen.getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/me/tickets");
    // No guest token: the ticket is the account's.
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("pays exactly as before: register, then the order, then Razorpay", async () => {
    eventsApi.registerForEvent.mockResolvedValue({
      ticket_id: "MOA123",
      pay_amount: 250,
      event_registration_id: "reg-1",
      full_name: "Asha Rao",
      email: "asha@example.org",
    });
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 25000, razorpay_order_id: "order_1" });
    paymentsApi.verifyPayment.mockResolvedValue({ status: "captured" });
    show(paid);
    await heading(/Your details/);
    go();
    await heading(/Review and pay/);
    go();
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(eventsApi.registerForEvent).toHaveBeenCalledWith("123", {
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: {},
      accepts_approval: true,
    });
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("123", "reg-1");
    expect(eventsApi.registerForEvent.mock.invocationCallOrder[0]).toBeLessThan(paymentsApi.createPaymentOrder.mock.invocationCallOrder[0]);
    expect(razorpay.prefill).toEqual({ name: "Asha Rao", email: "asha@example.org", contact: "98765 43210" });
    await act(() => razorpay.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" }));
    expect(paymentsApi.verifyPayment).toHaveBeenCalledWith("order_1", "pay_1");
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(screen.getByText("It’s in your MyOtherApp app")).toBeInTheDocument();
  });

  it("points an account already on the list to My tickets, not to another email", async () => {
    eventsApi.registerForEvent.mockRejectedValue(
      Object.assign(new Error("Already registered for this event"), { status: 400, data: { message: "Already registered for this event" } }),
    );
    show(free);
    await heading(/Your details/);
    go();
    await heading(/Review and confirm/);
    go();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("You're already registered")).toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: "Open My tickets" })).toHaveAttribute("href", "/me/tickets");
    expect(within(alert).queryByRole("button", { name: /different email/ })).toBeNull();
  });

  it("asks to sign in again when the sign-in ran out, instead of registering as a guest", async () => {
    eventsApi.registerForEvent.mockRejectedValue(Object.assign(new Error("Your sign-in has expired. Sign in again."), { status: 401, authExpired: true }));
    show(free);
    await heading(/Your details/);
    go();
    await heading(/Review and confirm/);
    go();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Sign in again")).toBeInTheDocument();
    expect(alert).toHaveTextContent("Sign in again to keep this ticket in your account, or register with your email.");
    fireEvent.click(within(alert).getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("dialog", { name: "Sign in to register" })).toBeInTheDocument();
  });

  it("signing out from the form lets the email be typed again", async () => {
    show(free);
    await heading(/Your details/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(field(/^Email/)).not.toHaveAttribute("readonly"));
    expect(screen.getByText(/Have the app\?/)).toBeInTheDocument();
    fireEvent.change(field(/^Email/), { target: { value: "someone@example.org" } });
    expect(field(/^Email/)).toHaveValue("someone@example.org");
  });
});

describe("signed in, with a registration already there", () => {
  beforeEach(() => {
    enableSignIn();
    stubGoogle();
    signInAs();
  });

  /** GET /events/info/{id} for the signed-in person (backend#68). */
  const mine = (over = {}) => ({ id: 123, additional_details: [], reg_fee: 250, is_registered: true, is_paid: false, registration_id: "reg-9", ticket_id: "MOA9", ...over });
  const coded = (code, status, message) => Object.assign(new Error(message), { code, status, stage: "order", errors: null, network: false });

  function showMine(page, data) {
    eventsApi.fetchEvent.mockResolvedValue(data);
    eventsApi.fetchStoreCatalog.mockResolvedValue({ enabled: false, items: [] });
    return render(
      <MemoryRouter initialEntries={[`/events/${page.event.slug}/register`]}>
        <AuthProvider>
          <Routes>
            <Route path="/events/:slug/register" element={<Register event={page.event} club={page.club} />} />
            <Route path="/me/tickets" element={<p>my tickets page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it("pays one waiting for payment as it stands: no form, the order for its id, Razorpay with the order's key, the check, the ticket", async () => {
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 25000, razorpay_order_id: "order_9", key_id: "rzp_test_club_not_real" });
    paymentsApi.verifyPayment.mockResolvedValue({ payment_status: "captured" });
    showMine(paid, mine());
    expect(await heading("Finish your payment")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Full name/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finish payment" }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("123", "reg-9");
    expect(razorpay).toMatchObject({ key: "rzp_test_club_not_real", order_id: "order_9", prefill: { name: "Asha Rao", email: "asha@example.org" } });
    await act(() => razorpay.handler({ razorpay_order_id: "order_9", razorpay_payment_id: "pay_9" }));
    expect(paymentsApi.verifyPayment).toHaveBeenCalledWith("order_9", "pay_9");
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(screen.getByText("MOA9")).toBeInTheDocument();
    expect(screen.getByText(/your payment of ₹250 went through/)).toBeInTheDocument();
    expect(eventsApi.registerForEvent).not.toHaveBeenCalled();
  });

  it("offers it past the registration deadline too (until the event ends), and counts ALREADY_PAID as paid", async () => {
    const closed = parseEventPage(fullEvent({ event: { ...fullEvent().event, registration_open: false, reg_opens_at: null, reg_closes_at: "2026-10-01T23:59:00+05:30" } }));
    paymentsApi.createPaymentOrder.mockRejectedValue(coded("ALREADY_PAID", 409, "This registration is already paid for."));
    showMine(closed, mine());
    expect(await heading("Finish your payment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish payment" }));
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(window.Razorpay).not.toHaveBeenCalled();
    expect(eventsApi.registerForEvent).not.toHaveBeenCalled();
  });

  it("says why when the order is refused (EVENT_ENDED), keeping the button", async () => {
    paymentsApi.createPaymentOrder.mockRejectedValue(coded("EVENT_ENDED", 409, "This event is over; it can no longer be paid for."));
    showMine(paid, mine());
    fireEvent.click(await screen.findByRole("button", { name: "Finish payment" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This event is over");
    expect(screen.getByRole("button", { name: "Finish payment" })).not.toBeDisabled();
  });

  it("doesn't offer it once the event has ended", async () => {
    const over = parseEventPage(fullEvent({ event: { ...fullEvent().event, status: "ended", registration_open: false } }));
    showMine(over, mine());
    expect(await heading("This event has ended")).toBeInTheDocument();
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Finish payment" })).toBeNull();
  });

  it("shows the ticket of one already paid for, instead of the form", async () => {
    showMine(paid, mine({ is_paid: true }));
    expect(await heading("You're registered")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View your ticket" })).toHaveAttribute("href", "/tickets/MOA9");
    expect(screen.getByRole("link", { name: "My tickets" })).toHaveAttribute("href", "/me/tickets");
    expect(screen.queryByLabelText(/^Full name/)).toBeNull();
  });

  it("keeps the form's old way on a server that doesn't say whether it is paid", async () => {
    showMine(paid, { id: 123, additional_details: [], reg_fee: 250, is_registered: true, ticket_id: "MOA9" });
    expect(await heading(/Your details/)).toBeInTheDocument();
    expect(screen.queryByText("Finish your payment")).toBeNull();
  });

  it("finishes the payment from the 'waiting for payment' refusal too", async () => {
    eventsApi.registerForEvent.mockRejectedValue(
      Object.assign(new Error("Waiting"), { status: 409, data: { message: "This email already has a registration for this event that is waiting for payment.", error_code: "REGISTRATION_AWAITING_PAYMENT" } }),
    );
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 25000, razorpay_order_id: "order_9" });
    paymentsApi.verifyPayment.mockResolvedValue({ payment_status: "captured" });
    showMine(paid, { id: 123, additional_details: [], reg_fee: 250, is_registered: false });
    await heading(/Your details/);
    go();
    await heading(/Review and pay/);
    go();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Your registration is waiting for payment")).toBeInTheDocument();
    eventsApi.fetchEvent.mockResolvedValue(mine());
    fireEvent.click(within(alert).getByRole("button", { name: "Finish payment" }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("123", "reg-9");
    await act(() => razorpay.handler({ razorpay_order_id: "order_9", razorpay_payment_id: "pay_9" }));
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(screen.getByText("MOA9")).toBeInTheDocument();
  });
});

describe("registering signed out, with sign-in on", () => {
  beforeEach(() => {
    enableSignIn();
  });

  it("offers signing in quietly at the top of the details, and the guest path is unchanged", async () => {
    stubGoogle();
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA77", pay_amount: 0, full_name: "Asha Rao", email: "asha@example.org" });
    show(free);
    await heading(/Your details/);
    const line = screen.getByText(/Have the app\?/).closest("p");
    expect(line).toHaveTextContent("Have the app? Sign in with Google or your email to keep this ticket in your account.");
    expect(within(line).getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
    expect(within(line).getByRole("button", { name: "Sign in with your email" })).toBeInTheDocument();
    expect(field(/^Email/)).not.toHaveAttribute("readonly");
    expect(screen.queryByText(/Signed in as/)).toBeNull();

    fireEvent.change(field(/^Full name/), { target: { value: "Asha Rao" } });
    fireEvent.change(field(/^Email/), { target: { value: "asha@example.org" } });
    fireEvent.change(field(/^Phone number/), { target: { value: "98765 43210" } });
    go();
    await heading(/Review and confirm/);
    go();
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(eventsApi.registerForEvent).toHaveBeenCalledWith("124", {
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: {},
      accepts_approval: true,
    });
    expect(screen.getByText("Your ticket is also in your email.")).toBeInTheDocument();
    expect(screen.queryByText("It’s in your MyOtherApp app")).toBeNull();
  });

  it("signing in part-way fills in the account's email and keeps what was typed", async () => {
    const access = accessToken();
    stubGoogle({ credential: googleCredential() });
    post.mockImplementation(async (url) => {
      if (url === "/api/v1/auth/google") return { data: { access_token: access, refresh_token: "refresh-1", token_type: "Bearer" } };
      throw new Error(`unexpected POST ${url}`);
    });
    show(free);
    await heading(/Your details/);
    fireEvent.change(field(/^Full name/), { target: { value: "Asha R" } });
    fireEvent.change(field(/^Email/), { target: { value: "old@example.org" } });

    fireEvent.click(screen.getByRole("button", { name: "Sign in with Google" }));
    const sheet = await screen.findByRole("dialog", { name: "Sign in to register" });
    fireEvent.click(await within(sheet).findByRole("button", { name: "Sign in with Google" }));

    await waitFor(() => expect(field(/^Email/)).toHaveValue("asha@example.org"));
    expect(field(/^Email/)).toHaveAttribute("readonly");
    expect(field(/^Full name/)).toHaveValue("Asha R");
    expect(field(/^Phone number/)).toHaveValue("98765 43210");
    expect(screen.queryByText(/Have the app\?/)).toBeNull();
    expect(post).toHaveBeenCalledWith("/api/v1/auth/google", { id_token: expect.any(String), platform: "web" }, { skipAuth: true });
  });

  it("signs in with an email and password part-way, then registers as that account", async () => {
    const access = accessToken();
    const account = { ...PROFILE, id: 9, full_name: "Ravi Kumar", email: "ravi@example.org", phone: null, provider: "email", email_verified: false };
    stubGoogle();
    get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: account } : { data: {} }));
    post.mockImplementation(async (url, body, config) => {
      if (url === "/api/v1/auth/token") {
        expect(config).toMatchObject({ skipAuth: true, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        expect(body.get("username")).toBe("ravi@example.org");
        expect(body.get("password")).toBe("correct horse");
        return { data: { access_token: access, refresh_token: "refresh-9", token_type: "Bearer" } };
      }
      throw new Error(`unexpected POST ${url}`);
    });
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA88", pay_amount: 0, full_name: "Ravi Kumar", email: "ravi@example.org" });
    show(free);
    await heading(/Your details/);
    fireEvent.change(field(/^Email/), { target: { value: "ravi@example.org" } });
    fireEvent.change(field(/^Phone number/), { target: { value: "98765 00000" } });

    fireEvent.click(screen.getByRole("button", { name: "Sign in with your email" }));
    const sheet = await screen.findByRole("dialog", { name: "Sign in to register" });
    // The email form is open, with what was typed on the page already in it.
    expect(within(sheet).getByLabelText("Email")).toHaveValue("ravi@example.org");
    await waitFor(() => expect(within(sheet).getByLabelText("Password")).toHaveFocus());
    fireEvent.change(within(sheet).getByLabelText("Password"), { target: { value: "correct horse" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(field(/^Email/)).toHaveAttribute("readonly"));
    expect(field(/^Email/)).toHaveValue("ravi@example.org");
    expect(field(/^Full name/)).toHaveValue("Ravi Kumar");
    expect(screen.getByText(/Signed in as/).closest("p")).toHaveTextContent("Signed in as ravi@example.org");
    expect(JSON.parse(localStorage.getItem("moa.session")).access_token).toBe(access);

    go();
    await heading(/Review and confirm/);
    go();
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(eventsApi.registerForEvent).toHaveBeenCalledWith("124", {
      full_name: "Ravi Kumar",
      email: "ravi@example.org",
      phone: "98765 00000",
      additional_details: {},
      accepts_approval: true,
    });
    expect(screen.getByText("It’s in your MyOtherApp app")).toBeInTheDocument();
  });

  it("offers signing in to finish a registration waiting for payment", async () => {
    stubGoogle();
    eventsApi.registerForEvent.mockRejectedValue(
      Object.assign(new Error("Waiting"), { status: 409, data: { message: "This email already has a registration for this event that is waiting for payment.", error_code: "REGISTRATION_AWAITING_PAYMENT" } }),
    );
    show(paid);
    await heading(/Your details/);
    fireEvent.change(field(/^Full name/), { target: { value: "Asha Rao" } });
    fireEvent.change(field(/^Email/), { target: { value: "asha@example.org" } });
    fireEvent.change(field(/^Phone number/), { target: { value: "98765 43210" } });
    go();
    await heading(/Review and pay/);
    go();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("link", { name: /Google Play/ })).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Sign in to finish payment" }));
    expect(await screen.findByRole("dialog", { name: "Sign in to register" })).toBeInTheDocument();
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("offers Google's One Tap once, on a desk, on the details step", async () => {
    const google = stubGoogle();
    window.matchMedia = vi.fn(() => ({ matches: true }));
    show(free);
    await heading(/Your details/);
    await waitFor(() => expect(google.id.prompt).toHaveBeenCalledTimes(1));
  });

  it("doesn't put One Tap over a phone's form", async () => {
    const google = stubGoogle();
    window.matchMedia = vi.fn(() => ({ matches: false }));
    show(free);
    await heading(/Your details/);
    await new Promise((r) => setTimeout(r, 20));
    expect(google.id.prompt).not.toHaveBeenCalled();
  });
});

describe("registering in a build without sign-in", () => {
  it("has no sign-in line and never loads Google", async () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    show(free);
    await heading(/Your details/);
    expect(screen.queryByText(/Have the app\?/)).toBeNull();
    expect(screen.queryByText(/Signed in as/)).toBeNull();
    expect(document.head.querySelector('script[src*="accounts.google.com"]')).toBeNull();
  });
});
