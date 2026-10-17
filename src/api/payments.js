import apiClient from "./client";

/**
 * Sent as `?checkout=` with every order: this site opens checkout with the
 * order's own `key_id`, so it can pay an event sold on a club's own Razorpay
 * account. Without it the server refuses those orders (409 UPDATE_APP_TO_PAY).
 */
export const CHECKOUT_VERSION = 2;

/** The server's "this client can't pay this event" refusal; it carries `errors.web_url`. */
export const UPDATE_APP_TO_PAY = "UPDATE_APP_TO_PAY";

export const paymentsApi = {
    /**
     * The Razorpay order for a registration (the store picks ride on it too):
     * {id, razorpay_order_id, amount, currency, status, key_id, gateway}.
     * `key_id` is the publishable key checkout opens with; an older server
     * leaves it out.
     */
    createPaymentOrder: async (eventId, eventRegistrationId) => {
        try {
            // The interceptor will handle the auth token injection
            const response = await apiClient.post(
                "/api/v1/payments/orders",
                {
                    source: "event_registration",
                    payload: {
                        event_id: eventId,
                        event_registration_id: eventRegistrationId,
                    },
                },
                { params: { checkout: CHECKOUT_VERSION } }
            );
            return response.data;
        } catch (error) {
            console.error("Failed to create payment order:", error);
            if (error.response?.status === 401) {
                throw new Error("An unexpected error occured (ER 1002). Please contact coordinator.");
            }
            const data = error.response?.data;
            if (data?.error_code === UPDATE_APP_TO_PAY) {
                // Not expected here (the flag is always sent), but shown in the server's words.
                throw Object.assign(new Error(data.message || "This event can't be paid for here."), {
                    code: UPDATE_APP_TO_PAY,
                    webUrl: data.errors?.web_url || null,
                });
            }
            throw new Error(data?.message || "Failed to create payment order");
        }
    },

    verifyPayment: async (razorpay_order_id, razorpay_payment_id) => {
        try {
            const response = await apiClient.post("/api/v1/payments/verify", {
                razorpay_order_id,
                razorpay_payment_id,
            });
            return response.data;
        } catch (error) {
            console.error("Failed to verify payment:", error);
            throw new Error(error.response?.data?.message || "Payment verification failed");
        }
    },
};
