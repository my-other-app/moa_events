import { CONTACT_EMAIL } from "@/config";
import { loadScript } from "./loadScript";
import { paymentsApi } from "../api/payments";

/**
 * Paying, in the browser: Razorpay's checkout for an order, the server's
 * check afterwards, "Finish payment" for a registration left unpaid, and
 * what every outcome means to the person, in words.
 */

/**
 * The publishable key checkout opens with: the one that came with the order
 * (a club's own Razorpay account, or the platform's), or the site's own
 * NEXT_PUBLIC_RAZORPAY_KEY when the order has none (an older server).
 */
export const checkoutKey = (order, fallback = process.env.NEXT_PUBLIC_RAZORPAY_KEY) => order?.key_id || fallback;

/**
 * Opens Razorpay's checkout for an order. `onSuccess()` once the server has
 * checked the payment (or says the order was already paid: a second tap, or
 * Razorpay's own word reaching it first); otherwise `onFailure(reason, error)`
 * with reason "load" (the checkout never opened), "verify" (paid, but not
 * confirmed: `error` says why) or "dismissed" (closed before paying).
 */
export const processPayment = async ({
  paymentData,
  userDetails,
  onSuccess,
  onFailure
}) => {
  const razorpayLoaded = await loadScript("https://checkout.razorpay.com/v1/checkout.js");

  if (!razorpayLoaded) {
    onFailure("load");
    return;
  }

  const options = {
    key: checkoutKey(paymentData),
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
        // Already paid: the ticket is good, whoever told the server first.
        if (error?.code === "ALREADY_PAID") {
          onSuccess();
          return;
        }
        console.error("Payment verification failed:", error);
        onFailure("verify", error);
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

/**
 * The same, as a promise that always resolves: {outcome: "paid"}, or
 * {outcome: "dismissed" | "load" | "verify", error}.
 */
export function payOrder(order, prefill = {}) {
  return new Promise((resolve) => {
    Promise.resolve(
      processPayment({
        paymentData: order,
        userDetails: prefill,
        onSuccess: () => resolve({ outcome: "paid", error: null }),
        onFailure: (reason, error = null) => resolve({ outcome: reason, error }),
      })
    ).catch(() => resolve({ outcome: "load", error: null }));
  });
}

/**
 * Pays for a registration that is already there ("Finish payment", from My
 * tickets, the event page or the registration page): an order for it
 * (POST /payments/orders?checkout=2 with its id, the call every payment
 * makes), Razorpay with the order's own key, then POST /payments/verify. No
 * form goes again, so it works past the registration deadline (until the
 * event ends) whatever the organiser's questions ask.
 *
 * Resolves {outcome, error, amount} (amount in rupees, when an order came):
 *   paid          paid just now, or already (409 ALREADY_PAID, from either call)
 *   nothing_due   nothing to pay (422 NOTHING_TO_PAY): the ticket is good
 *   refused       the order was refused: `error` says why (EVENT_ENDED, ...)
 *   start         no order came back
 *   dismissed | load | verify   as payOrder
 *
 * `token`: pay as this access token rather than the session (a waiting-list
 * claim's guest, see api/payments.js).
 */
export async function finishPayment({ eventId, registrationId, prefill = {}, token = null }) {
  let order;
  try {
    order = token
      ? await paymentsApi.createPaymentOrder(String(eventId), String(registrationId), { token })
      : await paymentsApi.createPaymentOrder(String(eventId), String(registrationId));
  } catch (error) {
    if (error?.code === "ALREADY_PAID") return { outcome: "paid", already: true, error: null, amount: 0 };
    if (error?.code === "NOTHING_TO_PAY") return { outcome: "nothing_due", error: null, amount: 0 };
    return { outcome: "refused", error, amount: 0 };
  }
  if (!order || !order.razorpay_order_id) return { outcome: "start", error: null, amount: 0 };
  const result = await payOrder(order, prefill);
  return { ...result, amount: (Number(order.amount) || 0) / 100 };
}

/* ---------- what an outcome means ---------- */

/** "Failed to create payment order" → "Failed to create payment order." */
const sentence = (s) => {
  const t = String(s || "").trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};

const NOT_CHARGED = "Nothing was charged.";

/** The order was refused, by code. */
const ORDER_REFUSALS = {
  EVENT_ENDED: { tone: "calm", title: "This event is over", text: "It can't be paid for any more, so nothing was charged." },
  EVENT_CANCELLED: {
    tone: "calm",
    title: "This event was cancelled",
    text: "It can't be paid for, so nothing was charged. Anything already paid for it is being refunded.",
  },
  EVENT_FULL: { tone: "calm", title: "This event filled up", text: "Every seat was taken before your payment, so nothing was charged." },
  REGISTRATION_NOT_FOUND: {
    tone: "error",
    title: "We couldn't find your registration",
    text: "It may have been cancelled. Nothing was charged — you can register again from the event page.",
  },
  EVENT_NOT_FOUND: { tone: "error", title: "This event isn't available any more", text: "It may have been taken down by its organisers. Nothing was charged." },
  GATEWAY_UNAVAILABLE: { tone: "calm", title: "Payments are down for a moment", text: "Nothing was charged. Try again in a few minutes." },
  AUTH_EXPIRED: { tone: "calm", title: "Sign in again", text: "Your sign-in ran out before the payment could start. Nothing was charged." },
};

/** The payment went through Razorpay, but the server's check refused it, by code. */
const VERIFY_REFUSALS = {
  ORDER_NOT_FOUND: {
    tone: "warn",
    title: "We couldn't match your payment to its order",
    text: (to) => `If money left your account, don't pay again: Razorpay confirms it to us and your ticket will reach ${to}. If nothing was charged, try again.`,
  },
  PAYMENT_NOT_FOUND: {
    tone: "warn",
    title: "Razorpay hasn't confirmed your payment yet",
    text: (to) => `If money left your account, don't pay again: the confirmation reaches us shortly and your ticket will reach ${to}. If nothing was charged, try again.`,
  },
  PAYMENT_ORDER_MISMATCH: {
    tone: "error",
    title: "That payment was for a different order",
    text: () => `We couldn't use it for this registration. If you were charged, write to ${CONTACT_EMAIL} before paying again and we'll sort it out.`,
  },
  UNSUPPORTED_PAYMENT_METHOD: {
    tone: "error",
    title: "That payment method isn't accepted here",
    text: () => `Pay with UPI, a card, netbanking or a wallet. If money left your account, write to ${CONTACT_EMAIL} before paying again.`,
  },
};

/**
 * What a payment's outcome means, said once and calmly: {tone, title, text},
 * tone "calm" | "warn" | "error". Null for an outcome that needs no words
 * (paid, nothing due).
 *
 *   outcome   "dismissed" | "load" | "start" | "verify" | "refused"
 *             (and "network" for the order that never got an answer)
 *   error     the payment call's error (api/payments.js), when there was one
 *   email     where the ticket goes, for "verify"
 *   kept      what is kept after a closed checkout: "details" (the form) or
 *             "registration" (Finish payment)
 */
export function describePayment(outcome, error = null, { email = null, kept = "details" } = {}) {
  const to = email || "your email";
  if (outcome === "paid" || outcome === "nothing_due") return null;
  if (outcome === "dismissed") {
    return {
      tone: "calm",
      title: "Payment not completed",
      text: `You closed the payment window before paying, so nothing was charged. ${kept === "registration" ? "Your registration is kept" : "Your details are saved"} — pay whenever you're ready.`,
    };
  }
  if (outcome === "load") return { tone: "calm", title: "The payment window didn't open", text: "Check your connection, then try again. Nothing was charged." };
  if (outcome === "verify") {
    const known = VERIFY_REFUSALS[error?.code];
    if (known) return { tone: known.tone, title: known.title, text: known.text(to) };
    return {
      tone: "warn",
      title: "We couldn't confirm your payment yet",
      text: `If money left your account, don't pay again: Razorpay confirms it to us and your ticket will reach ${to}. If nothing was charged, try again.`,
    };
  }
  if (outcome === "refused" && error) {
    const known = ORDER_REFUSALS[error.code];
    if (known) return { ...known };
    if (error.network) return { tone: "error", title: "We couldn't reach MyOtherApp", text: `Check your connection and try again. ${NOT_CHARGED}` };
    // UPDATE_APP_TO_PAY (not expected here: checkout=2 always goes) and anything else the server explained, in its words.
    if (error.message && !/^Failed to create payment order$/.test(error.message) && !(error.status >= 500)) {
      return { tone: "calm", title: "We couldn't start the payment", text: `${sentence(error.message)} ${NOT_CHARGED}` };
    }
  }
  return { tone: "calm", title: "We couldn't start the payment", text: `${NOT_CHARGED} Try again in a moment.` };
}
