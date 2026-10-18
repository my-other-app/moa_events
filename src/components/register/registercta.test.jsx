import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The event page's register button: the server's, for everyone, until the
 * browser knows who is reading; then, signed in, Finish payment for a
 * registration waiting for it, or the ticket.
 */
vi.mock("@/api/events", () => ({ eventsApi: { fetchEvent: vi.fn() } }));
vi.mock("@/api/payments", () => ({ paymentsApi: { createPaymentOrder: vi.fn(), verifyPayment: vi.fn() } }));
vi.mock("@/utils/loadScript", () => ({ loadScript: vi.fn(() => Promise.resolve(true)) }));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { eventsApi } = await import("@/api/events");
const { paymentsApi } = await import("@/api/payments");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { RegisterGo } = await import("./registercta.jsx");
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const OPEN = { kind: "open", label: "Register", href: "/events/hack-night-04/register", also: null };
const LIVE = { kind: "live", label: "Join the live room", href: "/events/hack-night-04/live", also: { label: "Register", href: "/events/hack-night-04/register" } };
const ENDED = { kind: "ended", label: "This event has ended", href: null, also: null };
const UNPAID = { id: 123, is_registered: true, is_paid: false, registration_id: "reg-9", ticket_id: "MOA9" };

const show = (state = OPEN) =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <div className="ep-cta-go">
          <RegisterGo eventId="123" state={state} />
        </div>
      </AuthProvider>
    </MemoryRouter>,
  );

let razorpay;
beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  razorpay = null;
  window.Razorpay = vi.fn(function (options) {
    razorpay = options;
    this.open = vi.fn();
  });
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterEach(() => {
  delete window.Razorpay;
});
afterAll(() => {
  resetAuth();
  vi.unstubAllEnvs();
});

describe("signed out", () => {
  it("is the server's button, and asks nothing", () => {
    enableSignIn();
    show();
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/events/hack-night-04/register");
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
  });
});

describe("signed in", () => {
  beforeEach(() => {
    enableSignIn();
    signInAs();
  });

  it("with a registration waiting for payment: Finish payment, right here, then the ticket", async () => {
    eventsApi.fetchEvent.mockResolvedValueOnce(UNPAID).mockResolvedValue({ ...UNPAID, is_paid: true });
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 25000, razorpay_order_id: "order_9", key_id: "rzp_test_club_not_real" });
    paymentsApi.verifyPayment.mockResolvedValue({ payment_status: "captured" });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Finish payment" }));
    expect(screen.getByText("Your registration is waiting for payment.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(eventsApi.fetchEvent).toHaveBeenCalledWith("123");
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("123", "reg-9");
    expect(razorpay.key).toBe("rzp_test_club_not_real");
    await act(() => razorpay.handler({ razorpay_order_id: "order_9", razorpay_payment_id: "pay_9" }));
    expect(await screen.findByRole("link", { name: "View your ticket" })).toHaveAttribute("href", "/tickets/MOA9");
    expect(screen.getByText("Payment received — you're in.")).toBeInTheDocument();
  });

  it("says why when the order is refused, and charges nothing", async () => {
    eventsApi.fetchEvent.mockResolvedValue(UNPAID);
    paymentsApi.createPaymentOrder.mockRejectedValue(Object.assign(new Error("Event is full"), { code: "EVENT_FULL", status: 400 }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Finish payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This event filled up");
    expect(window.Razorpay).not.toHaveBeenCalled();
  });

  it("registered: the ticket instead of Register", async () => {
    eventsApi.fetchEvent.mockResolvedValue({ ...UNPAID, is_paid: true });
    show();
    expect(await screen.findByRole("link", { name: "View your ticket" })).toHaveAttribute("href", "/tickets/MOA9");
    expect(screen.getByText("You're registered.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });

  it("registered, while the event is on: the live room first, the ticket second", async () => {
    eventsApi.fetchEvent.mockResolvedValue({ ...UNPAID, is_paid: true });
    show(LIVE);
    expect(await screen.findByRole("link", { name: "Your ticket" })).toHaveAttribute("href", "/tickets/MOA9");
    expect(screen.getByRole("link", { name: "Join the live room" })).toHaveAttribute("href", "/events/hack-night-04/live");
    expect(screen.queryByRole("link", { name: "Register" })).toBeNull();
  });

  it("not registered, or a server that doesn't say: the server's button", async () => {
    eventsApi.fetchEvent.mockResolvedValue({ id: 123, is_registered: true, ticket_id: "MOA9" });
    show();
    await waitFor(() => expect(eventsApi.fetchEvent).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Register" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finish payment" })).toBeNull();
  });

  it("asks nothing once the event has ended", () => {
    show(ENDED);
    expect(screen.getByRole("button", { name: "This event has ended" })).toBeDisabled();
    expect(eventsApi.fetchEvent).not.toHaveBeenCalled();
  });
});
