import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { eventsApi } from "@/api/events";
import { paymentsApi } from "@/api/payments";
import { processPayment } from "@/utils/payment";
import { currentRef } from "@/utils/ref";
import { picksTotal } from "@/utils/picks";
import { eventPath, eventUrl, registerState } from "@/utils/eventpage";
import { usePageMeta } from "@/utils/meta";
import {
  buildPayload,
  clearDraft,
  describeRegisterError,
  fieldId,
  loadDraft,
  orderLines,
  parseQuestions,
  rupees,
  saveDraft,
  stepsFor,
  suggestEmail,
  validateAnswers,
  validateDetails,
} from "@/utils/register";
import { ErrorState, StoreButtons } from "../discover/bits";
import { SitePage } from "../discover/chrome";
import { CalendarButton, EpIcon } from "../discover/eventparts";
import Icon from "../discover/icons";
import { QuestionField, TextField } from "./fields";
import MerchPicker from "./merchpicker";
import { Lines, Summary } from "./summary";
import Success from "./success";
import "@/styles/event-page.css";
import "@/styles/register.css";

/**
 * Registering for an event, at /events/{slug}/register.
 *
 * Steps, one screen each, and only the ones this event has:
 *   Details   name, email, phone
 *   Questions the organiser's own questions, if it asks any
 *   Add-ons   the event's shelf, if it sells anything
 *   Review    what was entered and the total, then Confirm (free) or Pay
 * then "You're in" with the ticket. The step is in the address (?step=), so
 * the phone's back button steps back; what was typed is kept for the tab.
 *
 * The calls are the ones the form has always made, in the same order with
 * the same payloads: register; then, when there is something to pay, create
 * the order and open Razorpay, which verifies. Trying again after a closed
 * checkout sends the same registration again with the guest token the first
 * one left, and the server hands back the unpaid registration it already has
 * rather than making another. Its refusals are shown in its own words: 409
 * ALREADY_REGISTERED (with the app), 409 REGISTRATION_AWAITING_PAYMENT, and
 * 400 CLUB_EMAIL beside the email field.
 */

const DETAIL_KEYS = ["name", "email", "phone"];
const EMPTY = { name: "", email: "", phone: "" };

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

function Spinner() {
  return <span className="rg-spin" aria-hidden="true" />;
}

const PROBLEMS = {
  dismissed: {
    tone: "calm",
    title: "Payment not completed",
    text: () => "You closed the payment window before paying, so nothing was charged. Your details are saved — pay whenever you're ready.",
  },
  verify: {
    tone: "warn",
    title: "We couldn't confirm your payment yet",
    text: (email) => `If money left your account, don't pay again: Razorpay confirms it to us and your ticket will reach ${email}. If nothing was charged, try again.`,
  },
  load: {
    tone: "calm",
    title: "The payment window didn't open",
    text: () => "Check your connection, then try again. Nothing was charged.",
  },
  start: {
    tone: "calm",
    title: "We couldn't start the payment",
    text: () => "Nothing was charged. Try again in a moment.",
  },
};

const paymentProblem = (reason, message = null) => ({ kind: "payment", reason: PROBLEMS[reason] ? reason : "start", message });

/** "Failed to create payment order" → "Failed to create payment order." */
const sentence = (s) => {
  const t = String(s || "").trim();
  return t && !/[.!?]$/.test(t) ? `${t}.` : t;
};

/** What went wrong with the registration, said once and calmly, with the way forward. */
function Problem({ problem, email, onRetry, onChangeEmail }) {
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
  if (problem.kind === "payment") {
    const p = PROBLEMS[problem.reason];
    tone = p.tone;
    title = p.title;
    text = problem.message ? `${sentence(problem.message)} Nothing was charged.` : p.text(email);
  } else if (problem.kind === "duplicate") {
    tone = "info";
    title = "You're already registered";
    actions = (
      <>
        <StoreButtons />
        <button type="button" className="rg-textbtn" onClick={onChangeEmail}>
          Register with a different email
        </button>
      </>
    );
  } else if (problem.kind === "awaiting") {
    tone = "info";
    title = "Your registration is waiting for payment";
    actions = <StoreButtons />;
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
    <div className="rg-layout">
      <Summary event={event} club={club} />
      <div className="rg-main">
        <div className="rg-closed" role="status">
          <span className="rg-closed-icon" aria-hidden="true">
            <EpIcon name={gate.kind === "soon" ? "calendarPlus" : "ticket"} size={26} />
          </span>
          <h1 className="rg-h1">{copy.title}</h1>
          <p className="rg-closed-text">{copy.text}</p>
          <div className="rg-closed-actions">
            {gate.kind === "live" ? (
              <Link className="dc-btn dc-btn--accent" to={eventPath(event, "live")}>
                Open the live room
              </Link>
            ) : null}
            {gate.kind === "soon" ? <CalendarButton event={event} url={eventUrl(event)} /> : null}
            <Link className="dc-btn" to={eventPath(event)}>
              Back to the event
            </Link>
            <Link className="dc-btn dc-btn--ghost" to="/events">
              Find other events
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- the flow ---------- */

function Flow({ event, club }) {
  const eventId = String(event.id);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const [info, setInfo] = useState({ status: "loading", questions: [], fee: null });
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState(null);
  const [draft] = useState(() => loadDraft(eventId));
  const [values, setValues] = useState(() => draft?.values || EMPTY);
  const [answers, setAnswers] = useState(() => draft?.answers || {});
  const [picks, setPicks] = useState(() => draft?.picks || {});
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [phase, setPhase] = useState("idle");
  const [problem, setProblem] = useState(null);
  const [done, setDone] = useState(() => (location.state?.rgDone?.eventId === eventId ? location.state.rgDone : null));
  const busy = useRef(false);
  const heading = useRef(null);
  const focusNext = useRef(null);

  // The organiser's questions (and the fee as the form knows it).
  useEffect(() => {
    if (done) return undefined;
    let alive = true;
    setInfo((s) => (s.status === "loading" ? s : { ...s, status: "loading" }));
    Promise.resolve(eventsApi.fetchEvent(eventId))
      .then((d) => {
        if (!alive) return;
        if (!d) setInfo({ status: "error", questions: [], fee: null });
        else setInfo({ status: "ready", questions: parseQuestions(d.additional_details), fee: Number(d.reg_fee) > 0 ? Number(d.reg_fee) : null });
      })
      .catch(() => alive && setInfo({ status: "error", questions: [], fee: null }));
    return () => {
      alive = false;
    };
  }, [eventId, attempt, done]);

  // The shelf. Nothing on it (or no answer) means no add-ons step.
  useEffect(() => {
    if (done) return undefined;
    let alive = true;
    Promise.resolve(eventsApi.fetchStoreCatalog(eventId))
      .then((cat) => alive && setItems(cat && cat.enabled && Array.isArray(cat.items) ? cat.items : []))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [eventId, done]);

  // What was typed, kept for the tab.
  useEffect(() => {
    if (!done) saveDraft(eventId, { values, answers, picks });
  }, [eventId, values, answers, picks, done]);

  const ready = info.status === "ready" && items !== null;
  const questions = info.questions;
  const shelf = useMemo(() => items || [], [items]);
  const steps = useMemo(() => stepsFor({ questions, items: shelf }), [questions, shelf]);

  const fee = event.has_fee ? (event.fee ?? info.fee) : 0;
  const addOns = picksTotal(shelf, picks);
  const total = fee === null ? null : fee + addOns;
  const pays = total === null || total > 0;
  const lines = useMemo(() => orderLines({ fee, items: shelf, picks }), [fee, shelf, picks]);

  const detailErrors = useMemo(() => validateDetails(values), [values]);
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
  const editing = Boolean(location.state?.rgEdit);

  const goTo = (id, { replace = false, edit = false } = {}) => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id === steps[0].id) next.delete("step");
        else next.set("step", id);
        return next;
      },
      { replace, state: { rgFrom: step.id, ...(edit ? { rgEdit: true } : {}) } }
    );
  };

  // An address naming a step that can't be shown yet is put right.
  useEffect(() => {
    if (!ready || done || !want || step.id === want) return;
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (index === 0) next.delete("step");
        else next.set("step", step.id);
        return next;
      },
      { replace: true }
    );
  }, [ready, done, want, step.id, index, setParams]);

  // A new step starts at the top, with its title focused (or the field that needs fixing).
  const seen = useRef(false);
  useEffect(() => {
    if (!ready || done) return;
    if (!seen.current) {
      seen.current = true;
      return;
    }
    try {
      window.scrollTo(0, 0);
    } catch {
      /* not in a browser */
    }
    if (focusNext.current) {
      const key = focusNext.current;
      focusNext.current = null;
      focusField(key);
    } else {
      heading.current?.focus({ preventScroll: true });
    }
  }, [step.id, ready, done]);

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
    if (location.state?.rgFrom === prev.id) navigate(-1);
    else goTo(prev.id, { replace: true });
  };

  const changeEmail = () => {
    setProblem(null);
    focusNext.current = "email";
    goTo("details", { edit: true });
  };

  /* ---------- registering ---------- */

  const finish = (responseData, paid) => {
    const ticket = {
      eventId,
      ticket_id: responseData.ticket_id,
      name: responseData.full_name || values.name,
      email: responseData.email || values.email,
      paid,
      amount: paid ? Number(responseData.pay_amount) || 0 : 0,
    };
    busy.current = false;
    setPhase("idle");
    clearDraft(eventId);
    setDone(ticket);
    const rest = new URLSearchParams(location.search);
    rest.delete("step");
    const search = rest.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" }, { replace: true, state: { rgDone: ticket } });
    try {
      window.scrollTo(0, 0);
    } catch {
      /* not in a browser */
    }
  };

  const showError = (error) => {
    const p = describeRegisterError(error, questions.map((q) => q.key));
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

  const submit = async () => {
    if (busy.current) return;
    if (firstBad !== -1) {
      goTo(steps[firstBad].id);
      return;
    }
    busy.current = true;
    setProblem(null);
    setPhase("registering");
    const release = () => {
      busy.current = false;
      setPhase("idle");
    };
    const payload = buildPayload({ values, questions, answers, ref: currentRef(), items: shelf, picks });
    let stage = "register";
    try {
      const responseData = await eventsApi.registerForEvent(eventId, payload);
      if (responseData && responseData.ticket_id) {
        if (responseData.pay_amount > 0) {
          // Payment required
          stage = "payment";
          setPhase("paying");
          const paymentData = await paymentsApi.createPaymentOrder(eventId, responseData.event_registration_id);
          if (paymentData) {
            Promise.resolve(
              processPayment({
                paymentData,
                userDetails: {
                  name: values.name,
                  email: values.email,
                  phone: values.phone,
                },
                onSuccess: () => finish(responseData, true),
                onFailure: (reason) => {
                  setProblem(paymentProblem(reason));
                  release();
                },
              })
            ).catch(() => {
              setProblem(paymentProblem("load"));
              release();
            });
          } else {
            setProblem(paymentProblem("start"));
            release();
          }
        } else {
          // No payment needed: the ticket is ready.
          finish(responseData, false);
        }
      } else {
        setProblem({ kind: "message", message: "The registration didn't go through — no ticket came back. Try again." });
        release();
      }
    } catch (error) {
      if (stage === "payment") setProblem(paymentProblem("start", error?.message || null));
      else showError(error);
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
    else goTo(steps[index + 1].id, editing ? { edit: true } : undefined);
  };

  /* ---------- what is shown ---------- */

  if (done) {
    return <Success event={event} club={club} ticket={done} />;
  }

  const summary = <Summary event={event} club={club} lines={lines} total={total} picked={addOns > 0 || lines.length > 1} />;

  if (info.status === "error") {
    return (
      <div className="rg-layout">
        {summary}
        <div className="rg-main">
          <ErrorState
            title="The form didn't load"
            message="We couldn't load this event's registration form. Check your connection and try again."
            onRetry={() => setAttempt((a) => a + 1)}
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
    details: "It takes a minute. Your ticket comes by email.",
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
        <form className="rg-form" noValidate onSubmit={onSubmit} aria-labelledby="rg-step-title">
          <Progress steps={steps} index={index} onJump={(id) => goTo(id, { edit: isReview })} />

          <header className="rg-step-head">
            <h1 id="rg-step-title" className="rg-h1" ref={heading} tabIndex={-1}>
              <span className="dc-sr">
                Step {index + 1} of {steps.length}:{" "}
              </span>
              {title}
            </h1>
            <p className="rg-lede">{ledes[step.id]}</p>
          </header>

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
                hint="Your ticket is sent here."
                value={values.email}
                onChange={setValue("email")}
                onBlur={leave("email", values.email)}
                error={errorFor("email")}
                extra={
                  suggestion ? (
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

          {step.id === "addons" ? <MerchPicker items={shelf} picks={picks} onChange={setPicks} /> : null}

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

          {problemHere ? <Problem problem={problem} email={values.email} onRetry={submit} onChangeEmail={changeEmail} /> : null}

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

export default function Register({ event, club = null }) {
  const location = useLocation();
  usePageMeta(`Register · ${event.name} · MyOtherApp`, `Register for ${event.name}${club?.name ? `, by ${club.name},` : ""} on MyOtherApp.`);
  const gate = registerState(event);
  const finished = location.state?.rgDone?.eventId === String(event.id);
  const open = finished || gate.kind === "open" || (gate.kind === "live" && event.registration_open);
  return (
    <SitePage>
      <div className="dc-wrap rg">
        <Link className="rg-back" to={eventPath(event)}>
          <Icon name="arrowLeft" size={16} />
          Back to event
        </Link>
        {open ? <Flow key={event.id} event={event} club={club} /> : <Closed event={event} club={club} gate={gate} />}
      </div>
    </SitePage>
  );
}
