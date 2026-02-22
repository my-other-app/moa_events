import apiClient from "./client";

export const paymentsApi = {
    createPaymentOrder: async (eventId, eventRegistrationId) => {
        try {
            // The interceptor will handle the auth token injection
            const response = await apiClient.post("/api/v1/payments/orders", {
                source: "event_registration",
                payload: {
                    event_id: eventId,
                    event_registration_id: eventRegistrationId,
                },
            });
            return response.data;
        } catch (error) {
            console.error("Failed to create payment order:", error);
            if (error.response?.status === 401) {
                throw new Error("An unexpected error occured (ER 1002). Please contact coordinator.");
            }
            throw new Error(error.response?.data?.message || "Failed to create payment order");
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
