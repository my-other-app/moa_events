import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./loadScript", () => ({
    loadScript: vi.fn().mockResolvedValue(true),
}));

vi.mock("../api/payments", () => ({
    paymentsApi: { verifyPayment: vi.fn() },
}));

import { checkoutKey, processPayment } from "./payment.js";

// Made-up keys: never real ones.
const SITE_KEY = "rzp_test_site_not_real";
const CLUB_KEY = "rzp_test_club_not_real";

describe("checkoutKey", () => {
    beforeEach(() => {
        vi.stubEnv("VITE_RAZORPAY_KEY", SITE_KEY);
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
        vi.stubEnv("VITE_RAZORPAY_KEY", SITE_KEY);
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
