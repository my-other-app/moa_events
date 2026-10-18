import apiClient from "./client";

/**
 * Sent as `?checkout=` with every order: this site opens checkout with the
 * order's own `key_id`, so it can pay an event sold on a club's own Razorpay
 * account. Without it the server refuses those orders (409 UPDATE_APP_TO_PAY).
 */
export const CHECKOUT_VERSION = 2;

/** The server's "this client can't pay this event" refusal; it carries `errors.web_url`. */
export const UPDATE_APP_TO_PAY = "UPDATE_APP_TO_PAY";

/**
 * What the payment calls throw: an Error with the server's own sentence as
 * its message (when it sent one) and what the page needs to say it well:
 *
 *   code     the API's error_code, or null (an older server, or no answer)
 *   status   the HTTP status, 0 when nothing answered
 *   stage    "order" | "verify"
 *   errors   the API's field errors, or null
 *   network  true when nothing answered at all
 *   webUrl   UPDATE_APP_TO_PAY's link to pay on the website
 *
 * The codes (utils/payment.js says what each means to the person):
 *   orders   ALREADY_PAID 409, NOTHING_TO_PAY 422, EVENT_ENDED 409,
 *            EVENT_FULL 400, REGISTRATION_NOT_FOUND 404, EVENT_NOT_FOUND 404,
 *            UPDATE_APP_TO_PAY 409, GATEWAY_UNAVAILABLE 503
 *   verify   ORDER_NOT_FOUND 404, ALREADY_PAID 409, PAYMENT_ORDER_MISMATCH 400,
 *            UNSUPPORTED_PAYMENT_METHOD 400, PAYMENT_NOT_FOUND 404
 */
export function paymentError(error, stage) {
    const response = error?.response;
    const data = response?.data && typeof response.data === "object" ? response.data : null;
    const said =
        typeof data?.message === "string" && data.message.trim()
            ? data.message.trim()
            : typeof data?.detail === "string" && data.detail.trim()
              ? data.detail.trim()
              : null;
    const fallback = stage === "order" ? "Failed to create payment order" : "Payment verification failed";
    const status = response?.status ?? 0;
    return Object.assign(new Error(said || fallback), {
        code: typeof data?.error_code === "string" ? data.error_code : error?.authExpired ? "AUTH_EXPIRED" : null,
        status,
        stage,
        errors: data?.errors && typeof data.errors === "object" ? data.errors : null,
        network: !response && !error?.authExpired,
        webUrl: data?.errors?.web_url || null,
    });
}

export const paymentsApi = {
    /**
     * The Razorpay order for a registration (the store picks ride on it too):
     * {id, razorpay_order_id, amount, currency, status, key_id, gateway}.
     * `key_id` is the publishable key checkout opens with; an older server
     * leaves it out. The same call pays for a registration made a moment ago
     * and finishes one left unpaid (My tickets, the event page): the server
     * takes it until the event ends, past the registration deadline too.
     */
    createPaymentOrder: async (eventId, eventRegistrationId) => {
        try {
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
            throw paymentError(error, "order");
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
            throw paymentError(error, "verify");
        }
    },
};
