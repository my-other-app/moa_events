"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { eventsApi } from "@/api/events";
import { useAuth } from "@/auth/context";
import { describePayment, finishPayment } from "@/utils/payment";
import { myRegistration } from "@/utils/register";

/**
 * "Finish payment" for a registration waiting for payment, wherever it is
 * offered: My tickets, the event page's register card, the registration page.
 *
 * The registration is paid as it stands: its id (GET /events/info/{id} says
 * it, signed in) goes to POST /payments/orders?checkout=2, Razorpay opens
 * with the order's own key, and POST /payments/verify confirms it. The form
 * is never sent again, so this works past the registration deadline (until
 * the event ends) and whatever the organiser's questions require. A server
 * that doesn't say which registration it is (before is_paid and
 * registration_id) leaves the caller to take the old way: the form.
 */

const CHECK_FAILED = {
  tone: "error",
  title: "We couldn't check your registration",
  text: "Check your connection and try again. Nothing was charged.",
};

/**
 * useFinishPayment({eventId, registrationId, onPaid, onOldServer}) → {busy, problem, pay, clear}
 *
 *   pay()          finds the registration (unless `registrationId` is given) and pays it
 *   onPaid(r)      paid now, paid already, or nothing was due: {outcome, amount, ticketId}
 *   onOldServer()  the server can't say which registration to pay: take the form
 *   problem        what went wrong, as {tone, title, text}, until the next try
 */
export function useFinishPayment({ eventId, registrationId = null, onPaid, onOldServer }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const running = useRef(false);
  const alive = useRef(true);
  const calls = useRef({ onPaid, onOldServer });
  useEffect(() => {
    calls.current = { onPaid, onOldServer };
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const user = auth.user;
  const pay = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setProblem(null);
    const say = (p) => alive.current && setProblem(p);
    try {
      let id = registrationId;
      let ticketId = null;
      if (!id) {
        const mine = myRegistration(await eventsApi.fetchEvent(String(eventId)));
        if (!mine) return say(CHECK_FAILED);
        ticketId = mine.ticketId;
        // Paid meanwhile (in the app, or another tab): nothing to do but show it.
        if (mine.state === "registered") return calls.current.onPaid?.({ outcome: "paid", already: true, amount: 0, ticketId });
        if (mine.state === "none") return say(describePayment("refused", { code: "REGISTRATION_NOT_FOUND" }));
        if (mine.state !== "unpaid") return calls.current.onOldServer?.(mine);
        id = mine.registrationId;
      }
      const result = await finishPayment({
        eventId,
        registrationId: id,
        prefill: { name: user?.name || "", email: user?.email || "", phone: user?.phone || "" },
      });
      if (result.outcome === "paid" || result.outcome === "nothing_due") return calls.current.onPaid?.({ ...result, ticketId });
      say(describePayment(result.outcome, result.error, { email: user?.email, kept: "registration" }));
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }, [eventId, registrationId, user]);

  const clear = useCallback(() => setProblem(null), []);
  return { busy, problem, pay, clear };
}

/** A payment's problem, small: under a button on the event page or in My tickets. */
export function PayNote({ problem, className = "" }) {
  if (!problem) return null;
  return (
    <div className={`pay-note pay-note--${problem.tone} ${className}`} role="alert">
      <p className="pay-note-title">{problem.title}</p>
      {problem.text ? <p className="pay-note-text">{problem.text}</p> : null}
    </div>
  );
}

/** The spinner the registration form's buttons show while they work. */
export function Spinner() {
  return <span className="rg-spin" aria-hidden="true" />;
}

/**
 * The button itself, with what went wrong under it. `label` names it for a
 * screen reader when several are on one page ("Finish payment for Hack Night").
 */
export function FinishPaymentButton({ eventId, registrationId = null, className = "dc-btn", label = null, onPaid, onOldServer }) {
  const { busy, problem, pay } = useFinishPayment({ eventId, registrationId, onPaid, onOldServer });
  return (
    <>
      <button type="button" className={className} onClick={pay} disabled={busy} aria-label={busy ? undefined : label || undefined}>
        {busy ? (
          <>
            <Spinner />
            Opening payment…
          </>
        ) : (
          "Finish payment"
        )}
      </button>
      <PayNote problem={problem} />
    </>
  );
}
