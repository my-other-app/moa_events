"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { eventsApi } from "@/api/events";
import { useAuth } from "@/auth/context";
import { cancelOneTap } from "@/auth/google";
import { paymentsApi } from "@/api/payments";
import { describePayment, payOrder } from "@/utils/payment";
import { currentRef } from "@/utils/ref";
import { picksTotal } from "@/utils/picks";
import { eventPath, eventUrl, registerState } from "@/utils/eventpage";
import {
  applyStockRefusal,
  buildPayload,
  clearDraft,
  describeRegisterError,
  fieldId,
  forgetDone,
  isEmail,
  keepDone,
  loadDone,
  loadDraft,
  myRegistration,
  orderLines,
  parseQuestions,
  rupees,
  saveDraft,
  stepsFor,
  suggestEmail,
  validateAnswers,
  validateDetails,
  wantsWhatsapp,
} from "@/utils/register";
import { clubUpdatesText, offersClubUpdates } from "@/utils/clubupdates";
import { CANCELLED_TITLE, REFUND_DETAIL, REFUND_NOTE, cancelledLine } from "@/utils/cancelled";
import { ticketingApi } from "@/api/ticketing";
import { approvalNote, clubName as clubLabel, parseApproval, payButton, payLine, requiresApproval, underReviewNote } from "@/utils/requests";
import {
  anyPaid,
  defaultType,
  liveEntries,
  needsPicker,
  onSale,
  parseTicketing,
  ticketTypeName,
  typeById,
  typePrice,
  viewerRequestOf,
  waitlistTypes,
  withoutWaitlist,
} from "@/utils/ticketing";
import { GoogleMark } from "../auth/account";
import { ErrorState, StoreButtons } from "../discover/bits";
import { SitePage } from "../discover/chrome";
import { CalendarButton, EpIcon } from "../discover/eventparts";
import Icon from "../discover/icons";
import { CheckField, QuestionField, TextField } from "./fields";
import { PayNote, Spinner, useFinishPayment } from "./finishpayment";
import MerchPicker from "./merchpicker";
import { Lines, Summary } from "./summary";
import Requested from "./requested";
import Success from "./success";
import { DiscountCodeField, linkedTypeFrom, TicketPicker, useDiscountCode, useEventTicketing, WaitlistPanel } from "./tickets";

/**
 * Registering for an event, at /events/{slug}/register. The page's server
 * half (src/app/events/[slug]/register/page.jsx) finds the event and hands
 * it here; this draws the same first paint on the server and in the browser
 * (the form's skeleton, or why registration isn't open), then reads who is
 * signed in and the form's questions.
 *
 * Steps, one screen each, and only the ones this event has:
 *   Ticket    which ticket type, when there is a choice (docs/TICKETING.md);
 *             a sold-out one offers its waiting list
 *   Details   name, email, phone
 *   Questions the organiser's own questions, if it asks any
 *   Add-ons   the event's shelf, if it sells anything
 *   Review    what was entered and the total (with a discount code, checked
 *             as it is typed, on a paid ticket), then Confirm (nothing to
 *             pay) or Pay
 * then "You're in" with the ticket. An event that reviews registrations
 * (registration approval: `requires_approval`) has no add-ons step and
 * nothing to pay yet: Review registers ("Register", as anywhere), the API
 * keeps a registration under review (a request), and the answer's
 * `approval` shows "You're registered!" with a link to the registration's
 * page instead of a ticket. The form always says it understands that
 * (`accepts_approval`), so the server decides. `?ticket_type=` (a hidden type a club
 * shared) chooses that ticket. The step is in the address (?step=),
 * changed with the browser's own history (Next follows it, and the server
 * isn't asked again), so the phone's back button steps back; what was typed
 * is kept for the tab, and the ticket survives a reload.
 *
 * The calls are the ones the form has always made, in the same order with
 * the same payloads: register; then, when there is something to pay, create
 * the order and open Razorpay, which verifies. Trying again after a closed
 * checkout sends the same registration again with the guest token the first
 * one left, and the server hands back the unpaid registration it already has
 * rather than making another. Its refusals are sorted by their error_code
 * (utils/register.js: describeRegisterError) and each is said in words.
 *
 * Signed in (with Google, or an email and password), the name and email
 * come from the account and the email can't be changed: the registration
 * goes in with the account's token and lands straight in the account. The
 * person's own registration comes first: one waiting for payment is paid as
 * it is (Finish payment: no form, past the deadline too, until the event
 * ends), and one already good shows its ticket. Signed out, a quiet line
 * offers signing in, and the guest path is exactly as it was.
 */

const DETAIL_KEYS = ["name", "email", "phone"];
const EMPTY = { name: "", email: "", phone: "" };

/** What was typed, with the account's email (always) and its name and phone where nothing was typed. */
const withAccount = (v, email, name, phone) => (email ? { ...v, name: v.name || name || "", email, phone: v.phone || phone || "" } : v);

/** One Tap is offered once a tab, on a desk, on the details step: never over a phone's action bar. */
const ONE_TAP_KEY = "moa.onetap";
function oneTapWelcome() {
  try {
    if (sessionStorage.getItem(ONE_TAP_KEY)) return false;
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(min-width: 960px)").matches) return false;
    sessionStorage.setItem(ONE_TAP_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

const ownsKey = (stepId, key) =>
  stepId === "details"
    ? DETAIL_KEYS.includes(key)
    : stepId === "questions"
      ? key.startsWith("q:")
      : stepId === "ticket"
        ? key === "ticket_type"
        : stepId === "review"
          ? key === "discount_code"
          : false;

function focusField(key) {
  const el = typeof document !== "undefined" ? document.getElementById(fieldId(key)) : null;
  if (!el) return;
  try {
    el.scrollIntoView({ block: "center" });
  } catch {
    /* not in a browser */
  }
  el.focus({ preventScroll: true });
}

const scrollTop = () => {
  try {
    window.scrollTo(0, 0);
  } catch {
    /* not in a browser */
  }
};

/* ---------- small parts ---------- */

function Progress({ steps, index, onJump }) {
  return (
    <ol className="rg-progress" aria-label="Registration steps">
      {steps.map((s, i) => {
        const state = i < index ? "done" : i === index ? "on" : "todo";
        return (
          <li key={s.id} className={`is-${state}`} aria-current={i === index ? "step" : undefined}>
            <span className="rg-progress-bar" aria-hidden="true" />
            {state === "done" ? (
              <button type="button" className="rg-progress-label" onClick={() => onJump(s.id)}>
                <EpIcon name="check" size={13} />
                {s.label}
                <span className="dc-sr"> (done — go back to this step)</span>
              </button>
            ) : (
              <span className="rg-progress-label">{s.label}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** "Your registration is waiting for payment": pay it here when signed in; otherwise sign in to, or the app. */
function AwaitingActions({ eventId, onPaid }) {
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";
  // An older server can't say which registration to pay: the app can.
  const [inApp, setInApp] = useState(false);
  const { busy, problem, pay } = useFinishPayment({ eventId, onPaid, onOldServer: () => setInApp(true) });
  if (signedIn && inApp) return <StoreButtons />;
  if (signedIn) {
    return (
      <>
        <button type="button" className="dc-btn dc-btn--sm" onClick={pay} disabled={busy}>
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
  return (
    <>
      {auth.enabled ? (
        <button type="button" className="dc-btn dc-btn--sm" onClick={() => auth.openSignIn({ reason: "register" })}>
          Sign in to finish payment
        </button>
      ) : null}
      <StoreButtons />
    </>
  );
}

/** What went wrong with the registration, said once and calmly, with the way forward. `extra`: more under it (the waiting list). */
function Problem({ problem, event, club = null, signedIn, onRetry, onChangeEmail, onSignIn, onPaid, extra = null }) {
  const box = useRef(null);
  // Said where the eye is: the checkout closes over the top of a long page.
  useEffect(() => {
    if (problem.kind === "fields") return;
    try {
      box.current?.scrollIntoView({ block: "center" });
    } catch {
      /* not in a browser */
    }
  }, [problem]);
  let tone = "error";
  let title = "We couldn't register you";
  let text = problem.message;
  let actions = null;
  const backToEvent = (
    <Link className="dc-btn dc-btn--ghost dc-btn--sm" href={eventPath(event)}>
      Back to the event
    </Link>
  );
  if (problem.kind === "payment") {
    tone = problem.tone;
    title = problem.title;
    text = problem.text;
  } else if (problem.kind === "duplicate") {
    tone = "info";
    title = "You're already registered";
    actions = signedIn ? (
      <Link className="dc-btn dc-btn--sm" href="/me/tickets">
        Open My tickets
      </Link>
    ) : (
      <>
        <StoreButtons />
        <button type="button" className="rg-textbtn" onClick={onChangeEmail}>
          Register with a different email
        </button>
      </>
    );
  } else if (problem.kind === "auth") {
    tone = "calm";
    title = "Sign in again";
    actions = onSignIn ? (
      <button type="button" className="dc-btn dc-btn--sm" onClick={onSignIn}>
        Sign in
      </button>
    ) : null;
  } else if (problem.kind === "awaiting") {
    tone = "info";
    title = "Your registration is waiting for payment";
    actions = <AwaitingActions eventId={String(event.id)} onPaid={onPaid} />;
  } else if (problem.kind === "declined") {
    // The club reviews registrations, and declined this person's already: plainly, with the way back.
    tone = "calm";
    title = "You can't register again";
    text = `${clubLabel(club)} couldn't confirm your registration for this event, so you can't register again with this email.`;
    actions = backToEvent;
  } else if (problem.kind === "approval") {
    tone = "calm";
    title = "This event reviews registrations now";
    // Add-ons refused: the form took them off itself, so registering again is the way on. Otherwise a reload.
    actions = problem.addOns ? null : (
      <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm" onClick={() => window.location.reload()}>
        Reload the page
      </button>
    );
  } else if (problem.kind === "closed" || problem.kind === "full") {
    tone = "calm";
    title = problem.title;
    actions = backToEvent;
  } else if (problem.kind === "soldout") {
    tone = "warn";
    title = "Something in your order sold out";
    text = `${problem.message} Your order has been updated: check it, then carry on.`;
  } else if (problem.kind === "network" || problem.kind === "server") {
    title = problem.kind === "network" ? "We couldn't reach MyOtherApp" : "Something broke on our side";
    actions = (
      <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm" onClick={onRetry}>
        Try again
      </button>
    );
  } else if (problem.kind === "fields") {
    title = problem.step === "details" ? "Check your details" : "Check the highlighted answers";
    text = problem.message || null;
  }
  return (
    <div ref={box} className={`rg-problem rg-problem--${tone}`} role="alert">
      <span className="rg-problem-icon" aria-hidden="true">
        {tone === "info" ? <EpIcon name="ticket" size={18} /> : <span>{tone === "calm" ? "i" : "!"}</span>}
      </span>
      <div className="rg-problem-body">
        <p className="rg-problem-title">{title}</p>
        {text ? <p className="rg-problem-text">{text}</p> : null}
        {actions ? <div className="rg-problem-actions">{actions}</div> : null}
        {extra}
      </div>
    </div>
  );
}

function ReviewBlock({ title, onEdit, editLabel, children }) {
  return (
    <section className="rg-rblock" aria-label={title}>
      <div className="rg-rblock-head">
        <h2 className="rg-h2">{title}</h2>
        <button type="button" className="rg-edit" onClick={onEdit} aria-label={editLabel}>
          Edit
        </button>
      </div>
      {children}
    </section>
  );
}

function FormSkeleton() {
  return (
    <div className="rg-skel" role="status" aria-label="Loading the form">
      <div className="rg-skel-progress">
        {[0, 1, 2].map((i) => (
          <span key={i} className="dc-skel" />
        ))}
      </div>
      <span className="dc-skel rg-skel-title" />
      <span className="dc-skel rg-skel-lede" />
      {[0, 1, 2].map((i) => (
        <span key={i} className="rg-skel-field">
          <span className="dc-skel rg-skel-label" />
          <span className="dc-skel rg-skel-input" />
        </span>
      ))}
    </div>
  );
}

/** A panel beside the summary: registration closed, paid for, waiting for payment. */
function Panel({ event, club, icon = "ticket", title, children, actions }) {
  return (
    <div className="rg-layout">
      <Summary event={event} club={club} />
      <div className="rg-main">
        <div className="rg-closed" role="status">
          <span className="rg-closed-icon" aria-hidden="true">
            <EpIcon name={icon} size={26} />
          </span>
          <h1 className="rg-h1">{title}</h1>
          {children}
          <div className="rg-closed-actions">{actions}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- registration isn't open ---------- */

/**
 * Registration isn't open. A full event whose tickets can be waited for
 * (`ticketing`, from GET /events/info/{id}) offers its waiting list here;
 * one that reviews registrations has none to offer.
 */
function Closed({ event, club, gate, ticketing = null, onTicketsChanged = null }) {
  const approval = event.requires_approval === true || ticketing?.requiresApproval === true;
  const joinable = !approval && waitlistTypes(ticketing).length > 0;
  const waitable = gate.kind === "full" && ticketing && (joinable || liveEntries(ticketing.viewerWaitlist).length > 0);
  const copy = {
    soon: { title: gate.label, text: `${gate.note}. Add it to your calendar and come back then.` },
    closed: { title: "Registration has closed", text: "The organisers aren't taking new registrations for this event." },
    full: {
      title: "This event is full",
      text: `${gate.note || "Every seat is taken."} ${joinable ? "You can still join its waiting list, below." : "Keep an eye on the event page in case a seat opens up."}`,
    },
    ended: { title: "This event has ended", text: gate.note ? `${gate.note}.` : "It's over — but there's always another one." },
    live: { title: "It's happening now", text: "Registration has closed, but the live room is open: polls, questions and the quiz." },
  }[gate.kind] || { title: "Registration isn't open", text: "Check the event page for the latest." };
  return (
    <Panel
      event={event}
      club={club}
      icon={gate.kind === "soon" ? "calendarPlus" : "ticket"}
      title={copy.title}
      actions={
        <>
          {gate.kind === "live" ? (
            <Link className="dc-btn dc-btn--accent" href={eventPath(event, "live")}>
              Open the live room
            </Link>
          ) : null}
          {gate.kind === "soon" ? <CalendarButton event={event} url={eventUrl(event)} /> : null}
          <Link className="dc-btn" href={eventPath(event)}>
            Back to the event
          </Link>
          <Link className="dc-btn dc-btn--ghost" href="/events">
            Find other events
          </Link>
        </>
      }
    >
      <p className="rg-closed-text">{copy.text}</p>
      {waitable ? <WaitlistPanel eventId={String(event.id)} ticketing={ticketing} onChanged={onTicketsChanged} headingLevel={2} approval={approval} /> : null}
    </Panel>
  );
}

/**
 * The club called the event off: why, and what it means for whoever is
 * reading. Signed in and registered, their ticket is no longer valid (and
 * their payment, if they made one, is on its way back); a registration that
 * was waiting for payment has nothing left to pay.
 */
function CancelledPanel({ event, club, mine }) {
  const c = event.cancellation || {};
  const registered = mine?.state === "registered" || mine?.state === "unknown";
  const paid = registered && event.has_fee;
  return (
    <Panel
      event={event}
      club={club}
      title={CANCELLED_TITLE}
      actions={
        <>
          {mine?.state && mine.state !== "none" ? (
            <Link className="dc-btn" href="/me/tickets">
              My tickets
            </Link>
          ) : null}
          <Link className={`dc-btn${mine?.state && mine.state !== "none" ? " dc-btn--ghost" : ""}`} href="/events">
            Find other events
          </Link>
        </>
      }
    >
      {c.reason ? (
        <p className="rg-closed-text rg-cancel-reason">
          <span>The organisers said:</span> {c.reason}
        </p>
      ) : null}
      <p className="rg-closed-text">
        {cancelledLine(c)}, so it isn&rsquo;t taking registrations.
        {registered ? " Your ticket for it is no longer valid." : ""}
        {mine?.state === "unpaid" ? " Your registration was waiting for payment: there's nothing to pay." : ""}
      </p>
      {paid ? (
        <p className="rg-refund" role="status">
          <strong>{REFUND_NOTE}</strong> {REFUND_DETAIL}
        </p>
      ) : !mine || mine.state === "none" ? (
        <p className="rg-closed-text">If you registered and paid online, your payment is being refunded in full.</p>
      ) : null}
    </Panel>
  );
}

/* ---------- signed in, and already registered ---------- */

/** Registered, waiting for payment: pay it as it is. */
function FinishPanel({ event, club, registration, onPaid }) {
  const { busy, problem, pay } = useFinishPayment({ eventId: String(event.id), registrationId: registration.registrationId, onPaid });
  return (
    <Panel
      event={event}
      club={club}
      title="Finish your payment"
      actions={
        <>
          <button type="button" className="dc-btn dc-btn--accent" onClick={pay} disabled={busy}>
            {busy ? (
              <>
                <Spinner />
                Opening payment…
              </>
            ) : (
              "Finish payment"
            )}
          </button>
          <Link className="dc-btn dc-btn--ghost" href="/me/tickets">
            My tickets
          </Link>
        </>
      }
    >
      <p className="rg-closed-text">
        You&rsquo;re registered for <strong>{event.name}</strong>, but it&rsquo;s waiting for payment: the ticket works at the door once it&rsquo;s paid. Pay now and
        it&rsquo;s ready straight away.
      </p>
      <PayNote problem={problem} className="rg-finish-note" />
    </Panel>
  );
}

/** Registered and good at the door: the ticket. */
function Registered({ event, club, ticketId }) {
  return (
    <Panel
      event={event}
      club={club}
      title="You're registered"
      actions={
        <>
          {ticketId ? (
            <Link className="dc-btn" href={`/tickets/${encodeURIComponent(ticketId)}`}>
              View your ticket
            </Link>
          ) : null}
          <Link className="dc-btn dc-btn--ghost" href="/me/tickets">
            My tickets
          </Link>
          <Link className="dc-btn dc-btn--ghost" href={eventPath(event)}>
            Back to the event
          </Link>
        </>
      }
    >
      <p className="rg-closed-text">Your ticket for {event.name} is in My tickets, in the MyOtherApp app and in your email.</p>
    </Panel>
  );
}

/**
 * Signed in, for an event that reviews registrations: the person registered
 * already (`ticketing.viewer_request`), and it is still open (under review,
 * or confirmed and not paid yet). Its page, rather than the form again
 * (which would answer with the same registration).
 */
function AskedPanel({ event, club, asked }) {
  const confirmed = asked.status === "approved";
  // Confirmed and paid: the claim page pays it when the API says where; else the registration's page does.
  const payHref = asked.pay?.claimToken ? `/claim/${encodeURIComponent(asked.pay.claimToken)}` : asked.path;
  const href = confirmed ? payHref : asked.path;
  return (
    <Panel
      event={event}
      club={club}
      title={confirmed ? "Your registration is confirmed" : "Your registration is under review"}
      actions={
        <>
          {href ? (
            <Link className="dc-btn" href={href}>
              {confirmed ? payButton(asked.pay) : "See your registration"}
            </Link>
          ) : null}
          <Link className="dc-btn dc-btn--ghost" href={eventPath(event)}>
            Back to the event
          </Link>
        </>
      }
    >
      <p className="rg-closed-text">{confirmed ? payLine(asked.pay) : underReviewNote(club)}</p>
    </Panel>
  );
}

/* ---------- the questions, and the person's own registration ---------- */

/**
 * GET /events/info/{id}: the organiser's questions and the fee as the form
 * knows them and, sent with the account's token, the person's own
 * registration. Asked again when who is reading changes; what came before
 * stays shown meanwhile. `who` is "" when signed out.
 */
function useEventInfo(eventId, enabled, who) {
  const [state, setState] = useState({ status: "loading", data: null, who: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setState((s) => (s.status === "error" ? { ...s, status: "loading" } : s));
    Promise.resolve(eventsApi.fetchEvent(eventId)).then(
      (d) => alive && setState(d ? { status: "ready", data: d, who } : { status: "error", data: null, who }),
      () => alive && setState({ status: "error", data: null, who }),
    );
    return () => {
      alive = false;
    };
  }, [eventId, enabled, who, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}

/**
 * The event's tickets for the form (docs/TICKETING.md): `ticketing` from
 * GET /events/info/{id}, which the form reads anyway; with `?ticket_type=`
 * in the address, GET /events/{id}/ticket-types?ticket_type= instead, which
 * lists that hidden type too. Null from a server without ticket types: the
 * form is then exactly what it was. `reload()` after the server refused a
 * ticket (sold out meanwhile, off sale) or after joining a waiting list.
 */
function useFlowTicketing(eventId, info, linked) {
  const [own, setOwn] = useState({ status: "idle", data: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!linked) return undefined;
    let alive = true;
    setOwn((s) => (s.status === "ready" ? s : { status: "loading", data: null }));
    Promise.resolve()
      .then(() => ticketingApi.types(eventId, { ticketType: linked }))
      .then(
        (data) => alive && setOwn({ status: "ready", data }),
        () => alive && setOwn({ status: "error", data: null }),
      );
    return () => {
      alive = false;
    };
  }, [eventId, linked, attempt]);
  const fromInfo = useMemo(() => parseTicketing(info.data?.ticketing), [info.data]);
  const { retry } = info;
  const reload = useCallback(() => (linked ? setAttempt((a) => a + 1) : retry()), [linked, retry]);
  if (!linked) return { ticketing: fromInfo, ready: true, reload };
  // Until the list with the linked type has come, nothing: the type it names must be the one chosen first.
  if (own.status !== "ready" && own.status !== "error") return { ticketing: null, ready: false, reload };
  return { ticketing: own.status === "ready" ? own.data || fromInfo : fromInfo, ready: true, reload };
}

/* ---------- the flow ---------- */

function Flow({ event, club, info, onDone }) {
  const eventId = String(event.id);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const auth = useAuth();
  const account = auth.status === "signed-in" && auth.user?.email ? auth.user : null;
  const accountEmail = account?.email || null;
  const accountName = account?.name || null;
  const accountPhone = account?.phone || null;

  const [items, setItems] = useState(null);
  const [draft] = useState(() => loadDraft(eventId));
  const [values, setValues] = useState(() => withAccount(draft?.values || EMPTY, accountEmail, accountName, accountPhone));
  const [answers, setAnswers] = useState(() => draft?.answers || {});
  const [picks, setPicks] = useState(() => draft?.picks || {});
  // "Send my ticket and event reminders on WhatsApp": unticked until the guest ticks it.
  const [whatsapp, setWhatsapp] = useState(() => draft?.whatsapp === true);
  // "Get updates from <club> on WhatsApp": the same, for a club that offers its own updates.
  const [clubUpdates, setClubUpdates] = useState(() => draft?.clubUpdates === true);
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [phase, setPhase] = useState("idle");
  const [problem, setProblem] = useState(null);
  // Came here to change one thing from the review: Continue goes back to it.
  const [editing, setEditing] = useState(false);
  const busy = useRef(false);
  const heading = useRef(null);
  const focusNext = useRef(null);
  const submittedAs = useRef(null);
  // Which step each step was opened from on this visit, for Back to step back through history.
  const openedFrom = useRef({});

  // The ticket: a link's hidden type, the one chosen before (the draft), or the only one.
  const linked = useMemo(() => linkedTypeFrom(params.toString()), [params]);
  const tix = useFlowTicketing(eventId, info, linked);
  // The club reviews every registration (registration approval): it goes in under review, and nothing is paid yet.
  // `reviewedNow`: the server refused add-ons because the club turned reviewing on after the form loaded.
  const [reviewedNow, setReviewedNow] = useState(false);
  const approval = reviewedNow || requiresApproval(info.data, event);
  // Such an event has no waiting list, whatever its tickets still say.
  const ticketing = useMemo(() => (approval ? withoutWaitlist(tix.ticketing) : tix.ticketing), [approval, tix.ticketing]);
  // The ticket the person picked here; until they do, the one chosen for them (worked out as the page draws).
  const [typeId, setTypeId] = useState(null);
  // A sold-out ticket's waiting list, opened from the picker: {typeId}.
  const [waitFor, setWaitFor] = useState(null);

  // Signing in part-way through fills in what the account knows; the email becomes the account's.
  useEffect(() => {
    if (!accountEmail) return;
    setValues((v) => {
      const next = withAccount(v, accountEmail, accountName, accountPhone);
      return next.name === v.name && next.email === v.email && next.phone === v.phone ? v : next;
    });
    setServerErrors((e) => {
      if (!("email" in e)) return e;
      const rest = { ...e };
      delete rest.email;
      return rest;
    });
  }, [accountEmail, accountName, accountPhone]);

  // The shelf. Nothing on it (or no answer) means no add-ons step.
  useEffect(() => {
    let alive = true;
    Promise.resolve(eventsApi.fetchStoreCatalog(eventId))
      .then((cat) => alive && setItems(cat && cat.enabled && Array.isArray(cat.items) ? cat.items : []))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [eventId]);

  // What was typed, kept for the tab (and the ticket chosen, once there is a choice).
  useEffect(() => {
    const keepType = typeId ?? draft?.ticketType ?? null;
    saveDraft(eventId, { values, answers, picks, whatsapp, clubUpdates, ...(keepType !== null ? { ticketType: keepType } : {}) });
  }, [eventId, values, answers, picks, whatsapp, clubUpdates, typeId, draft]);

  const ready = info.status === "ready" && items !== null && tix.ready;
  const questions = useMemo(() => parseQuestions(info.data?.additional_details), [info.data]);
  const infoFee = Number(info.data?.reg_fee) > 0 ? Number(info.data.reg_fee) : null;
  // A registration under review carries no add-ons (the API keeps none with it), so the shelf isn't offered.
  const shelf = useMemo(() => (approval ? [] : items || []), [items, approval]);
  const chooseTicket = needsPicker(ticketing);
  const steps = useMemo(() => stepsFor({ questions, items: shelf, chooseTicket }), [questions, shelf, chooseTicket]);

  // The ticket and what it costs: the type picked, else the one a link names, the one picked before this
  // reload (the draft) or the event's only one; on an older server, the event's fee.
  const listed = (id) => (id !== null && id !== undefined ? typeById(ticketing, id) : null);
  const chosen =
    listed(typeId) || listed(linked) || listed(draft?.ticketType) || listed(defaultType(ticketing, linked)) || (ticketing && ticketing.types.length === 1 ? ticketing.types[0] : null);
  const namesType = linked !== null && typeById(ticketing, linked) !== null;
  // Sent only when there was a choice (or a link named one): one ticket sends what it always did.
  const sendType = chooseTicket || namesType ? (chosen?.id ?? null) : null;
  const typeFee = chosen ? (chosen.isFree ? 0 : chosen.price) : null;
  const fee = ticketing ? (chosen ? typeFee : anyPaid(ticketing) ? null : 0) : event.has_fee ? (event.fee ?? infoFee) : 0;

  // A discount code, on a ticket that costs something (and only from a server that has them).
  const showCode = Boolean(ticketing) && (chosen ? !chosen.isFree : anyPaid(ticketing));
  const code = useDiscountCode({
    eventId,
    ticketTypeId: chosen?.id ?? null,
    email: isEmail(values.email) ? values.email.trim() : null,
    phone: values.phone.trim() && values.phone.trim().length <= 20 ? values.phone.trim() : null,
  });
  const applied = showCode && code.applied && (chosen === null || code.applied.ticketTypeId === null || code.applied.ticketTypeId === chosen.id) ? code.applied : null;
  const discount = applied && fee !== null ? Math.min(fee, applied.discount) : 0;

  const addOns = picksTotal(shelf, picks);
  const total = fee === null ? null : Math.max(0, fee - discount) + addOns;
  const pays = total === null || total > 0;
  // Paid now, at the end of the form: never under review (a confirmed paid ticket gets a link to pay).
  const paysNow = pays && !approval;
  const ticketLabel = chooseTicket || namesType ? chosen?.name || null : null;
  const lines = useMemo(
    () => orderLines({ fee, items: shelf, picks, ticket: ticketLabel, discount: discount > 0 ? { code: applied.code, amount: discount } : null }),
    [fee, shelf, picks, ticketLabel, discount, applied],
  );

  const byWhatsapp = wantsWhatsapp(values, whatsapp);
  // The club's own updates on WhatsApp, offered only where the API says the club can send them
  // (`whatsapp_updates`): the form's GET /events/info says it freshest; until it does, the event
  // page's club. Without the flag at all, the box never shows and nothing is sent.
  const formClub = info.data?.club;
  // The club that reviews the registrations, named as the form or the event page names it.
  const confirmerClub = formClub?.name ? formClub : club;
  const offersUpdates = typeof formClub?.whatsapp_updates === "boolean" ? formClub.whatsapp_updates : offersClubUpdates(club);
  const clubName = formClub?.name || club?.name || "";
  const byClubUpdates = offersUpdates && wantsWhatsapp(values, clubUpdates);
  const detailErrors = useMemo(
    () => validateDetails(values, { whatsapp: byWhatsapp || byClubUpdates }),
    [values, byWhatsapp, byClubUpdates]
  );
  const answerErrors = useMemo(() => {
    const raw = validateAnswers(questions, answers);
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [`q:${k}`, v]));
  }, [questions, answers]);
  const ticketErrors = !chooseTicket
    ? {}
    : !chosen
      ? { ticket_type: "Choose a ticket." }
      : !onSale(chosen)
        ? { ticket_type: "This ticket isn't on sale now. Choose another." }
        : {};
  const errorsOf = (stepId) => (stepId === "details" ? detailErrors : stepId === "questions" ? answerErrors : stepId === "ticket" ? ticketErrors : {});
  const orderOf = (stepId) =>
    stepId === "details" ? DETAIL_KEYS : stepId === "questions" ? questions.map((q) => `q:${q.key}`) : stepId === "ticket" ? ["ticket_type"] : [];

  // The step: the one the address names, but never past a step that still needs something.
  const want = params.get("step");
  const firstBad = steps.findIndex((s) => Object.keys(errorsOf(s.id)).length > 0);
  let index = Math.max(0, steps.findIndex((s) => s.id === want));
  if (firstBad !== -1 && index > firstBad) index = firstBad;
  const step = steps[index];

  /** This page's address with the step `id` in it (the first step has none). */
  const hrefFor = useCallback(
    (id, search = params) => {
      const next = new URLSearchParams(search.toString());
      if (id === null || id === steps[0].id) next.delete("step");
      else next.set("step", id);
      const s = next.toString();
      return `${pathname}${s ? `?${s}` : ""}`;
    },
    [params, pathname, steps],
  );

  // A step is a new entry in the browser's history, made without asking the
  // server: Next follows pushState and replaceState, and so does useSearchParams.
  const goTo = (id, { replace = false, edit = false } = {}) => {
    setEditing(edit);
    const href = hrefFor(id);
    if (replace) window.history.replaceState(null, "", href);
    else {
      openedFrom.current[id] = step.id;
      window.history.pushState(null, "", href);
    }
  };

  // An address naming a step that can't be shown yet is put right.
  useEffect(() => {
    if (!ready || !want || step.id === want) return;
    window.history.replaceState(null, "", hrefFor(step.id));
  }, [ready, want, step.id, hrefFor]);

  // A new step starts at the top, with its title focused (or the field that needs fixing).
  // From the second step shown on, each one comes in with a short slide (`stepping`, styles/motion.css);
  // the first is simply there.
  const seen = useRef(false);
  const [stepping, setStepping] = useState(false);
  useEffect(() => {
    if (!ready) return;
    if (!seen.current) {
      seen.current = true;
      return;
    }
    setStepping(true);
    scrollTop();
    if (focusNext.current) {
      const key = focusNext.current;
      focusNext.current = null;
      focusField(key);
    } else {
      heading.current?.focus({ preventScroll: true });
    }
  }, [step.id, ready]);

  // Google's One Tap, offered quietly on the details step to someone signed out.
  const { enabled: signInOn, tryOneTap } = auth;
  const onDetails = ready && step.id === "details";
  useEffect(() => {
    if (!signInOn || accountEmail || !onDetails || !oneTapWelcome()) return undefined;
    tryOneTap();
    return () => cancelOneTap();
  }, [signInOn, accountEmail, onDetails, tryOneTap]);

  // Once every field the server pointed at has been changed, its note goes too.
  useEffect(() => {
    if (problem?.kind === "fields" && Object.keys(serverErrors).length === 0) setProblem(null);
  }, [problem, serverErrors]);

  /* ---------- typing ---------- */

  const changed = (key) => {
    setServerErrors((s) => {
      if (!(key in s)) return s;
      const next = { ...s };
      delete next[key];
      return next;
    });
    setProblem((p) => (p && p.kind !== "fields" ? null : p));
  };
  const setValue = (key) => (v) => {
    setValues((s) => ({ ...s, [key]: v }));
    changed(key);
  };
  const setAnswer = (key) => (v) => {
    setAnswers((s) => ({ ...s, [key]: v }));
    changed(`q:${key}`);
  };
  const setShelfPicks = (next) => {
    setPicks(next);
    setProblem((p) => (p?.kind === "soldout" ? null : p));
  };
  // A field is checked once it is left with something in it; an empty one waits for Continue.
  const leave = (key, value) => () => {
    if (value === "" || value === undefined) return;
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  };
  const errorFor = (key) => serverErrors[key] || (touched[key] ? detailErrors[key] || answerErrors[key] || ticketErrors[key] : null) || null;

  /* ---------- moving ---------- */

  const back = () => {
    const prev = steps[index - 1];
    if (!prev) return;
    // Opened from the step before: back through history, so the phone's back button agrees.
    if (openedFrom.current[step.id] === prev.id) {
      delete openedFrom.current[step.id];
      router.back();
    } else goTo(prev.id, { replace: true });
  };

  const changeEmail = () => {
    setProblem(null);
    focusNext.current = "email";
    goTo("details", { edit: true });
  };

  /* ---------- registering ---------- */

  const finish = (responseData, paid, amount = null) => {
    // The ticket's type (when there was a choice) and the code that took something off, as the server says them.
    const typeName = ticketTypeName(responseData) || ticketLabel;
    const used = responseData.discount && typeof responseData.discount === "object" ? responseData.discount : null;
    const ticket = {
      eventId,
      ticket_id: responseData.ticket_id,
      name: responseData.full_name || values.name,
      email: responseData.email || values.email,
      paid,
      amount: paid ? (amount ?? (Number(responseData.pay_amount) || 0)) : 0,
      account: submittedAs.current,
      ...(typeName && (chooseTicket || namesType) ? { ticket_type: typeName } : {}),
      ...(used?.code ? { code: String(used.code), covered: !(Number(responseData.pay_amount) > 0) && Number(used.amount) > 0 } : {}),
    };
    busy.current = false;
    setPhase("idle");
    clearDraft(eventId);
    // The step leaves the address; the page shows the ticket from here on.
    window.history.replaceState(null, "", hrefFor(null));
    onDone(ticket);
    scrollTop();
  };

  /** The club reviews registrations: this one went in under review (a request), with no ticket yet. */
  const requested = (asked) => {
    busy.current = false;
    setPhase("idle");
    clearDraft(eventId);
    window.history.replaceState(null, "", hrefFor(null));
    onDone({
      eventId,
      kind: "request",
      request: { id: asked.id, token: asked.token, path: asked.path, status: asked.status },
      name: values.name,
      email: values.email,
      account: submittedAs.current,
      pays,
      amount: total ?? 0,
      ...(ticketLabel ? { ticket_type: ticketLabel } : {}),
    });
    scrollTop();
  };

  const showError = (error) => {
    // A registration under review is never offered a waiting list, whatever the refusal says.
    const p = describeRegisterError(error, questions.map((q) => q.key), { approval });
    // Add-ons refused because the club reviews registrations now: the form becomes that event's form, add-ons gone.
    if (p.kind === "approval" && p.addOns) setReviewedNow(true);
    // The tickets changed under the form (sold out, off sale, full): read them again.
    if (p.ticketTypes || p.kind === "full") tix.reload();
    if (p.kind === "fields" && p.fields.discount_code) code.refuse(p.fields.discount_code);
    // A ticket refused where there was no choice of tickets: said on the review, with its waiting list when it has one.
    if (p.kind === "fields" && p.fields.ticket_type && !steps.some((s) => s.id === "ticket")) {
      setProblem(
        p.waitlist
          ? { kind: "full", title: "Tickets just sold out", message: "Join the waiting list and we'll email you if a place opens up.", waitlist: true }
          : { kind: "message", message: p.fields.ticket_type },
      );
      return;
    }
    if (p.kind === "soldout") {
      const next = applyStockRefusal(shelf, picks, p);
      setItems(next.items);
      setPicks(next.picks);
      const onShelf = steps.some((s) => s.id === "addons") && shelf.some((i) => String(i.id) === p.itemId);
      setProblem({ ...p, step: onShelf ? "addons" : "review" });
      if (onShelf) goTo("addons", { edit: true });
      return;
    }
    if (p.kind !== "fields") {
      setProblem(p);
      return;
    }
    setServerErrors(p.fields);
    const keys = Object.keys(p.fields);
    const target = steps.find((s) => keys.some((k) => ownsKey(s.id, k)));
    if (!target) {
      setProblem({ kind: "message", message: p.message || Object.values(p.fields)[0] });
      return;
    }
    const firstKey = orderOf(target.id).find((k) => p.fields[k]) || keys[0];
    setProblem({ kind: "fields", step: target.id, message: p.message });
    if (target.id === step.id) {
      // On this step already (a discount code refused on the review): no new history entry, just the field.
      setTimeout(() => focusField(firstKey), 0);
      return;
    }
    focusNext.current = firstKey;
    goTo(target.id, { edit: true });
  };

  const paymentProblem = (outcome, error = null) => ({ kind: "payment", ...describePayment(outcome, error, { email: values.email }) });

  const submit = async () => {
    if (busy.current) return;
    if (firstBad !== -1) {
      goTo(steps[firstBad].id);
      return;
    }
    busy.current = true;
    submittedAs.current = accountEmail;
    setProblem(null);
    setPhase("registering");
    const release = () => {
      busy.current = false;
      setPhase("idle");
    };
    const payload = buildPayload({
      values,
      questions,
      answers,
      ref: currentRef(),
      items: shelf,
      picks,
      whatsapp,
      clubUpdates: byClubUpdates,
      ticketTypeId: sendType,
      discountCode: showCode ? code.toSend : null,
    });
    let stage = "register";
    let responseData = null;
    try {
      responseData = await eventsApi.registerForEvent(eventId, payload);
      // The club reviews registrations: under review, with no ticket and nothing to pay yet.
      const asked = parseApproval(responseData);
      if (asked) {
        requested(asked);
        return;
      }
      if (!responseData || !responseData.ticket_id) {
        setProblem({ kind: "message", message: "The registration didn't go through — no ticket came back. Try again." });
        release();
        return;
      }
      if (!(responseData.pay_amount > 0)) {
        // No payment needed: the ticket is ready.
        finish(responseData, false);
        return;
      }
      stage = "payment";
      setPhase("paying");
      const order = await paymentsApi.createPaymentOrder(eventId, responseData.event_registration_id);
      if (!order) {
        setProblem(paymentProblem("start"));
        release();
        return;
      }
      const result = await payOrder(order, { name: values.name, email: values.email, phone: values.phone });
      if (result.outcome === "paid") {
        finish(responseData, true);
        return;
      }
      setProblem(paymentProblem(result.outcome, result.error));
      release();
    } catch (error) {
      if (stage !== "payment") showError(error);
      // Paid already (a second tap, the app), or nothing left to pay: the ticket is good.
      else if (error?.code === "ALREADY_PAID") return finish(responseData, true);
      else if (error?.code === "NOTHING_TO_PAY") return finish(responseData, false);
      else setProblem(paymentProblem("refused", error));
      release();
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (step.id === "review") {
      submit();
      return;
    }
    const errs = errorsOf(step.id);
    const bad = orderOf(step.id).filter((k) => errs[k]);
    if (bad.length) {
      setTouched((t) => ({ ...t, ...Object.fromEntries(bad.map((k) => [k, true])) }));
      focusField(bad[0]);
      return;
    }
    const allGood = steps.every((s) => Object.keys(errorsOf(s.id)).length === 0);
    if (editing && allGood) goTo("review");
    else goTo(steps[index + 1].id, { edit: editing });
  };

  /* ---------- what is shown ---------- */

  const summary = <Summary event={event} club={club} lines={lines} total={total} picked={addOns > 0 || lines.length > 1} />;

  if (info.status === "error") {
    return (
      <div className="rg-layout">
        {summary}
        <div className="rg-main">
          <ErrorState
            title="The form didn't load"
            message="We couldn't load this event's registration form. Check your connection and try again."
            onRetry={info.retry}
          />
        </div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="rg-layout">
        {summary}
        <div className="rg-main">
          <FormSkeleton />
        </div>
      </div>
    );
  }

  const isReview = step.id === "review";
  const title = isReview ? (approval ? "Review and register" : pays ? "Review and pay" : "Review and confirm") : step.title;
  const reviews = approvalNote(confirmerClub);
  const ledes = {
    ticket: `${club?.name || "The organisers"} sell${club?.name ? "s" : ""} more than one kind of ticket for this event. Pick yours.`,
    details: approval
      ? `It takes a minute. ${reviews}`
      : accountEmail
        ? "It takes a minute. Your ticket comes by email and lands in your MyOtherApp app."
        : "It takes a minute. Your ticket comes by email.",
    questions: `${club?.name || "The organisers"} would like to know a little more. Questions marked * need an answer.`,
    addons: "Paid together with your registration and collected at the event. Skip it if you don't want anything.",
    review: approval
      ? `Check everything is right, then register. ${reviews}${pays ? " You pay only if yours is confirmed." : ""}`
      : "Check everything is right before you go ahead.",
  };
  const suggestion = touched.email ? suggestEmail(values.email) : null;
  const busyNow = phase !== "idle";
  const go = isReview
    ? approval
      ? "Register"
      : pays
        ? total === null
          ? "Continue to payment"
          : `Pay ${rupees(total)}`
        : "Confirm registration"
    : editing
      ? "Save and review"
      : "Continue";
  const busyLabel = phase === "paying" ? "Opening payment…" : "Registering…";
  const problemHere = problem && (problem.step || "review") === step.id;

  return (
    <div className="rg-layout">
      {summary}
      <div className="rg-main">
        <form className={`rg-form${stepping ? " is-stepping" : ""}`} noValidate onSubmit={onSubmit} aria-labelledby="rg-step-title">
          <Progress steps={steps} index={index} onJump={(id) => goTo(id, { edit: isReview })} />

          <header key={step.id} className="rg-step-head">
            <h1 id="rg-step-title" className="rg-h1" ref={heading} tabIndex={-1}>
              <span className="dc-sr">
                Step {index + 1} of {steps.length}:{" "}
              </span>
              {title}
            </h1>
            <p className="rg-lede">{ledes[step.id]}</p>
          </header>

          {step.id === "ticket" ? (
            <div className="rg-fields">
              <TicketPicker
                ticketing={ticketing}
                value={chosen?.id ?? null}
                onChange={(id) => {
                  setTypeId(id);
                  setWaitFor(null);
                  changed("ticket_type");
                }}
                error={errorFor("ticket_type")}
                onWaitlist={approval ? null : (id) => setWaitFor({ typeId: id })}
              />
              {waitFor || liveEntries(ticketing.viewerWaitlist).length ? (
                <WaitlistPanel eventId={eventId} ticketing={ticketing} open={waitFor} onChanged={tix.reload} headingLevel={2} approval={approval} />
              ) : null}
            </div>
          ) : null}

          {step.id === "details" && auth.enabled && !accountEmail ? (
            <p className="ac-haveapp">
              <GoogleMark size={16} />
              <span>
                Have the app?{" "}
                <button type="button" className="ac-linkbtn" onClick={() => auth.openSignIn({ reason: "register" })}>
                  Sign in with Google
                </button>{" "}
                or{" "}
                <button
                  type="button"
                  className="ac-linkbtn"
                  aria-label="Sign in with your email"
                  onClick={() => auth.openSignIn({ reason: "register", view: "email", email: values.email })}
                >
                  your email
                </button>{" "}
                to keep this ticket in your account.
              </span>
            </p>
          ) : null}

          {step.id === "details" ? (
            <div className="rg-fields">
              <TextField
                name="name"
                label="Full name"
                required
                value={values.name}
                onChange={setValue("name")}
                onBlur={leave("name", values.name)}
                error={errorFor("name")}
                inputProps={{ type: "text", autoComplete: "name", autoCapitalize: "words", spellCheck: false, enterKeyHint: "next", maxLength: 100 }}
              />
              <TextField
                name="email"
                label="Email"
                required
                hint={accountEmail ? null : "Your ticket is sent here."}
                value={values.email}
                onChange={setValue("email")}
                onBlur={leave("email", values.email)}
                error={errorFor("email")}
                extra={
                  accountEmail ? (
                    <p className="ac-signedas">
                      Signed in as <strong>{accountEmail}</strong> · Not you?{" "}
                      <button type="button" className="ac-linkbtn" onClick={auth.signOut}>
                        Sign out
                      </button>
                    </p>
                  ) : suggestion ? (
                    <p className="rg-suggest">
                      Did you mean{" "}
                      <button type="button" onClick={() => setValue("email")(suggestion)}>
                        {suggestion}
                      </button>
                      ?
                    </p>
                  ) : null
                }
                inputProps={{
                  type: "email",
                  autoComplete: "email",
                  inputMode: "email",
                  autoCapitalize: "none",
                  autoCorrect: "off",
                  spellCheck: false,
                  enterKeyHint: "next",
                  placeholder: "you@example.com",
                  ...(accountEmail ? { readOnly: true, "aria-readonly": true } : {}),
                }}
              />
              <TextField
                name="phone"
                label="Phone number"
                required
                hint="WhatsApp, if you have it."
                value={values.phone}
                onChange={setValue("phone")}
                onBlur={leave("phone", values.phone)}
                error={errorFor("phone")}
                inputProps={{ type: "tel", autoComplete: "tel", inputMode: "tel", enterKeyHint: "done", placeholder: "98765 43210" }}
              />
              {values.phone.trim() ? (
                <CheckField
                  name="whatsapp"
                  label="Send my ticket and event reminders on WhatsApp"
                  value={whatsapp ? "Yes" : ""}
                  option="Yes"
                  onChange={(v) => {
                    setWhatsapp(v === "Yes");
                    changed("phone");
                  }}
                />
              ) : null}
              {values.phone.trim() && offersUpdates ? (
                <CheckField
                  name="club_updates"
                  label={clubUpdatesText(clubName)}
                  value={clubUpdates ? "Yes" : ""}
                  option="Yes"
                  onChange={(v) => {
                    setClubUpdates(v === "Yes");
                    changed("phone");
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {step.id === "questions" ? (
            <div className="rg-fields">
              {questions.map((q) => (
                <QuestionField
                  key={q.key}
                  question={q}
                  value={answers[q.key] || ""}
                  error={errorFor(`q:${q.key}`)}
                  onChange={setAnswer(q.key)}
                  onBlur={leave(`q:${q.key}`, answers[q.key] || "")}
                />
              ))}
            </div>
          ) : null}

          {step.id === "addons" ? <MerchPicker items={shelf} picks={picks} onChange={setShelfPicks} /> : null}

          {isReview ? (
            <div className="rg-review">
              {chooseTicket && chosen ? (
                <ReviewBlock title="Your ticket" editLabel="Change your ticket" onEdit={() => goTo("ticket", { edit: true })}>
                  <dl className="rg-dl">
                    <div>
                      <dt>Ticket</dt>
                      <dd>
                        {chosen.name} · {typePrice(chosen)}
                      </dd>
                    </div>
                  </dl>
                </ReviewBlock>
              ) : null}
              <ReviewBlock title="Your details" editLabel="Edit your details" onEdit={() => goTo("details", { edit: true })}>
                <dl className="rg-dl">
                  <div>
                    <dt>Name</dt>
                    <dd>{values.name}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{values.email}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{values.phone}</dd>
                  </div>
                  {byWhatsapp ? (
                    <div>
                      <dt>WhatsApp</dt>
                      <dd>Your ticket and reminders, there too</dd>
                    </div>
                  ) : null}
                  {byClubUpdates ? (
                    <div>
                      <dt>Club updates</dt>
                      <dd>From {clubName || "the club"} on WhatsApp</dd>
                    </div>
                  ) : null}
                </dl>
              </ReviewBlock>
              {questions.length ? (
                <ReviewBlock title="Your answers" editLabel="Edit your answers" onEdit={() => goTo("questions", { edit: true })}>
                  <dl className="rg-dl rg-dl--stack">
                    {questions.map((q) => (
                      <div key={q.key}>
                        <dt>{q.label}</dt>
                        <dd className={answers[q.key] ? undefined : "is-empty"}>{answers[q.key] || "Not answered"}</dd>
                      </div>
                    ))}
                  </dl>
                </ReviewBlock>
              ) : null}
              <section className="rg-rblock rg-rblock--pay" aria-labelledby="rg-order-title">
                <div className="rg-rblock-head">
                  <h2 className="rg-h2" id="rg-order-title">
                    Your order
                  </h2>
                  {shelf.length ? (
                    <button type="button" className="rg-edit" onClick={() => goTo("addons", { edit: true })} aria-label="Edit your add-ons">
                      Edit
                    </button>
                  ) : null}
                </div>
                {showCode ? <DiscountCodeField code={code} error={serverErrors.discount_code || null} onChanged={() => changed("discount_code")} /> : null}
                <Lines lines={lines} total={total} />
                {approval && items?.length ? (
                  <p className="rg-mailnote">
                    <Icon name="bag" size={16} />
                    <span>Add-ons can&rsquo;t be picked when registrations are reviewed.</span>
                  </p>
                ) : null}
                <p className="rg-mailnote">
                  <Icon name="mail" size={16} />
                  {approval ? (
                    <span>
                      If {clubLabel(confirmerClub, { start: false })} confirms your registration, we&rsquo;ll email <strong>{values.email}</strong>
                      {pays ? " a link to pay." : " your ticket."}
                    </span>
                  ) : (
                    <span>
                      Your ticket goes to <strong>{values.email}</strong>
                      {accountEmail ? " and into your MyOtherApp app" : ""}
                      {pays ? " once the payment goes through." : "."}
                    </span>
                  )}
                </p>
                {paysNow ? (
                  <p className="rg-paynote">
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
                      <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    Payment is handled securely by Razorpay.
                  </p>
                ) : null}
              </section>
            </div>
          ) : null}

          {problemHere ? (
            <Problem
              problem={problem}
              event={event}
              club={confirmerClub}
              signedIn={Boolean(accountEmail)}
              onRetry={submit}
              onChangeEmail={changeEmail}
              onSignIn={auth.enabled ? () => auth.openSignIn({ reason: "register" }) : null}
              onPaid={(r) =>
                r.ticketId
                  ? onDone({
                      eventId,
                      ticket_id: r.ticketId,
                      name: values.name,
                      email: values.email,
                      paid: r.outcome === "paid",
                      amount: r.amount || 0,
                      account: accountEmail,
                    })
                  : info.retry()
              }
              extra={
                problem.kind === "full" && problem.waitlist && !approval ? (
                  <WaitlistPanel
                    eventId={eventId}
                    ticketing={ticketing}
                    open={{ typeId: chosen?.id ?? null }}
                    fallbackTypes={chosen ? [chosen] : []}
                    onChanged={tix.reload}
                    headingLevel={2}
                  />
                ) : null
              }
            />
          ) : null}

          <div className="rg-bar">
            <div className="rg-bar-in">
              {index > 0 ? (
                <button type="button" className="rg-bar-back" onClick={back} disabled={busyNow}>
                  <Icon name="arrowLeft" size={18} />
                  <span className="rg-bar-back-text">Back</span>
                  <span className="dc-sr"> to {steps[index - 1].title.toLowerCase()}</span>
                </button>
              ) : null}
              <p className={`rg-bar-total${isReview ? " is-review" : ""}`}>
                {/* Under review, nothing is paid now: what the ticket costs, once the club confirms. */}
                <span>{approval ? "Price" : "Total"}</span>
                <strong>{total === null ? "Paid" : total > 0 ? rupees(total) : "Free"}</strong>
              </p>
              <button type="submit" className="dc-btn rg-go" disabled={busyNow}>
                {busyNow ? (
                  <>
                    <Spinner />
                    {busyLabel}
                  </>
                ) : (
                  <>
                    {go}
                    {isReview ? null : <Icon name="arrowRight" size={18} />}
                  </>
                )}
              </button>
            </div>
          </div>
          <p className="dc-sr" role="status">
            {busyNow ? busyLabel : ""}
          </p>
        </form>
      </div>
    </div>
  );
}

/* ---------- the page ---------- */

/** Leaving the page forgets its ticket; a reload (no unmount) keeps it. Deferred, so a remount (React's dev checks) keeps it too. */
const forgetting = new Map();

export default function Register({ event, club = null }) {
  const eventId = String(event.id);
  const auth = useAuth();
  const gate = registerState(event);
  const [done, setDone] = useState(null);

  useEffect(() => {
    clearTimeout(forgetting.get(eventId));
    const kept = loadDone(eventId);
    if (kept) setDone(kept);
    return () => forgetting.set(eventId, setTimeout(() => forgetDone(eventId), 0));
  }, [eventId]);

  const finished = useCallback(
    (ticket) => {
      keepDone(eventId, ticket);
      setDone(ticket);
    },
    [eventId],
  );

  const signedIn = auth.ready && auth.status === "signed-in";
  const who = signedIn ? auth.user?.email || "account" : "";
  const open = gate.kind === "open" || (gate.kind === "live" && event.registration_open);
  const ended = gate.kind === "ended";
  const cancelled = gate.kind === "cancelled";
  // The form needs its questions; signed in, the person's own registration matters even when the form is closed.
  const info = useEventInfo(eventId, auth.ready && !done && (open || (signedIn && !ended)), who);
  const mine = signedIn && info.who === who ? myRegistration(info.data) : null;
  // Signed in, a registration still under review (or confirmed, not paid yet) on an event that reviews them.
  const asked = signedIn && info.who === who ? viewerRequestOf(info.data?.ticketing) : null;
  // A full event's tickets (the public list, which counts no visit) say whether its waiting list can be joined.
  const { ticketing: closedTickets, reload: reloadClosed } = useEventTicketing(eventId, { enabled: !done && gate.kind === "full" });

  // Paid from the panel: the ticket, as the form shows one.
  const paidNow = (r, ticketId) =>
    finished({
      eventId,
      ticket_id: ticketId,
      name: auth.user?.name || "",
      email: auth.user?.email || "",
      paid: r.outcome === "paid",
      amount: r.amount || 0,
      account: auth.user?.email || null,
    });

  let body;
  if (done) body = done.kind === "request" ? <Requested event={event} club={club} done={done} /> : <Success event={event} club={club} ticket={done} />;
  else if (cancelled) body = <CancelledPanel event={event} club={club} mine={mine} />;
  else if (mine?.state === "unpaid" && !ended)
    body = <FinishPanel event={event} club={club} registration={mine} onPaid={(r) => (mine.ticketId ? paidNow(r, mine.ticketId) : info.retry())} />;
  else if (mine?.state === "registered") body = <Registered event={event} club={club} ticketId={mine.ticketId} />;
  else if (asked && open) body = <AskedPanel event={event} club={club} asked={asked} />;
  else if (open) body = <Flow key={eventId} event={event} club={club} info={info} onDone={finished} />;
  else body = <Closed event={event} club={club} gate={gate} ticketing={closedTickets} onTicketsChanged={reloadClosed} />;

  return (
    <SitePage>
      <div className="dc-wrap rg">
        <Link className="rg-back" href={eventPath(event)}>
          <Icon name="arrowLeft" size={16} />
          Back to event
        </Link>
        {body}
      </div>
    </SitePage>
  );
}
