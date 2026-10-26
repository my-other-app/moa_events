"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ticketingApi } from "@/api/ticketing";
import { useAuth } from "@/auth/context";
import { eventPath } from "@/utils/eventpage";
import { formatWhen } from "@/utils/format";
import { describePayment, finishPayment } from "@/utils/payment";
import { isEmail, orderLines, rupees } from "@/utils/register";
import { clubName } from "@/utils/requests";
import { describeClaimError, ticketTypeName } from "@/utils/ticketing";
import { ErrorState } from "./discover/bits";
import { SitePage } from "./discover/chrome";
import { EpIcon } from "./discover/eventbits";
import Icon from "./discover/icons";
import { TextField } from "./register/fields";
import { PayNote, Spinner } from "./register/finishpayment";
import { Lines, Summary } from "./register/summary";
import Success from "./register/success";
import { DiscountCodeField, useDiscountCode } from "./register/tickets";

/**
 * /claim/{token}: a place opened up on the waiting list, and this is the
 * link that claims it (docs/TICKETING.md §4). The server half
 * (src/app/claim/[token]/page.jsx) checks the address; everything here
 * happens in the browser, the token being the only credential:
 *
 *   GET  /waitlist/offers/{token}            what is offered, to whom, until when
 *   POST /waitlist/offers/{token}/claim      registers them on the offer's ticket
 *   POST /payments/orders (+ Razorpay)       when the ticket costs something
 *   POST /waitlist/offers/{token}/decline    "No thanks": the next person's turn
 *
 * The claim answers as registering does. A guest's session comes back with
 * it (kept as the public form keeps one); someone signed in here as another
 * address gets the offer's address registered as a guest of its own, and
 * pays with that guest's session. A closed checkout keeps the place until
 * the offer runs out: claiming again hands back the same registration.
 *
 * The same link pays for a place the club confirmed (registration approval,
 * the offer's `reason: "approved"`): the page says the club confirmed it,
 * not that it opened up on the line.
 *
 * The first paint (on the server, and the browser's first) is the loading
 * card: who is signed in and what the offer is are the browser's to read.
 */

/** The offer's event, as the summary and "You're in" draw an event. */
const asEvent = (e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  starts_at: e.starts_at,
  ends_at: null,
  duration_hours: null,
  is_online: false,
  location_name: e.location_name,
  poster: e.poster,
  poster_thumb: null,
  category: null,
});

const eventLink = (e) => (e?.slug || (e?.id !== null && e?.id !== undefined) ? eventPath(e) : null);

const ENDED = {
  expired: {
    title: "This offer ran out",
    text: "The place was held for you for a while, then went to the next person in line. If another one opens up, the organisers may offer it to you again.",
  },
  claimed: { title: "This place has been claimed", text: "If that was you, your ticket is in your email, and in My tickets once you sign in." },
  left: { title: "This offer isn't open any more", text: "You left the waiting list, so the place went to the next person in line." },
  removed: { title: "This offer isn't open any more", text: "The organisers took this place off the waiting list." },
  gone: { title: "This link isn't valid", text: "Check that the whole link was copied: each claim link works for one offer." },
  declined: { title: "You passed on this place", text: "It goes to the next person in line. Thanks for letting them have it." },
  cancelled: { title: "This event was cancelled", text: "Its places can't be claimed. Anyone who paid online is being refunded in full." },
};

/**
 * A place the club confirmed (registration approval, `reason: "approved"`):
 * the same endings, said as what they are. It never came from a line.
 */
const ENDED_APPROVED = {
  expired: (club) => ({
    title: "This payment link ran out",
    text: `${club} confirmed your place and held it for a while, but the payment didn't arrive in time, so it was released.`,
  }),
  left: () => ({ title: "This place isn't open any more", text: "You withdrew your request, so the place was released." }),
  removed: (club) => ({ title: "This place isn't open any more", text: `${club} released this place.` }),
  declined: (club) => ({ title: "You released your place", text: `Thanks for letting ${club} know. They can offer it to someone else now.` }),
};

const endedCopy = (kind, offer) => {
  const approved = offer?.reason === "approved" ? ENDED_APPROVED[kind] : null;
  return approved ? approved(clubName(offer.event?.club, { start: false })) : ENDED[kind] || ENDED.gone;
};

function Ended({ kind, offer = null, message = null }) {
  const copy = endedCopy(kind, offer);
  const href = eventLink(offer?.event);
  return (
    <div className="rg-closed cl-ended" role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        <EpIcon name="ticket" size={26} />
      </span>
      <h1 className="rg-h1">{copy.title}</h1>
      <p className="rg-closed-text">{message && kind !== "declined" && kind !== "claimed" && offer?.reason !== "approved" ? message : copy.text}</p>
      <div className="rg-closed-actions">
        {kind === "claimed" ? (
          <Link className="dc-btn" href="/me/tickets">
            My tickets
          </Link>
        ) : null}
        {href ? (
          <Link className={`dc-btn${kind === "claimed" ? " dc-btn--ghost" : ""}`} href={href}>
            Back to the event
          </Link>
        ) : null}
        <Link className="dc-btn dc-btn--ghost" href="/events">
          Find other events
        </Link>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rg-skel" role="status" aria-label="Loading your offer">
      <span className="dc-skel rg-skel-title" />
      <span className="dc-skel rg-skel-lede" />
      {[0, 1].map((i) => (
        <span key={i} className="rg-skel-field">
          <span className="dc-skel rg-skel-label" />
          <span className="dc-skel rg-skel-input" />
        </span>
      ))}
    </div>
  );
}

function OfferForm({ offer, token, onOutcome }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const [name, setName] = useState(offer.fullName || "");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [phase, setPhase] = useState("idle");
  const [problem, setProblem] = useState(null);
  const [declining, setDeclining] = useState(false);
  const type = offer.ticketType;
  const code = useDiscountCode({
    eventId: offer.event.id,
    ticketTypeId: type.id,
    email: offer.needsEmail && isEmail(email) ? email.trim() : null,
  });
  // A place the club confirmed (registration approval): this is its pay link, not a place from the line.
  // The claim registers what the request said (its name, its code): the price is the one confirmed,
  // and there is no code to type nor a name to change here.
  const approved = offer.reason === "approved";
  const club = clubName(offer.event.club);
  const price = approved && offer.amount !== null ? offer.amount : type.price;
  const discount = !approved && offer.needsPayment && code.applied ? Math.min(price, code.applied.discount) : 0;
  const total = Math.max(0, price - discount);
  const lines = orderLines({ fee: price, ticket: type.name, discount: discount > 0 ? { code: code.applied.code, amount: discount } : null });
  const until = formatWhen(offer.expiresAt);
  const first = String(name || offer.fullName || "").trim().split(/\s+/)[0];
  const busy = phase !== "idle";

  const clear = (key) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));

  const done = (data, paid, amount) => {
    const used = data.discount && typeof data.discount === "object" ? data.discount : null;
    onOutcome({
      kind: "done",
      ticket: {
        eventId: String(offer.event.id),
        ticket_id: data.ticket_id,
        name: data.full_name || name.trim(),
        email: data.email || email.trim(),
        paid,
        amount: paid ? amount : 0,
        // Signed in and claimed as the account (no guest's session came back): it's in their app.
        account: signedIn && !data.auth_token ? auth.user?.email || null : null,
        ticket_type: ticketTypeName(data) || type.name,
        ...(used?.code ? { code: String(used.code), covered: !(Number(data.pay_amount) > 0) && Number(used.amount) > 0 } : {}),
      },
    });
  };

  const claim = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const found = {};
    const n = name.trim();
    if (approved) {
      // The request's own name is registered: nothing to check here.
    } else if (n.length < 3) found.name = n ? "Enter your full name — at least 3 letters." : "Enter your full name.";
    else if (n.length > 100) found.name = "That's too long — keep it under 100 characters.";
    if (offer.needsEmail && !isEmail(email)) found.email = email.trim() ? "That doesn't look like an email address. Check it for typos." : "Enter your email: your ticket is sent here.";
    setErrors(found);
    setProblem(null);
    if (Object.keys(found).length) {
      document.getElementById(found.name ? "rg-f-cl_name" : "rg-f-cl_email")?.focus();
      return;
    }
    setPhase("claiming");
    try {
      const data = await ticketingApi.claim(token, {
        ...(approved ? {} : { full_name: n }),
        ...(offer.needsEmail ? { email: email.trim() } : {}),
        ...(!approved && offer.needsPayment && code.toSend ? { discount_code: code.toSend } : {}),
      });
      if (!data || !data.ticket_id) {
        setProblem({ tone: "error", title: "We couldn't claim your place", text: "No ticket came back. Try again — you won't be registered twice." });
        return;
      }
      if (!(Number(data.pay_amount) > 0)) {
        done(data, false, 0);
        return;
      }
      setPhase("paying");
      // Claimed for another address than the account signed in here: that guest's session pays.
      const payAs = signedIn && data.auth_token?.access_token ? data.auth_token.access_token : null;
      const result = await finishPayment({
        eventId: offer.event.id,
        registrationId: data.event_registration_id,
        prefill: { name: data.full_name || n, email: data.email || "", phone: data.phone || "" },
        token: payAs,
      });
      if (result.outcome === "paid" || result.outcome === "nothing_due") {
        done(data, result.outcome === "paid", result.amount || Number(data.pay_amount) || 0);
        return;
      }
      if (result.error?.code === "EVENT_CANCELLED") {
        onOutcome({ kind: "cancelled" });
        return;
      }
      const p = describePayment(result.outcome, result.error, { email: data.email, kept: "registration" });
      setProblem({ ...p, text: `${p.text}${until ? ` Your place is held until ${until} IST.` : ""}` });
    } catch (error) {
      const p = describeClaimError(error);
      if (["expired", "claimed", "gone", "cancelled"].includes(p.kind)) {
        onOutcome({ kind: p.kind, message: p.message });
      } else if (p.kind === "fields") {
        if (p.fields.discount_code) code.refuse(p.fields.discount_code);
        const rest = { ...p.fields };
        delete rest.discount_code;
        setErrors(rest);
      } else if (p.kind === "registered") {
        setProblem({ tone: "info", title: "You're already registered", text: p.message });
      } else {
        setProblem({ tone: p.kind === "limit" ? "calm" : "error", title: "We couldn't claim your place", text: p.message });
      }
    } finally {
      setPhase("idle");
    }
  };

  const decline = async () => {
    if (busy) return;
    setPhase("declining");
    setProblem(null);
    try {
      await ticketingApi.decline(token);
      onOutcome({ kind: "declined" });
    } catch (error) {
      const p = describeClaimError(error);
      if (["expired", "claimed", "gone"].includes(p.kind)) onOutcome({ kind: p.kind, message: p.message });
      else setProblem({ tone: "error", title: "We couldn't pass on the place", text: p.kind === "network" ? p.message : "Try again in a moment." });
    } finally {
      setPhase("idle");
      setDeclining(false);
    }
  };

  const go = offer.needsPayment && total > 0 ? (approved ? `Pay ${rupees(total)}` : `Claim and pay ${rupees(total)}`) : approved ? "Confirm my place" : "Claim my place";
  const busyLabel = phase === "paying" ? "Opening payment…" : phase === "declining" ? (approved ? "Releasing it…" : "Passing it on…") : "Claiming…";

  return (
    <div className="rg-layout">
      <Summary event={asEvent(offer.event)} club={null} lines={lines} total={total} />
      <div className="rg-main">
        <form className="cl-offer" noValidate onSubmit={claim} aria-labelledby="cl-title">
          <span className="cl-badge" aria-hidden="true">
            <EpIcon name="ticket" size={24} />
          </span>
          <h1 className="rg-h1" id="cl-title">
            {approved ? `${club} confirmed your place` : "A place opened up for you"}
          </h1>
          {approved ? (
            <p className="rg-lede">
              {first ? `${first}, your` : "Your"} place at <strong>{offer.event.name}</strong> is confirmed. {offer.needsPayment ? "Pay" : "Confirm"}
              {until ? (
                <>
                  {" "}
                  by <strong>{until} IST</strong>
                </>
              ) : null}{" "}
              to get your <strong>{type.name}</strong> ticket.{until ? " Your place is held until then." : null}
            </p>
          ) : (
            <p className="rg-lede">
              {first ? `${first}, the` : "The"} <strong>{type.name}</strong> ticket for <strong>{offer.event.name}</strong> is yours to claim.
              {until ? (
                <>
                  {" "}
                  It&rsquo;s held for you until <strong>{until} IST</strong>.
                </>
              ) : null}
            </p>
          )}
          {offer.registrationId ? (
            <p className="cl-note" role="status">
              You started claiming it. {offer.needsPayment ? "Finish the payment to make it yours." : "Confirm to finish."}
            </p>
          ) : null}

          <dl className="rg-dl cl-who">
            {approved && offer.fullName ? (
              <div>
                <dt>Name</dt>
                <dd>{offer.fullName}</dd>
              </div>
            ) : null}
            {offer.email ? (
              <div>
                <dt>Email</dt>
                <dd>{offer.email}</dd>
              </div>
            ) : null}
            {offer.phone ? (
              <div>
                <dt>Phone</dt>
                <dd>{offer.phone}</dd>
              </div>
            ) : null}
          </dl>

          {approved && !offer.needsEmail ? null : (
            <div className="rg-fields">
              {approved ? null : (
                <TextField
                  name="cl_name"
                  label="Full name"
                  required
                  value={name}
                  onChange={(v) => {
                    setName(v);
                    clear("name");
                  }}
                  error={errors.name}
                  inputProps={{ type: "text", autoComplete: "name", autoCapitalize: "words", maxLength: 100 }}
                />
              )}
              {offer.needsEmail ? (
                <TextField
                  name="cl_email"
                  label="Email"
                  required
                  hint="Your ticket is sent here."
                  value={email}
                  onChange={(v) => {
                    setEmail(v);
                    clear("email");
                  }}
                  error={errors.email}
                  inputProps={{ type: "email", autoComplete: "email", inputMode: "email", autoCapitalize: "none", spellCheck: false, placeholder: "you@example.com" }}
                />
              ) : null}
              {offer.needsPayment && !approved ? <DiscountCodeField code={code} /> : null}
            </div>
          )}

          <section className="rg-rblock rg-rblock--pay cl-order" aria-label="Your order">
            <Lines lines={lines} total={total} />
            {offer.needsPayment && total > 0 ? (
              <p className="rg-paynote">
                <Icon name="creditCard" size={15} />
                Payment is handled securely by Razorpay. The place is yours once it goes through.
              </p>
            ) : null}
          </section>

          <PayNote problem={problem} className="cl-problem" />

          <div className="cl-actions">
            <button type="submit" className="dc-btn" disabled={busy}>
              {busy && phase !== "declining" ? (
                <>
                  <Spinner />
                  {busyLabel}
                </>
              ) : (
                go
              )}
            </button>
            {declining ? (
              <div className="wl-leave" role="group" aria-label={approved ? "Release this place" : "Pass on this place"}>
                <p>
                  {approved
                    ? `Release your place? ${club} can offer it to someone else, and you can't take it back.`
                    : "Give this place to the next person in line? You can’t take it back."}
                </p>
                <div className="wl-leave-actions">
                  <button type="button" className="dc-btn dc-btn--sm dc-btn--ghost" onClick={decline} disabled={busy}>
                    {phase === "declining" ? busyLabel : approved ? "Yes, release it" : "Yes, pass it on"}
                  </button>
                  <button type="button" className="rg-textbtn" onClick={() => setDeclining(false)} disabled={busy}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="rg-textbtn" onClick={() => setDeclining(true)} disabled={busy}>
                {approved ? "I can't come: release my place" : "No thanks, give it to the next person"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Claim({ token }) {
  const [load, setLoad] = useState({ status: "loading", offer: null });
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoad((s) => (s.status === "error" ? { ...s, status: "loading" } : s));
    Promise.resolve()
      .then(() => ticketingApi.offer(token))
      .then(
        (offer) => alive && setLoad({ status: "ready", offer }),
        (error) => alive && setLoad({ status: error?.status === 404 || error?.code === "OFFER_NOT_FOUND" ? "gone" : "error", offer: null }),
      );
    return () => {
      alive = false;
    };
  }, [token, attempt]);

  const offer = load.offer;
  let body;
  if (outcome?.kind === "done") body = <Success event={asEvent(offer.event)} club={null} ticket={outcome.ticket} />;
  else if (outcome) body = <Ended kind={outcome.kind} offer={offer} message={outcome.message} />;
  else if (load.status === "loading") body = <Skeleton />;
  else if (load.status === "gone") body = <Ended kind="gone" />;
  else if (load.status === "error")
    body = (
      <ErrorState
        title="Your offer didn't load"
        message="We couldn't reach MyOtherApp to read this offer. Check your connection and try again."
        onRetry={() => setAttempt((a) => a + 1)}
      />
    );
  else if (offer.status !== "offered") body = <Ended kind={offer.status} offer={offer} />;
  else body = <OfferForm offer={offer} token={token} onOutcome={setOutcome} />;

  return (
    <SitePage>
      <div className="dc-wrap rg cl">{body}</div>
    </SitePage>
  );
}
