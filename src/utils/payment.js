import { loadScript } from "./loadScript";
import { paymentsApi } from "../api/payments";

const YOUR_RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY

export const processPayment = async ({
  paymentData,
  userDetails,
  onSuccess,
  onFailure
}) => {
  const razorpayLoaded = await loadScript("https://checkout.razorpay.com/v1/checkout.js");

  // The form says what went wrong in its own words: "load" (the checkout
  // never opened), "verify" (paid, but not confirmed yet) or "dismissed".
  if (!razorpayLoaded) {
    onFailure("load");
    return;
  }

  const options = {
    key: YOUR_RAZORPAY_KEY,
    amount: paymentData.amount,
    currency: "INR",
    order_id: paymentData.razorpay_order_id,
    name: "Event Registration",
    description: "Complete your registration",
    handler: async (response) => {
      try {
        await paymentsApi.verifyPayment(response.razorpay_order_id, response.razorpay_payment_id);
        onSuccess();
      } catch (error) {
        console.error("Payment verification failed:", error);
        onFailure("verify");
      }
    },
    prefill: {
      name: userDetails.name,
      email: userDetails.email,
      contact: userDetails.phone,
    },
    theme: {
      color: "#3399cc",
    },
    modal: {
      ondismiss: () => {
        onFailure("dismissed");
      },
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
};
