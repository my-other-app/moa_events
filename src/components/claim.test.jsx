import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * /claim/{token}: a waiting list's offer (the API's docs/TICKETING.md §4).
 * The API is mocked (the ticketing module answers with what it parses) and
 * Razorpay is a fake: nothing leaves the test.
 */
vi.hoisted(() => {
  vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY", "rzp_test_not_a_real_key");
});
vi.mock("@/api/ticketing", () => ({
  ticketingApi: { offer: vi.fn(), claim: vi.fn(), decline: vi.fn(), checkCode: vi.fn(), types: vi.fn(() => Promise.resolve(null)) },
}));
vi.mock("@/api/payments", () => ({ paymentsApi: { createPaymentOrder: vi.fn(), verifyPayment: vi.fn() } }));
vi.mock("@/utils/loadScript", () => ({ loadScript: vi.fn(() => Promise.resolve(true)) }));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { ticketingApi } = await import("@/api/ticketing");
const { paymentsApi } = await import("@/api/payments");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { apiFailure, parseOffer } = await import("@/utils/ticketing");
const Claim = (await import("./claim.jsx")).default;
const { PROFILE, enableSignIn, resetAuth, signInAs } = await import("@/test/auth");

const TOKEN = "Xy3abcdefghijklmnopqrstuvwxyz012";
const offer = (over = {}, type = {}) =>
  parseOffer({
    id: "6f1c",
    status: "offered",
    event: { id: 7, slug: "hack-night-04", name: "Hack Night 04", event_datetime: "2026-11-08T18:00:00+05:30", location_name: "Lab 3B, COEP", poster: null },
    ticket_type: { id: 12, name: "Early bird", price: 199, currency: "INR", ...type },
    full_name: "Asha K",
    email: "as•••@gmail.com",
    phone: "•••••3210",
    expires_at: "2026-11-02T18:00:00+05:30",
    needs_email: false,
    needs_payment: true,
    registration_id: null,
    ...over,
  });
const FREE = () => offer({ needs_payment: false }, { price: 0 });
const CLAIMED = (over = {}) => ({
  ticket_id: "MOA5",
  pay_amount: 199,
  event_registration_id: "r5",
  full_name: "Asha K",
  email: "asha@gmail.com",
  phone: "9876543210",
  ticket_type: { id: 12, name: "Early bird" },
  ...over,
});

const show = () =>
  render(
    <MemoryRouter initialEntries={[`/claim/${TOKEN}`]}>
      <AuthProvider>
        <Claim token={TOKEN} />
      </AuthProvider>
    </MemoryRouter>,
  );
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

describe("an offer standing", () => {
  it("first paints a loading card, then says what is offered, to whom and until when", async () => {
    let answer;
    ticketingApi.offer.mockReturnValue(new Promise((r) => (answer = r)));
    show();
    expect(screen.getByRole("status", { name: "Loading your offer" })).toBeInTheDocument();
    await act(async () => answer(offer()));
    expect(await heading("A place opened up for you")).toBeInTheDocument();
    expect(ticketingApi.offer).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText(/the/, { selector: ".rg-lede" })).toHaveTextContent("Asha, the Early bird ticket for Hack Night 04 is yours to claim. It’s held for you until Mon, 2 Nov · 6:00 PM IST.");
    expect(screen.getByText("as•••@gmail.com")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Full name/)).toHaveValue("Asha K");
    expect(screen.queryByLabelText(/^Email/)).toBeNull();
    expect(screen.getByRole("button", { name: "Claim and pay ₹199" })).toBeInTheDocument();
  });

  it("a free place is claimed in one tap, and the ticket shows", async () => {
    ticketingApi.offer.mockResolvedValue(FREE());
    ticketingApi.claim.mockResolvedValue(CLAIMED({ pay_amount: 0 }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Claim my place" }));
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(ticketingApi.claim).toHaveBeenCalledWith(TOKEN, { full_name: "Asha K" });
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
    const ticket = screen.getByRole("region", { name: "Your ticket" });
    expect(within(ticket).getByText("Early bird")).toBeInTheDocument();
    expect(within(ticket).getByText("MOA5")).toBeInTheDocument();
  });

  it("a paid place is claimed, then paid for with Razorpay", async () => {
    ticketingApi.offer.mockResolvedValue(offer());
    ticketingApi.claim.mockResolvedValue(CLAIMED());
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 19900, razorpay_order_id: "order_5", key_id: "rzp_test_club_not_real" });
    paymentsApi.verifyPayment.mockResolvedValue({ status: "captured" });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Claim and pay ₹199" }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("7", "r5");
    expect(razorpay.key).toBe("rzp_test_club_not_real");
    expect(razorpay.prefill).toEqual({ name: "Asha K", email: "asha@gmail.com", contact: "9876543210" });
    await act(() => razorpay.handler({ razorpay_order_id: "order_5", razorpay_payment_id: "pay_5" }));
    expect(await heading(/You.re in/)).toBeInTheDocument();
    expect(screen.getByText(/your payment of ₹199 went through/)).toBeInTheDocument();
  });

  it("signed in as another address, pays as the guest the claim made", async () => {
    enableSignIn();
    signInAs();
    ticketingApi.offer.mockResolvedValue(offer());
    ticketingApi.claim.mockResolvedValue(CLAIMED({ auth_token: { access_token: "guest-a", refresh_token: "guest-r" } }));
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 19900, razorpay_order_id: "order_5" });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Claim and pay ₹199" }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("7", "r5", { token: "guest-a" });
  });

  it("a checkout closed keeps the place until the offer runs out", async () => {
    ticketingApi.offer.mockResolvedValue(offer());
    ticketingApi.claim.mockResolvedValue(CLAIMED());
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 19900, razorpay_order_id: "order_5" });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Claim and pay ₹199" }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalled());
    await act(async () => razorpay.modal.ondismiss());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Payment not completed");
    expect(alert).toHaveTextContent("Your place is held until Mon, 2 Nov · 6:00 PM IST.");
    expect(screen.getByRole("button", { name: "Claim and pay ₹199" })).toBeEnabled();
  });

  it("a phone-only offer asks for the email the ticket goes to", async () => {
    ticketingApi.offer.mockResolvedValue(offer({ needs_payment: false, needs_email: true, email: null, phone: "•••••3210" }, { price: 0 }));
    ticketingApi.claim.mockResolvedValue(CLAIMED({ pay_amount: 0 }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Claim my place" }));
    expect(await screen.findByText("Enter your email: your ticket is sent here.")).toBeInTheDocument();
    expect(ticketingApi.claim).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "asha@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Claim my place" }));
    await waitFor(() => expect(ticketingApi.claim).toHaveBeenCalledWith(TOKEN, { full_name: "Asha K", email: "asha@example.org" }));
  });

  it("takes a discount code, priced before claiming and sent with the claim", async () => {
    ticketingApi.offer.mockResolvedValue(offer());
    ticketingApi.checkCode.mockResolvedValue({ code: "EARLY20", ticket_type_id: 12, price: 199, discount: 50, amount: 149, free: false });
    ticketingApi.claim.mockResolvedValue(CLAIMED({ pay_amount: 149 }));
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 14900, razorpay_order_id: "order_6" });
    show();
    await heading("A place opened up for you");
    fireEvent.change(screen.getByLabelText(/^Discount code/), { target: { value: "early20" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByRole("button", { name: "Claim and pay ₹149" })).toBeInTheDocument();
    expect(ticketingApi.checkCode).toHaveBeenCalledWith(7, { code: "early20", ticketTypeId: 12, email: null, phone: null });
    fireEvent.click(screen.getByRole("button", { name: "Claim and pay ₹149" }));
    await waitFor(() => expect(ticketingApi.claim).toHaveBeenCalledWith(TOKEN, { full_name: "Asha K", discount_code: "EARLY20" }));
  });

  it("No thanks passes the place on, after asking", async () => {
    ticketingApi.offer.mockResolvedValue(offer());
    ticketingApi.decline.mockResolvedValue({ declined: true });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "No thanks, give it to the next person" }));
    expect(ticketingApi.decline).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, pass it on" }));
    expect(await heading("You passed on this place")).toBeInTheDocument();
    expect(ticketingApi.decline).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/hack-night-04");
  });

  it("an offer that runs out while it is being claimed says so", async () => {
    ticketingApi.offer.mockResolvedValue(offer());
    ticketingApi.claim.mockRejectedValue(apiFailure({ response: { status: 410, data: { error_code: "OFFER_EXPIRED", message: "This offer has run out." } } }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Claim and pay ₹199" }));
    expect(await heading("This offer ran out")).toBeInTheDocument();
    expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("a code the claim refuses is said under the field", async () => {
    ticketingApi.offer.mockResolvedValue(offer());
    ticketingApi.claim.mockRejectedValue(apiFailure({ response: { status: 409, data: { error_code: "DISCOUNT_CODE_USED_UP" } } }));
    show();
    await heading("A place opened up for you");
    fireEvent.change(screen.getByLabelText(/^Discount code/), { target: { value: "GONE" } });
    fireEvent.click(screen.getByRole("button", { name: "Claim and pay ₹199" }));
    expect(await screen.findByText("That code has been used up.")).toBeInTheDocument();
  });
});

describe("an offer no longer standing", () => {
  it.each([
    ["expired", "This offer ran out"],
    ["claimed", "This place has been claimed"],
    ["left", "This offer isn't open any more"],
    ["removed", "This offer isn't open any more"],
  ])("%s says so, with the way back", async (status, title) => {
    ticketingApi.offer.mockResolvedValue(offer({ status }));
    show();
    expect(await heading(title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to the event" })).toHaveAttribute("href", "/events/hack-night-04");
  });

  it("a link that's no offer says so", async () => {
    ticketingApi.offer.mockRejectedValue(apiFailure({ response: { status: 404, data: { error_code: "OFFER_NOT_FOUND" } } }));
    show();
    expect(await heading("This link isn't valid")).toBeInTheDocument();
  });

  it("an offer that didn't load can be asked for again", async () => {
    ticketingApi.offer.mockRejectedValueOnce(apiFailure(new Error("Network Error"))).mockResolvedValueOnce(offer());
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Try again/ }));
    expect(await heading("A place opened up for you")).toBeInTheDocument();
  });
});

describe("a place the club confirmed (registration approval)", () => {
  const approved = (over = {}, type = {}) => offer({ reason: "approved", event: { id: 7, slug: "hack-night-04", name: "Hack Night 04", event_datetime: "2026-11-08T18:00:00+05:30", location_name: "Lab 3B, COEP", poster: null, club: { name: "Circuit Society" } }, ...over }, type);

  it("says the club confirmed it, and pays without the waiting list's words", async () => {
    ticketingApi.offer.mockResolvedValue(approved());
    ticketingApi.claim.mockResolvedValue(CLAIMED());
    paymentsApi.createPaymentOrder.mockResolvedValue({ amount: 19900, razorpay_order_id: "order_9" });
    show();
    expect(await heading("Circuit Society confirmed your place")).toBeInTheDocument();
    expect(screen.getByText(/is confirmed/, { selector: ".rg-lede" })).toHaveTextContent(
      "Asha, your place at Hack Night 04 is confirmed. Pay by Mon, 2 Nov · 6:00 PM IST to get your Early bird ticket. Your place is held until then.",
    );
    expect(screen.queryByText(/opened up/)).toBeNull();
    expect(screen.queryByText(/next person in line/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Pay ₹199" }));
    await waitFor(() => expect(window.Razorpay).toHaveBeenCalledTimes(1));
    expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("7", "r5");
  });

  it("releasing the place asks first, in the club's words", async () => {
    ticketingApi.offer.mockResolvedValue(approved());
    ticketingApi.decline.mockResolvedValue({ declined: true });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "I can't come: release my place" }));
    expect(screen.getByRole("group", { name: "Release this place" })).toHaveTextContent("Release your place? Circuit Society can offer it to someone else, and you can't take it back.");
    fireEvent.click(screen.getByRole("button", { name: "Yes, release it" }));
    expect(await heading("You released your place")).toBeInTheDocument();
    expect(screen.getByText(/Thanks for letting/)).toHaveTextContent("Thanks for letting Circuit Society know. They can offer it to someone else now.");
  });

  it("a free confirmed place is confirmed in one tap", async () => {
    ticketingApi.offer.mockResolvedValue(approved({ needs_payment: false }, { price: 0 }));
    show();
    expect(await screen.findByRole("button", { name: "Confirm my place" })).toBeInTheDocument();
  });

  it("a pay link that ran out says the payment didn't arrive, not that the line moved on", async () => {
    ticketingApi.offer.mockResolvedValue(approved({ status: "expired" }));
    show();
    expect(await heading("This payment link ran out")).toBeInTheDocument();
    expect(screen.getByText(/didn't arrive in time/)).toHaveTextContent("Circuit Society confirmed your place and held it for a while, but the payment didn't arrive in time, so it was released.");
  });

  it("without a club's name, says the club", async () => {
    ticketingApi.offer.mockResolvedValue(offer({ reason: "approved" }));
    show();
    expect(await heading("The club confirmed your place")).toBeInTheDocument();
  });
});
