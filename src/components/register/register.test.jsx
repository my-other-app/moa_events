import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fullEvent, sparseEvent } from "@/test/eventFixture";

// A made-up test key, set before payment.js reads it: never a real one.
vi.hoisted(() => {
  vi.stubEnv("VITE_RAZORPAY_KEY", "rzp_test_not_a_real_key");
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
// The checkout script is never fetched; window.Razorpay is ours.
vi.mock("@/utils/loadScript", () => ({ loadScript: vi.fn(() => Promise.resolve(true)) }));
vi.mock("@/api/live", () => ({ liveApi: { fetchFeed: vi.fn(() => new Promise(() => {})) } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn(() => new Promise(() => {})) } }));

const { eventsApi } = await import("@/api/events");
const { paymentsApi } = await import("@/api/payments");
const { parseEventPage } = await import("@/api/discover");
const Register = (await import("./register.jsx")).default;

const paid = parseEventPage(fullEvent());
const free = parseEventPage(sparseEvent());

const QUESTIONS = [
  { key: "college", label: "College or organisation", field_type: "text", required: true },
  { key: "track", label: "Pick a track", field_type: "radio", options: ["Hardware", "IoT"], required: true },
  { key: "year", label: "Year of study", field_type: "select", options: ["First", "Second"], required: true },
  { key: "rules", label: "I've read the rules", field_type: "checkbox", options: ["I agree"], required: true },
  { key: "size", label: "T-shirt size", field_type: "checkbox", options: ["S", "M", "L"], required: false },
  { key: "idea", label: "What will you build?", field_type: "textarea", required: false },
  { key: "alt_email", label: "Another email", field_type: "email", required: false },
  { key: "site", label: "Website", field_type: "url", required: false },
  { key: "parent", label: "Parent's phone", field_type: "tel", required: false },
  { key: "age", label: "Age", field_type: "number", required: true },
  { key: "dob", label: "Date of birth", field_type: "date", required: false },
  { key: "arrive", label: "Arrival time", field_type: "time", required: false },
  { key: "slot", label: "Preferred slot", field_type: "datetime", required: false },
  { key: "mystery", label: "Something new", field_type: "colour", required: false },
];

const TEE = { id: "tee", name: "Hack Night tee", description: null, photo_url: null, price: 450, left: null, variants: [{ id: "m", label: "M", left: 30 }] };

function Where() {
  const l = useLocation();
  return <output data-testid="where">{`${l.pathname}${l.search}`}</output>;
}

function show(page, { questions = [], items = [] } = {}) {
  eventsApi.fetchEvent.mockResolvedValue({ id: page.event.id, additional_details: questions, reg_fee: page.event.fee });
  eventsApi.fetchStoreCatalog.mockResolvedValue({ enabled: items.length > 0, items });
  const path = `/events/${page.event.slug}/register`;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events/:slug/register" element={<Register event={page.event} club={page.club} />} />
        <Route path="/tickets/:id" element={<p>ticket page</p>} />
      </Routes>
      <Where />
    </MemoryRouter>
  );
}

const field = (re) => screen.getByLabelText(re);
const go = () => fireEvent.click(document.querySelector(".rg-go"));
const heading = (name) => screen.findByRole("heading", { level: 1, name });

function fillDetails({ name = "Asha Rao", email = "asha@example.org", phone = "98765 43210" } = {}) {
  fireEvent.change(field(/^Full name/), { target: { value: name } });
  fireEvent.change(field(/^Email/), { target: { value: email } });
  fireEvent.change(field(/^Phone number/), { target: { value: phone } });
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
  sessionStorage.clear();
  localStorage.clear();
  window.scrollTo = vi.fn();
  razorpay = null;
  window.Razorpay = vi.fn(function (options) {
    razorpay = options;
    this.open = vi.fn();
  });
});
afterEach(() => {
  delete window.Razorpay;
});

describe("registering for a paid event", () => {
  it("shows the event, the price and only the steps it has", async () => {
    show(paid, { questions: QUESTIONS.slice(0, 1), items: [TEE] });
    expect(await heading(/Your details/)).toBeInTheDocument();
    const summary = screen.getByRole("complementary", { name: "Your registration" });
    expect(within(summary).getByText("Hack Night 04")).toBeInTheDocument();
    expect(within(summary).getByText("by Circuit Society")).toBeInTheDocument();
    expect(within(summary).getAllByText("₹250").length).toBeGreaterThan(0);
    const steps = screen.getByRole("list", { name: "Registration steps" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Details", "Questions", "Add-ons", "Review"]);
    expect(within(steps).getByText("Details").closest("li")).toHaveAttribute("aria-current", "step");
    // The way back to the event.
    expect(screen.getByRole("link", { name: /Back to event/ })).toHaveAttribute("href", "/events/hack-night-04");
    // The details have real input types and autofill hints.
    expect(field(/^Email/)).toHaveAttribute("type", "email");
    expect(field(/^Email/)).toHaveAttribute("autocomplete", "email");
    expect(field(/^Phone number/)).toHaveAttribute("type", "tel");
    expect(field(/^Phone number/)).toHaveAttribute("inputmode", "tel");
    expect(field(/^Full name/)).toHaveAttribute("autocomplete", "name");
  });

  it("creates the order and opens Razorpay with exactly the arguments it always had, after the registration", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA123", pay_amount: 250, event_registration_id: "reg-1", full_name: "Asha Rao", email: "asha@example.org" });
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 25000, razorpay_order_id: "order_1" });
    paymentsApi.verifyPayment.mockResolvedValue({ status: "captured" });
    await toReview(paid);
    expect(screen.getByRole("button", { name: "Pay ₹250" })).toBeInTheDocument();
    go();
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));

    expect(eventsApi.registerForEvent).toHaveBeenCalledWith("123", {
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: {},
    });
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("123", "reg-1");
    expect(eventsApi.registerForEvent.mock.invocationCallOrder[0]).toBeLessThan(paymentsApi.createPaymentOrder.mock.invocationCallOrder[0]);
    expect(paymentsApi.createPaymentOrder.mock.invocationCallOrder[0]).toBeLessThan(window.Razorpay.mock.invocationCallOrder[0]);
    expect(razorpay).toEqual({
      key: "rzp_test_not_a_real_key",
      amount: 25000,
      currency: "INR",
      order_id: "order_1",
      name: "Event Registration",
      description: "Complete your registration",
      handler: expect.any(Function),
      prefill: { name: "Asha Rao", email: "asha@example.org", contact: "98765 43210" },
      theme: { color: "#3399cc" },
      modal: { ondismiss: expect.any(Function) },
    });
    expect(window.Razorpay.mock.instances[0].open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Opening payment/ })).toBeDisabled();

    // Paid: verified, then the ticket.
    await act(() => razorpay.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" }));
    expect(paymentsApi.verifyPayment).toHaveBeenCalledWith("order_1", "pay_1");
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(screen.getByText(/your payment of ₹250 went through/)).toBeInTheDocument();
  });

  it("after a closed checkout, says nothing was charged and tries again the same way", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA123", pay_amount: 250, event_registration_id: "reg-1" });
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 25000, razorpay_order_id: "order_1" });
    await toReview(paid);
    go();
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    act(() => razorpay.modal.ondismiss());
    expect(await screen.findByText("Payment not completed")).toBeInTheDocument();
    expect(screen.getByText(/nothing was charged/)).toBeInTheDocument();
    const pay = screen.getByRole("button", { name: "Pay ₹250" });
    expect(pay).not.toBeDisabled();

    go();
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(2));
    // The same registration again (the server hands back the unpaid one), then a fresh order.
    expect(eventsApi.registerForEvent).toHaveBeenCalledTimes(2);
    expect(eventsApi.registerForEvent.mock.calls[1]).toEqual(eventsApi.registerForEvent.mock.calls[0]);
    expect(paymentsApi.createPaymentOrder.mock.calls).toEqual([
      ["123", "reg-1"],
      ["123", "reg-1"],
    ]);
  });

  it("adds the shelf picks to the total and the payload", async () => {
    eventsApi.registerForEvent.mockReturnValue(new Promise(() => {}));
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
    await waitFor(() => expect(eventsApi.registerForEvent).toHaveBeenCalled());
    expect(eventsApi.registerForEvent.mock.calls[0][1].store).toEqual([{ item_id: "tee", variant_id: "m", qty: 1 }]);
  });
});

describe("registering for a free event", () => {
  it("is two steps, and ends in a confirmation with the ticket, the calendar and the app", async () => {
    eventsApi.registerForEvent.mockResolvedValue({ ticket_id: "MOA77", pay_amount: 0, full_name: "Asha Rao", email: "asha@example.org" });
    sessionStorage.setItem("moa.ref", "x7k2m9pq");
    await toReview(free);
    const steps = screen.getByRole("list", { name: "Registration steps" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent.replace(/\s*\(done.*\)/, ""))).toEqual(["Details", "Review"]);
    expect(screen.getByRole("heading", { level: 1, name: /Review and confirm/ })).toBeInTheDocument();
    go();
    expect(await heading(/You.re in/)).toBeInTheDocument();

    expect(eventsApi.registerForEvent).toHaveBeenCalledWith("124", {
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: {},
      ref: "x7k2m9pq",
    });
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
    expect(window.Razorpay).not.toHaveBeenCalled();
    // The ticket: its QR, its id and the full ticket page.
    expect(screen.getByTitle("QR code for ticket MOA77")).toBeInTheDocument();
    expect(screen.getByText("MOA77")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View ticket/ })).toHaveAttribute("href", "/tickets/MOA77");
    expect(screen.getByRole("button", { name: /Add to calendar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Share/ })).toBeInTheDocument();
    // Where the ticket lives from now on.
    expect(screen.getByText("Your ticket is also in your email.")).toBeInTheDocument();
    expect(screen.getByText(/Sign in to the MyOtherApp app with/).textContent).toContain("asha@example.org");
    expect(screen.getByRole("link", { name: /Google Play/ })).toHaveAttribute("href", expect.stringContaining("play.google.com"));
    // The step left the address, and what was typed is forgotten. (The router
    // commits a navigation in a transition, so it can land a beat after the paint.)
    await waitFor(() => expect(screen.getByTestId("where").textContent).toBe("/events/quiet-evening/register"));
    expect(sessionStorage.getItem("moa.register.124")).toBeNull();
  });
});

describe("checking what was typed", () => {
  it("won't move on until the details are right, and puts the cursor on the first problem", async () => {
    show(free);
    await heading(/Your details/);
    go();
    expect(await screen.findByText("Enter your full name.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your phone number.")).toBeInTheDocument();
    expect(document.activeElement).toBe(field(/^Full name/));
    expect(field(/^Full name/)).toHaveAttribute("aria-invalid", "true");
    expect(field(/^Full name/).getAttribute("aria-describedby")).toContain("rg-f-name-err");
    expect(eventsApi.registerForEvent).not.toHaveBeenCalled();
  });

  it("checks a field when it is left, and offers the likely address for a typo", async () => {
    show(free);
    await heading(/Your details/);
    fireEvent.change(field(/^Email/), { target: { value: "asha@" } });
    fireEvent.blur(field(/^Email/));
    expect(await screen.findByText(/doesn't look like an email/)).toBeInTheDocument();
    fireEvent.change(field(/^Email/), { target: { value: "asha@gmial.com" } });
    expect(screen.queryByText(/doesn't look like an email/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "asha@gmail.com" }));
    expect(field(/^Email/)).toHaveValue("asha@gmail.com");
  });

  it("asks the organiser's questions with the right control for each type, and checks them", async () => {
    eventsApi.registerForEvent.mockReturnValue(new Promise(() => {}));
    show(paid, { questions: QUESTIONS });
    await heading(/Your details/);
    fillDetails();
    go();
    await heading(/A few questions/);

    expect(field(/^College or organisation/)).toHaveAttribute("type", "text");
    expect(screen.getByRole("radio", { name: "Hardware" })).toBeInTheDocument();
    expect(field(/^Year of study/).tagName).toBe("SELECT");
    expect(screen.getByRole("checkbox", { name: /I've read the rules/ })).toBeInTheDocument();
    // A checkbox question with several options is pick-one, as the server allows one answer.
    expect(screen.getByRole("radio", { name: "M" })).toBeInTheDocument();
    expect(field(/^What will you build/).tagName).toBe("TEXTAREA");
    expect(field(/^Another email/)).toHaveAttribute("type", "email");
    expect(field(/^Website/)).toHaveAttribute("type", "url");
    expect(field(/^Parent's phone/)).toHaveAttribute("type", "tel");
    expect(field(/^Age/)).toHaveAttribute("inputmode", "decimal");
    expect(field(/^Date of birth/)).toHaveAttribute("type", "date");
    expect(field(/^Arrival time/)).toHaveAttribute("type", "time");
    expect(field(/^Preferred slot/)).toHaveAttribute("type", "datetime-local");
    expect(field(/^Something new/)).toHaveAttribute("type", "text");
    // Required and optional are marked.
    expect(screen.getAllByText("Optional").length).toBe(9);
    expect(document.querySelectorAll(".rg-req").length).toBe(5);
    expect(field(/^College or organisation/)).toHaveAttribute("aria-required", "true");

    go();
    expect(await screen.findAllByText("This question needs an answer.")).toHaveLength(2);
    expect(screen.getAllByText("Choose one of the options.")).toHaveLength(2);
    expect(screen.getByText("Tick this box to continue.")).toBeInTheDocument();
    expect(document.activeElement).toBe(field(/^College or organisation/));

    fireEvent.change(field(/^Another email/), { target: { value: "nope" } });
    fireEvent.blur(field(/^Another email/));
    fireEvent.change(field(/^Website/), { target: { value: "not a site" } });
    fireEvent.blur(field(/^Website/));
    fireEvent.change(field(/^Age/), { target: { value: "twenty" } });
    expect(await screen.findByText(/Enter an email address, like/)).toBeInTheDocument();
    expect(screen.getByText(/Enter a web address/)).toBeInTheDocument();
    expect(screen.getByText("Enter a number.")).toBeInTheDocument();

    fireEvent.change(field(/^College or organisation/), { target: { value: "COEP" } });
    fireEvent.click(screen.getByRole("radio", { name: "IoT" }));
    fireEvent.change(field(/^Year of study/), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I've read the rules/ }));
    fireEvent.click(screen.getByRole("radio", { name: "M" }));
    fireEvent.change(field(/^Another email/), { target: { value: "asha@home.example" } });
    fireEvent.change(field(/^Website/), { target: { value: "asha.dev" } });
    fireEvent.change(field(/^Age/), { target: { value: "20" } });
    fireEvent.change(field(/^Date of birth/), { target: { value: "2006-04-02" } });
    go();
    await heading(/Review and pay/);
    // Every answer, as a string, under its key; the blank optional ones left out.
    go();
    await waitFor(() => expect(eventsApi.registerForEvent).toHaveBeenCalled());
    expect(eventsApi.registerForEvent.mock.calls[0][1].additional_details).toEqual({
      college: "COEP",
      track: "IoT",
      year: "Second",
      rules: "I agree",
      size: "M",
      alt_email: "asha@home.example",
      site: "asha.dev",
      age: "20",
      dob: "2006-04-02",
    });
  });

  it("keeps what was typed when going back a step", async () => {
    show(paid, { questions: QUESTIONS.slice(0, 1) });
    await heading(/Your details/);
    fillDetails({ name: "Meera Pillai" });
    go();
    await heading(/A few questions/);
    fireEvent.change(field(/^College or organisation/), { target: { value: "COEP" } });
    fireEvent.click(screen.getByRole("button", { name: /^Back/ }));
    await heading(/Your details/);
    expect(field(/^Full name/)).toHaveValue("Meera Pillai");
    go();
    await heading(/A few questions/);
    expect(field(/^College or organisation/)).toHaveValue("COEP");
  });
});

describe("when the server says no", () => {
  it("shows the 409 in its own words, with the app and a way to use another email", async () => {
    const message = "This email is already registered for this event. Your ticket was sent to it; sign in to the MyOtherApp app with this email to see it.";
    eventsApi.registerForEvent.mockRejectedValue(Object.assign(new Error(message), { status: 409, data: { message, error_code: "ALREADY_REGISTERED" } }));
    await toReview(free);
    go();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("You're already registered")).toBeInTheDocument();
    expect(within(alert).getByText(message)).toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: /Google Play/ })).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: /different email/ }));
    await heading(/Your details/);
    await waitFor(() => expect(document.activeElement).toBe(field(/^Email/)));
  });

  it("explains a registration still waiting for payment, in the server's words, with the app", async () => {
    const message =
      "This email already has a registration for this event that is waiting for payment. If you left the payment unfinished, you can start again here in about 30 minutes, or sign in to the MyOtherApp app with this email to finish paying.";
    eventsApi.registerForEvent.mockRejectedValue(Object.assign(new Error(message), { status: 409, data: { message, error_code: "REGISTRATION_AWAITING_PAYMENT" } }));
    await toReview(paid);
    go();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Your registration is waiting for payment")).toBeInTheDocument();
    expect(within(alert).getByText(message)).toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: /Google Play/ })).toBeInTheDocument();
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("puts a club's email back on the email field, with the server's reason", async () => {
    const message = "This email belongs to a club's account. Register with your own email.";
    eventsApi.registerForEvent.mockRejectedValue(Object.assign(new Error(message), { status: 400, data: { message, error_code: "CLUB_EMAIL" } }));
    await toReview(free);
    go();
    await heading(/Your details/);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("Check your details")).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(field(/^Email/)));
    expect(field(/^Email/)).toHaveAttribute("aria-invalid", "true");
    // A new address clears it.
    fireEvent.change(field(/^Email/), { target: { value: "asha.personal@example.org" } });
    expect(screen.queryByText(message)).toBeNull();
    expect(screen.queryByText("Check your details")).toBeNull();
  });

  it("puts field errors beside their fields, on their step", async () => {
    eventsApi.registerForEvent.mockRejectedValue(Object.assign(new Error("Registration failed"), { status: 400, data: { message: { college: "This field is required" } } }));
    show(paid, { questions: QUESTIONS.slice(0, 1) });
    await heading(/Your details/);
    fillDetails();
    go();
    await heading(/A few questions/);
    fireEvent.change(field(/^College or organisation/), { target: { value: "COEP" } });
    go();
    await heading(/Review and pay/);
    go();
    await heading(/A few questions/);
    expect(await screen.findByText("This field is required")).toBeInTheDocument();
    expect(screen.getByText("Check the highlighted answers")).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(field(/^College or organisation/)));
  });

  it("shows any other reason exactly as the server gave it", async () => {
    eventsApi.registerForEvent.mockRejectedValue(Object.assign(new Error("Registration deadline has passed"), { status: 400, data: { message: "Registration deadline has passed" } }));
    await toReview(free);
    go();
    expect(await screen.findByText("Registration deadline has passed")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });

  it("offers a retry when there is no answer at all, and the retry registers again", async () => {
    eventsApi.registerForEvent.mockRejectedValueOnce(Object.assign(new Error("Network error"), { status: 0, data: null, network: true }));
    eventsApi.registerForEvent.mockResolvedValueOnce({ ticket_id: "MOA9", pay_amount: 0 });
    await toReview(free);
    go();
    expect(await screen.findByText("We couldn't reach MyOtherApp")).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Confirm registration" });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(eventsApi.registerForEvent).toHaveBeenCalledTimes(2);
  });
});

describe("the double-submit guard", () => {
  it("only registers once when the button is pressed three times in a row", async () => {
    let resolveRegister;
    eventsApi.registerForEvent.mockReturnValue(new Promise((resolve) => (resolveRegister = resolve)));
    await toReview(free);
    const button = screen.getByRole("button", { name: "Confirm registration" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(eventsApi.registerForEvent).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Registering…");
    await act(async () => resolveRegister({ ticket_id: null }));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(screen.getByText(/no ticket came back/)).toBeInTheDocument();
  });

  it("lets a failed registration be tried again", async () => {
    eventsApi.registerForEvent.mockRejectedValueOnce(Object.assign(new Error("Network error"), { status: 0, network: true }));
    await toReview(free);
    go();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm registration" })).not.toBeDisabled());
    expect(eventsApi.registerForEvent).toHaveBeenCalledTimes(1);
  });
});

describe("when registration isn't open", () => {
  const variant = (over) => parseEventPage(sparseEvent({ event: { ...sparseEvent().event, ...over } }));

  it("says the event is full, links back, and asks nothing", async () => {
    show(variant({ status: "full", capacity: 60, seats_left: 0 }));
    expect(await heading("This event is full")).toBeInTheDocument();
    expect(screen.getByText(/All 60 seats are taken/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/quiet-evening");
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/^Full name/)).toBeNull();
  });

  it("says registration has closed", async () => {
    show(variant({ registration_open: false, reg_opens_at: null }));
    expect(await heading("Registration has closed")).toBeInTheDocument();
  });

  it("says when registration opens", async () => {
    show(variant({ registration_open: false, reg_opens_at: "2099-01-05T10:00:00+05:30" }));
    expect(await heading(/Registration opens 5 Jan/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to calendar/ })).toBeInTheDocument();
  });

  it("says the event has ended", async () => {
    show(variant({ status: "ended" }));
    expect(await heading("This event has ended")).toBeInTheDocument();
  });
});

describe("the form didn't load", () => {
  it("says so and tries again", async () => {
    eventsApi.fetchStoreCatalog.mockResolvedValue({ enabled: false, items: [] });
    eventsApi.fetchEvent.mockResolvedValueOnce(null).mockResolvedValueOnce({ additional_details: [] });
    render(
      <MemoryRouter initialEntries={["/events/quiet-evening/register"]}>
        <Routes>
          <Route path="/events/:slug/register" element={<Register event={free.event} club={free.club} />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText("The form didn't load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await heading(/Your details/)).toBeInTheDocument();
    expect(eventsApi.fetchEvent).toHaveBeenCalledTimes(2);
  });
});
