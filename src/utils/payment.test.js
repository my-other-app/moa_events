import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./loadScript", () => ({
    loadScript: vi.fn().mockResolvedValue(true),
}));

vi.mock("../api/payments", () => ({
    paymentsApi: { verifyPayment: vi.fn(), createPaymentOrder: vi.fn() },
}));

import { paymentsApi } from "../api/payments";
import { checkoutKey, describePayment, finishPayment, processPayment } from "./payment.js";

// Made-up keys: never real ones.
const SITE_KEY = "rzp_test_site_not_real";
const CLUB_KEY = "rzp_test_club_not_real";

describe("checkoutKey", () => {
    beforeEach(() => {
        vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY", SITE_KEY);
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("opens with the key that came with the order: a club's own account, or the platform's", () => {
        expect(checkoutKey({ razorpay_order_id: "order_1", key_id: CLUB_KEY, gateway: "club" })).toBe(CLUB_KEY);
        expect(checkoutKey({ razorpay_order_id: "order_1", key_id: "rzp_test_platform", gateway: "platform" })).toBe("rzp_test_platform");
    });

    it("falls back to the site's key only when the order has none (an older server)", () => {
        expect(checkoutKey({ razorpay_order_id: "order_1" })).toBe(SITE_KEY);
        expect(checkoutKey({ razorpay_order_id: "order_1", key_id: null })).toBe(SITE_KEY);
        expect(checkoutKey({ razorpay_order_id: "order_1", key_id: "" })).toBe(SITE_KEY);
        expect(checkoutKey(null)).toBe(SITE_KEY);
    });
});

describe("processPayment", () => {
    let capturedOptions;

    beforeEach(() => {
        capturedOptions = null;
        window.Razorpay = function (options) {
            capturedOptions = options;
            this.open = vi.fn();
        };
    });

    it("wires up modal.ondismiss to call onFailure, so closing the checkout without paying doesn't leave the UI hanging", async () => {
        const onFailure = vi.fn();
        const onSuccess = vi.fn();

        await processPayment({
            paymentData: { amount: 100, razorpay_order_id: "order_1" },
            userDetails: { name: "A", email: "a@b.com", phone: "123" },
            onSuccess,
            onFailure,
        });

        expect(capturedOptions.modal.ondismiss).toBeTypeOf("function");
        capturedOptions.modal.ondismiss();
        expect(onFailure).toHaveBeenCalledTimes(1);
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("opens Razorpay Checkout with the order's own key_id", async () => {
        vi.stubEnv("NEXT_PUBLIC_RAZORPAY_KEY", SITE_KEY);
        try {
            await processPayment({
                paymentData: { amount: 100, currency: "INR", razorpay_order_id: "order_1", key_id: CLUB_KEY, gateway: "club" },
                userDetails: { name: "A", email: "a@b.com", phone: "123" },
                onSuccess: vi.fn(),
                onFailure: vi.fn(),
            });
            expect(capturedOptions.key).toBe(CLUB_KEY);
            expect(capturedOptions.order_id).toBe("order_1");
        } finally {
            vi.unstubAllEnvs();
        }
    });
});

/** What api/payments.js throws for a refusal. */
const coded = (code, status = 400, message = "refused", stage = "order") => Object.assign(new Error(message), { code, status, stage, errors: null, network: false });

describe("the server's check after Razorpay", () => {
    let options;
    beforeEach(() => {
        options = null;
        vi.mocked(paymentsApi.verifyPayment).mockReset();
        window.Razorpay = function (o) {
            options = o;
            this.open = vi.fn();
        };
    });

    it("counts 409 ALREADY_PAID as paid", async () => {
        vi.mocked(paymentsApi.verifyPayment).mockRejectedValue(coded("ALREADY_PAID", 409, "This order is already paid.", "verify"));
        const onSuccess = vi.fn();
        const onFailure = vi.fn();
        await processPayment({ paymentData: { amount: 100, razorpay_order_id: "order_1" }, userDetails: {}, onSuccess, onFailure });
        await options.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" });
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onFailure).not.toHaveBeenCalled();
    });

    it("hands any other refusal on, with why", async () => {
        const error = coded("PAYMENT_ORDER_MISMATCH", 400, "This payment does not belong to the specified order.", "verify");
        vi.mocked(paymentsApi.verifyPayment).mockRejectedValue(error);
        vi.spyOn(console, "error").mockImplementation(() => {});
        const onFailure = vi.fn();
        await processPayment({ paymentData: { amount: 100, razorpay_order_id: "order_1" }, userDetails: {}, onSuccess: vi.fn(), onFailure });
        await options.handler({ razorpay_order_id: "order_1", razorpay_payment_id: "pay_1" });
        expect(onFailure).toHaveBeenCalledWith("verify", error);
    });
});

describe("finishPayment: a registration left unpaid, paid as it stands", () => {
    let options;
    beforeEach(() => {
        options = null;
        vi.mocked(paymentsApi.createPaymentOrder).mockReset();
        vi.mocked(paymentsApi.verifyPayment).mockReset();
        window.Razorpay = function (o) {
            options = o;
            this.open = vi.fn();
        };
    });

    it("makes the order for the registration's id, opens checkout with its key, checks it, and resolves paid", async () => {
        vi.mocked(paymentsApi.createPaymentOrder).mockResolvedValue({ razorpay_order_id: "order_9", amount: 25000, key_id: CLUB_KEY });
        vi.mocked(paymentsApi.verifyPayment).mockResolvedValue({ payment_status: "captured" });
        const done = finishPayment({ eventId: 901, registrationId: "reg-9", prefill: { name: "Asha", email: "asha@example.org", phone: "98765 43210" } });
        await vi.waitFor(() => expect(options).not.toBeNull());
        expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith("901", "reg-9");
        expect(options).toMatchObject({ key: CLUB_KEY, order_id: "order_9", prefill: { name: "Asha", email: "asha@example.org", contact: "98765 43210" } });
        await options.handler({ razorpay_order_id: "order_9", razorpay_payment_id: "pay_9" });
        expect(await done).toEqual({ outcome: "paid", error: null, amount: 250 });
        expect(paymentsApi.verifyPayment).toHaveBeenCalledWith("order_9", "pay_9");
    });

    it("counts 409 ALREADY_PAID as paid and 422 NOTHING_TO_PAY as nothing due, without a checkout", async () => {
        vi.mocked(paymentsApi.createPaymentOrder).mockRejectedValueOnce(coded("ALREADY_PAID", 409));
        expect(await finishPayment({ eventId: 1, registrationId: "r" })).toMatchObject({ outcome: "paid", already: true });
        vi.mocked(paymentsApi.createPaymentOrder).mockRejectedValueOnce(coded("NOTHING_TO_PAY", 422));
        expect(await finishPayment({ eventId: 1, registrationId: "r" })).toMatchObject({ outcome: "nothing_due" });
        expect(options).toBeNull();
    });

    it("resolves the refusal for the page to say, and a closed checkout as dismissed", async () => {
        const ended = coded("EVENT_ENDED", 409);
        vi.mocked(paymentsApi.createPaymentOrder).mockRejectedValueOnce(ended);
        expect(await finishPayment({ eventId: 1, registrationId: "r" })).toEqual({ outcome: "refused", error: ended, amount: 0 });
        vi.mocked(paymentsApi.createPaymentOrder).mockResolvedValueOnce(null);
        expect((await finishPayment({ eventId: 1, registrationId: "r" })).outcome).toBe("start");
        vi.mocked(paymentsApi.createPaymentOrder).mockResolvedValueOnce({ razorpay_order_id: "order_2", amount: 100 });
        const done = finishPayment({ eventId: 1, registrationId: "r" });
        await vi.waitFor(() => expect(options).not.toBeNull());
        options.modal.ondismiss();
        expect((await done).outcome).toBe("dismissed");
    });
});

describe("what a payment's outcome says", () => {
    it.each([
        ["EVENT_ENDED", "This event is over", /nothing was charged/],
        ["EVENT_FULL", "This event filled up", /nothing was charged/],
        ["REGISTRATION_NOT_FOUND", "We couldn't find your registration", /register again from the event page/],
        ["EVENT_NOT_FOUND", "This event isn't available any more", /Nothing was charged/],
        ["GATEWAY_UNAVAILABLE", "Payments are down for a moment", /Try again in a few minutes/],
    ])("an order refused with %s", (code, title, text) => {
        const said = describePayment("refused", coded(code));
        expect(said.title).toBe(title);
        expect(said.text).toMatch(text);
    });

    it("UPDATE_APP_TO_PAY (not expected here: checkout=2 always goes) in the server's own words", () => {
        expect(describePayment("refused", coded("UPDATE_APP_TO_PAY", 409, "Update the MyOtherApp app to pay for this event, or pay on the website")).text).toBe(
            "Update the MyOtherApp app to pay for this event, or pay on the website. Nothing was charged.",
        );
    });

    it.each([
        ["ORDER_NOT_FOUND", "We couldn't match your payment to its order", /don't pay again.*asha@example\.org/],
        ["PAYMENT_NOT_FOUND", "Razorpay hasn't confirmed your payment yet", /don't pay again/],
        ["PAYMENT_ORDER_MISMATCH", "That payment was for a different order", /support@myotherapp\.in/],
        ["UNSUPPORTED_PAYMENT_METHOD", "That payment method isn't accepted here", /UPI, a card, netbanking or a wallet/],
        [null, "We couldn't confirm your payment yet", /Razorpay confirms it to us/],
    ])("a check refused with %s", (code, title, text) => {
        const said = describePayment("verify", code ? coded(code, 400, "x", "verify") : null, { email: "asha@example.org" });
        expect(said.title).toBe(title);
        expect(said.text).toMatch(text);
    });

    it("nothing for paid or nothing due; a closed checkout says what is kept", () => {
        expect(describePayment("paid")).toBeNull();
        expect(describePayment("nothing_due")).toBeNull();
        expect(describePayment("dismissed").text).toMatch(/Your details are saved/);
        expect(describePayment("dismissed", null, { kept: "registration" }).text).toMatch(/Your registration is kept/);
        expect(describePayment("load").title).toBe("The payment window didn't open");
        expect(describePayment("refused", Object.assign(new Error("Network Error"), { network: true })).title).toBe("We couldn't reach MyOtherApp");
    });
});
