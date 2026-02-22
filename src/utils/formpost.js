const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
// const token = import.meta.env.VITE_BEARER_TOKEN;

export const postFormData = async (eventId, data) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/events/registration/${eventId}/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const responseData = await response.json();
    console.log("Response:", responseData);

    if (responseData.auth_token) {
      try {
        localStorage.setItem(
          "access_token",
          responseData.auth_token.access_token
        );
        localStorage.setItem(
          "refresh_token",
          responseData.auth_token.refresh_token
        );
      } catch (e) {
        console.error(e);
      }
    }

    if (!response.ok) {
      console.error("Server Error:", response.status, responseData);
      throw new Error(responseData.message || "Unknown error");
    }

    return responseData;
  } catch (error) {
    console.error("Failed to submit form:", error);
    throw error;
  }
};

/**
 * Create a payment order for the event registration
 */
export const createPaymentOrder = async (eventId, eventRegistrationId) => {
  try {
    const token = localStorage.getItem("access_token");
    if (!token) {
      alert(
        "An unexpected error occured (ER 1002). Please contact coordinator."
      );

      return;
    }
    const response = await fetch(`${API_BASE_URL}/api/v1/payments/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source: "event_registration",
        payload: {
          event_id: eventId,
          event_registration_id: eventRegistrationId,
        },
      }),
    });

    const responseData = await response.json();
    console.log("Payment Order Response:", responseData);

    if (!response.ok) {
      console.error("Payment Order Error:", response.status, responseData);
      throw new Error(responseData.message || "Failed to create payment order");
    }

    return responseData;
  } catch (error) {
    console.error("Failed to create payment order:", error);
    throw error;
  }
};

/**
 * Verify the payment after completion
 */
export const verifyPayment = async (razorpay_order_id, razorpay_payment_id) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/payments/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        razorpay_order_id,
        razorpay_payment_id,
      }),
    });

    const responseData = await response.json();
    console.log("Payment Verification Response:", responseData);

    if (!response.ok) {
      console.error(
        "Payment Verification Error:",
        response.status,
        responseData
      );
      throw new Error(responseData.message || "Payment verification failed");
    }

    return responseData;
  } catch (error) {
    console.error("Failed to verify payment:", error);
    throw error;
  }
};
