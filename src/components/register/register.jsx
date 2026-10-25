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
import { GoogleMark } from "../auth/account";
import { ErrorState, StoreButtons } from "../discover/bits";
import { SitePage } from "../discover/chrome";
import { CalendarButton, EpIcon } from "../discover/eventparts";
import Icon from "../discover/icons";
import { CheckField, QuestionField, TextField } from "./fields";
import { PayNote, Spinner, useFinishPayment } from "./finishpayment";
import MerchPicker from "./merchpicker";
import { Lines, Summary } from "./summary";
import Success from "./success";

/**
 * Registering for an event, at /events/{slug}/register. The page's server
 * half (src/app/events/[slug]/register/page.jsx) finds the event and hands
 * it here; this draws the same first paint on the server and in the browser
 * (the form's skeleton, or why registration isn't open), then reads who is
 * signed in and the form's questions.
 *
 * Steps, one screen each, and only the ones this event has:
 *   Details   name, email, phone
 *   Questions the organiser's own questions, if it asks any
 *   Add-ons   the event's shelf, if it sells anything
 *   Review    what was entered and the total, then Confirm (free) or Pay
 * then "You're in" with the ticket. The step is in the address (?step=),
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

const ownsKey = (stepId, key) => (stepId === "details" ? DETAIL_KEYS.includes(key) : stepId === "questions" ? key.startsWith("q:") : false);

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

/** What went wrong with the registration, said once and calmly, with the way forward. */
function Problem({ problem, event, signedIn, onRetry, onChangeEmail, onSignIn, onPaid }) {
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

function Closed({ event, club, gate }) {
  const copy = {
    soon: { title: gate.label, text: `${gate.note}. Add it to your calendar and come back then.` },
    closed: { title: "Registration has closed", text: "The organisers aren't taking new registrations for this event." },
    full: { title: "This event is full", text: `${gate.note || "Every seat is taken."} Keep an eye on the event page in case a seat opens up.` },
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

  // What was typed, kept for the tab.
  useEffect(() => {
    saveDraft(eventId, { values, answers, picks, whatsapp, clubUpdates });
  }, [eventId, values, answers, picks, whatsapp, clubUpdates]);

  const ready = info.status === "ready" && items !== null;
  const questions = useMemo(() => parseQuestions(info.data?.additional_details), [info.data]);
  const infoFee = Number(info.data?.reg_fee) > 0 ? Number(info.data.reg_fee) : null;
  const shelf = useMemo(() => items || [], [items]);
  const steps = useMemo(() => stepsFor({ questions, items: shelf }), [questions, shelf]);

  const fee = event.has_fee ? (event.fee ?? infoFee) : 0;
  const addOns = picksTotal(shelf, picks);
  const total = fee === null ? null : fee + addOns;
  const pays = total === null || total > 0;
  const lines = useMemo(() => orderLines({ fee, items: shelf, picks }), [fee, shelf, picks]);

  const byWhatsapp = wantsWhatsapp(values, whatsapp);
  // The club's own updates on WhatsApp, offered only where the API says the club can send them
  // (`whatsapp_updates`): the form's GET /events/info says it freshest; until it does, the event
  // page's club. Without the flag at all, the box never shows and nothing is sent.
  const formClub = info.data?.club;
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
  const errorsOf = (stepId) => (stepId === "details" ? detailErrors : stepId === "questions" ? answerErrors : {});
  const orderOf = (stepId) => (stepId === "details" ? DETAIL_KEYS : stepId === "questions" ? questions.map((q) => `q:${q.key}`) : []);

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
  const errorFor = (key) => serverErrors[key] || (touched[key] ? detailErrors[key] || answerErrors[key] : null) || null;

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
    const ticket = {
      eventId,
      ticket_id: responseData.ticket_id,
      name: responseData.full_name || values.name,
      email: responseData.email || values.email,
      paid,
      amount: paid ? (amount ?? (Number(responseData.pay_amount) || 0)) : 0,
      account: submittedAs.current,
    };
    busy.current = false;
    setPhase("idle");
    clearDraft(eventId);
    // The step leaves the address; the page shows the ticket from here on.
    window.history.replaceState(null, "", hrefFor(null));
    onDone(ticket);
    scrollTop();
  };

  const showError = (error) => {
    const p = describeRegisterError(error, questions.map((q) => q.key));
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
    const payload = buildPayload({ values, questions, answers, ref: currentRef(), items: shelf, picks, whatsapp, clubUpdates: byClubUpdates });
    let stage = "register";
    let responseData = null;
    try {
      responseData = await eventsApi.registerForEvent(eventId, payload);
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
  const title = isReview ? (pays ? "Review and pay" : "Review and confirm") : step.title;
  const ledes = {
    details: accountEmail ? "It takes a minute. Your ticket comes by email and lands in your MyOtherApp app." : "It takes a minute. Your ticket comes by email.",
    questions: `${club?.name || "The organisers"} would like to know a little more. Questions marked * need an answer.`,
    addons: "Paid together with your registration and collected at the event. Skip it if you don't want anything.",
    review: "Check everything is right before you go ahead.",
  };
  const suggestion = touched.email ? suggestEmail(values.email) : null;
  const busyNow = phase !== "idle";
  const go = isReview ? (pays ? (total === null ? "Continue to payment" : `Pay ${rupees(total)}`) : "Confirm registration") : editing ? "Save and review" : "Continue";
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
                <Lines lines={lines} total={total} />
                <p className="rg-mailnote">
                  <Icon name="mail" size={16} />
                  <span>
                    Your ticket goes to <strong>{values.email}</strong>
                    {accountEmail ? " and into your MyOtherApp app" : ""}
                    {pays ? " once the payment goes through." : "."}
                  </span>
                </p>
                {pays ? (
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
                <span>Total</span>
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
  // The form needs its questions; signed in, the person's own registration matters even when the form is closed.
  const info = useEventInfo(eventId, auth.ready && !done && (open || (signedIn && !ended)), who);
  const mine = signedIn && info.who === who ? myRegistration(info.data) : null;

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
  if (done) body = <Success event={event} club={club} ticket={done} />;
  else if (mine?.state === "unpaid" && !ended)
    body = <FinishPanel event={event} club={club} registration={mine} onPaid={(r) => (mine.ticketId ? paidNow(r, mine.ticketId) : info.retry())} />;
  else if (mine?.state === "registered") body = <Registered event={event} club={club} ticketId={mine.ticketId} />;
  else if (open) body = <Flow key={eventId} event={event} club={club} info={info} onDone={finished} />;
  else body = <Closed event={event} club={club} gate={gate} />;

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
