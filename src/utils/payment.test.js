import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./loadScript", () => ({
    loadScript: vi.fn().mockResolvedValue(true),
}));

vi.mock("../api/payments", () => ({
    paymentsApi: { verifyPayment: vi.fn() },
}));

import { processPayment } from "./payment.js";

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
});
