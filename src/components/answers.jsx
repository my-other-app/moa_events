"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { answersApi } from "@/api/answers";
import { eventPath } from "@/utils/eventpage";
import { addThem, answersErrors, answersPayload, byWhen, changeAnswer, describeAnswersError, detailsWord, shownQuestions, startAnswers } from "@/utils/answers";
import { hasConditions } from "@/utils/conditions";
import { fieldId, revealNote } from "@/utils/register";
import { ErrorState } from "./discover/bits";
import { SitePage } from "./discover/chrome";
import { EpIcon } from "./discover/eventbits";
import Icon from "./discover/icons";
import { Spinner } from "./register/finishpayment";
import { QuestionField } from "./register/fields";
import { Summary } from "./register/summary";

/**
 * /answers/{eventId}/{ref}?k=: the details a club asked one person for after
 * they signed up (feature-register/missing-answers-contract.md §2.2–§2.3),
 * from the link in its email, the app's notification or WhatsApp. The
 * server half (src/app/answers/...) checks the address; everything here
 * happens in the browser:
 *
 *   GET  /events/{id}/answers/{ref}?k=   who it is, what the club asks, what
 *                                        they have already
 *   POST the same, {answers}             the answers (422 names the ones to
 *                                        fix; 409 CLOSED past the deadline)
 *
 * What each `status` shows:
 *   open      "Hi Asha, Circuit Society needs 2 more details", the club's
 *             message and the deadline, then only the asked questions (and
 *             the questions that hang off them, as their answers bring them
 *             in), prefilled with what the person has; Save, then "Thanks —
 *             your ticket is unchanged" and the way to the ticket
 *   done      "You're all set"
 *   closed    "This form has closed"
 *   nothing   "This registration is no longer active"
 * and a link that is no link of ours: "This link doesn't work".
 *
 * The questions are the registration form's own (QuestionField), checked by
 * its own rules (validateAnswers), and shown by the one visibility rule
 * (utils/conditions.js): the answers given at sign-up still decide which
 * apply. The first paint (on the server, and the browser's first) is the
 * loading card.
 */

/** The page's event, as the summary card draws an event. */
const asEvent = (e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  starts_at: e.startsAt,
  ends_at: null,
  duration_hours: null,
  is_online: false,
  location_name: null,
  poster: e.poster,
  poster_thumb: null,
  category: null,
});

const eventLink = (e) => (e?.slug || (e?.id !== null && e?.id !== undefined) ? eventPath(e) : null);

const focusField = (key) => {
  const el = typeof document !== "undefined" ? document.getElementById(fieldId(`q:${key}`)) : null;
  if (!el) return;
  try {
    el.scrollIntoView({ block: "center" });
  } catch {
    /* not in a browser */
  }
  el.focus({ preventScroll: true });
};

function Skeleton() {
  return (
    <div className="rg-skel" role="status" aria-label="Loading your details">
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

/** A panel: an icon, a title, what it means, and where to go. */
function Panel({ icon = "ticket", tone = "", title, children, actions, heading }) {
  return (
    <div className={`rg-closed an-panel${tone ? ` is-${tone}` : ""}`} role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        {icon === "ticket" ? <EpIcon name="ticket" size={26} /> : <Icon name={icon} size={26} />}
      </span>
      <h1 className="rg-h1" ref={heading} tabIndex={heading ? -1 : undefined}>
        {title}
      </h1>
      {children}
      {actions ? <div className="rg-closed-actions">{actions}</div> : null}
    </div>
  );
}

/** A link that is no link of ours, or not this browser's (404, or 401/403 without a key). */
function InvalidLink() {
  return (
    <Panel
      title="This link doesn’t work"
      actions={
        <>
          <Link className="dc-btn" href="/me/tickets">
            My tickets
          </Link>
          <Link className="dc-btn dc-btn--ghost" href="/events">
            Find events
          </Link>
        </>
      }
    >
      <p className="rg-closed-text">
        It may be incomplete, or it may be someone else&rsquo;s. Open the link in your latest email or notification from the organisers: each one is
        for one person&rsquo;s registration.
      </p>
    </Panel>
  );
}

/** The way to the ticket (a confirmed registration) or the registration (one under review), and back to the event. */
function Onward({ page, primary = true }) {
  const back = eventLink(page.event);
  const own =
    page.person.kind === "request"
      ? page.requestHref
        ? { href: page.requestHref, label: "View your registration" }
        : null
      : page.ticketHref
        ? { href: page.ticketHref, label: "View your ticket" }
        : null;
  return (
    <>
      {own ? (
        <Link className={primary ? "dc-btn" : "dc-btn dc-btn--ghost"} href={own.href}>
          {own.label}
        </Link>
      ) : null}
      {back ? (
        <Link className={own || !primary ? "dc-btn dc-btn--ghost" : "dc-btn"} href={back}>
          Back to the event
        </Link>
      ) : null}
      {!own && !back ? (
        <Link className="dc-btn" href="/me/tickets">
          My tickets
        </Link>
      ) : null}
    </>
  );
}

const whatStays = (page) => (page.person.kind === "request" ? "registration" : "ticket");
const orgOf = (page, { start = true } = {}) => page.event.orgName || (start ? "The organisers" : "the organisers");

/** "Hi Asha, Circuit Society needs 2 more details"; "The organisers need …" without a name for them. */
export function greeting(page, count) {
  const org = page.event.orgName;
  const first = page.person.firstName;
  const more = `${count} more ${count === 1 ? "detail" : "details"}`;
  if (first) return `Hi ${first}, ${org ? `${org} needs` : "the organisers need"} ${more}`;
  return `${org ? `${org} needs` : "The organisers need"} ${more}`;
}

/** Nothing left to add. */
function Done({ page }) {
  return (
    <Panel icon="check" tone="good" title="You’re all set" actions={<Onward page={page} />}>
      <p className="rg-closed-text">
        {orgOf(page)} {page.event.orgName ? "has" : "have"} every detail {page.event.orgName ? "it needs" : "they need"} from you for <strong>{page.event.name}</strong>.
        Your {whatStays(page)} stays as it is.
      </p>
    </Panel>
  );
}

/** Past the deadline, or the event ended. */
function Closed({ page }) {
  const by = byWhen(page.deadline);
  return (
    <Panel icon="alert" title="This form has closed" actions={<Onward page={page} />}>
      <p className="rg-closed-text">
        {by ? `${orgOf(page)} asked for these details by ${by}.` : `${orgOf(page)} ${page.event.orgName ? "isn’t" : "aren’t"} collecting these details any more.`} Your{" "}
        {whatStays(page)} for <strong>{page.event.name}</strong> stays as it is.
      </p>
    </Panel>
  );
}

/** The registration no longer counts (cancelled, declined, withdrawn…). */
function Nothing({ page }) {
  const back = eventLink(page.event);
  return (
    <Panel
      title="This registration is no longer active"
      actions={
        <>
          <Link className="dc-btn" href="/events">
            Find events
          </Link>
          {back ? (
            <Link className="dc-btn dc-btn--ghost" href={back}>
              Back to the event
            </Link>
          ) : null}
        </>
      }
    >
      <p className="rg-closed-text">
        Your registration for <strong>{page.event.name}</strong> was cancelled or isn&rsquo;t open any more, so there&rsquo;s nothing to add to it.
      </p>
    </Panel>
  );
}

/** Saved: the ticket (or the registration) is as it was. */
function Saved({ page }) {
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <Panel icon="check" tone="good" title={`Thanks — your ${whatStays(page)} is unchanged`} actions={<Onward page={page} />} heading={heading}>
      <p className="rg-closed-text">
        {orgOf(page)} {page.event.orgName ? "has" : "have"} your details for <strong>{page.event.name}</strong> now.
      </p>
    </Panel>
  );
}

/** A refusal that isn't about one answer: said above the button. */
function Problem({ problem }) {
  if (!problem) return null;
  return (
    <div className={`rg-problem${problem.tone ? ` rg-problem--${problem.tone}` : ""}`} role="alert">
      <span className="rg-problem-icon" aria-hidden="true">
        <span>{problem.tone === "calm" ? "i" : "!"}</span>
      </span>
      <div className="rg-problem-body">
        <p className="rg-problem-title">{problem.title}</p>
        {problem.text ? <p className="rg-problem-text">{problem.text}</p> : null}
      </div>
    </div>
  );
}

/**
 * The asked questions, prefilled, and Save. `onClosed` / `onInvalid`: the
 * API said, on saving, that the form has closed or the link is no good.
 */
function Form({ page, eventId, answerRef, k, onSaved, onClosed, onInvalid }) {
  const form = useMemo(() => startAnswers(page), [page]);
  const [values, setValues] = useState(form.values);
  const [touched, setTouched] = useState(() => {
    // An answer brought from sign-up that no longer passes (a choice that is gone) says so from the start.
    const errs = answersErrors(form);
    return Object.fromEntries(Object.keys(errs).filter((key) => (form.values[key] || "") !== "").map((key) => [key, true]));
  });
  const [serverErrors, setServerErrors] = useState({});
  const [revealed, setRevealed] = useState(() => new Set());
  const [revealSaid, setRevealSaid] = useState("");
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  const shown = useMemo(() => shownQuestions(form, values), [form, values]);
  const errors = useMemo(() => answersErrors(form, values), [form, values]);
  const branching = useMemo(() => hasConditions(form.questions), [form]);
  const count = page.asked.length;
  const by = byWhen(page.deadline);

  const setAnswer = (key) => (v) => {
    const next = changeAnswer(form, values, key, v);
    setValues(next.values);
    setServerErrors((s) => {
      const gone = [key, ...next.removed.map((q) => q.key)].filter((x) => x in s);
      if (!gone.length) return s;
      const rest = { ...s };
      gone.forEach((x) => delete rest[x]);
      return rest;
    });
    setProblem((p) => (p?.kind === "fields" ? p : null));
    if (!next.added.length && !next.removed.length) return;
    setRevealed(new Set(next.added.map((q) => q.key)));
    setRevealSaid(revealNote(next.added, next.removed) || "");
    if (next.removed.length) {
      setTouched((t) => {
        const rest = { ...t };
        next.removed.forEach((q) => delete rest[q.key]);
        return rest;
      });
    }
  };
  // A field is checked once it is left with something in it; an empty one waits for Save.
  const leave = (key) => () => {
    if (!values[key]) return;
    setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
  };
  const errorFor = (key) => serverErrors[key] || (touched[key] ? errors[key] : null) || null;

  // Every field the server pointed at has been changed: its note goes too.
  useEffect(() => {
    if (problem?.kind === "fields" && Object.keys(serverErrors).length === 0) setProblem(null);
  }, [problem, serverErrors]);

  const submit = async (e) => {
    e.preventDefault();
    if (sending.current) return;
    const bad = shown.map((q) => q.key).filter((key) => errors[key]);
    if (bad.length) {
      setTouched((t) => ({ ...t, ...Object.fromEntries(bad.map((key) => [key, true])) }));
      setProblem({ kind: "check", title: "Check the highlighted answers" });
      focusField(bad[0]);
      return;
    }
    const answers = answersPayload(form, values);
    if (!Object.keys(answers).length) {
      setProblem({ kind: "empty", tone: "calm", title: "Nothing to save yet", text: "Fill in at least one detail, or come back to this link later." });
      return;
    }
    sending.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const after = await answersApi.save(eventId, answerRef, k, answers);
      onSaved(after);
    } catch (error) {
      const p = describeAnswersError(error, shown.map((q) => q.key));
      if (p.kind === "closed") return onClosed();
      if (p.kind === "invalid") return onInvalid();
      if (p.kind === "fields") {
        setServerErrors(p.fields);
        setProblem({ kind: "fields", title: "Check the highlighted answers", text: p.message });
        focusField(shown.map((q) => q.key).find((key) => p.fields[key]));
      } else {
        setProblem({ kind: p.kind, tone: p.kind === "limit" ? "calm" : null, title: "Your details weren’t saved", text: p.message });
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <form className="rg-form an-form" noValidate onSubmit={submit} aria-labelledby="an-title">
      <header className="rg-step-head">
        <h1 id="an-title" className="rg-h1">
          {greeting(page, count)}
        </h1>
        <p className="rg-lede">
          For your registration for <strong>{page.event.name}</strong>. Your {whatStays(page)} stays as it is: this only adds to it.
        </p>
      </header>
      {page.message ? (
        <p className="rg-closed-text rg-cancel-reason rq-note an-message">
          <span>{orgOf(page)} said:</span> {page.message}
        </p>
      ) : null}
      {by ? (
        <p className="an-deadline">
          <Icon name="calendar" size={16} />
          <span>
            Please {addThem(count).toLowerCase()} by <strong>{by}</strong>.
          </span>
        </p>
      ) : null}
      <div className="rg-fields an-fields">
        {shown.map((q) => (
          <QuestionField
            key={q.key}
            question={q}
            value={values[q.key] || ""}
            error={errorFor(q.key)}
            onChange={setAnswer(q.key)}
            onBlur={leave(q.key)}
            revealed={revealed.has(q.key)}
          />
        ))}
        {branching ? (
          <p className="dc-sr" role="status" aria-live="polite" data-testid="an-reveal-note">
            {revealSaid}
          </p>
        ) : null}
      </div>
      <Problem problem={problem} />
      <div className="an-actions">
        <button type="submit" className="dc-btn rg-go" disabled={busy}>
          {busy ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            `Save ${count === 1 ? "my detail" : "my details"}`
          )}
        </button>
        <p className="an-count">{detailsWord(count)} asked</p>
      </div>
    </form>
  );
}

/** What the page says once it has read the link: the form, or where things stand. */
function Body({ page, eventId, answerRef, k, onInvalid }) {
  const [now, setNow] = useState(page);
  const [saved, setSaved] = useState(null);
  if (saved) return <Saved page={saved} />;
  if (now.status === "closed") return <Closed page={now} />;
  if (now.status === "nothing") return <Nothing page={now} />;
  // Open with nothing that applies here (the answers decide otherwise): nothing to fill in.
  if (now.status === "done" || !shownQuestions(startAnswers(now)).length) return <Done page={now} />;
  return (
    <Form
      page={now}
      eventId={eventId}
      answerRef={answerRef}
      k={k}
      // The page as the API has it after; as it was before, when the answer doesn't read as one.
      onSaved={(after) => setSaved(after || now)}
      onClosed={() => setNow({ ...now, status: "closed" })}
      onInvalid={onInvalid}
    />
  );
}

export default function Answers({ eventId, answerRef, k = "" }) {
  const [load, setLoad] = useState({ status: "loading", page: null, problem: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoad((s) => (s.status === "error" ? { ...s, status: "loading" } : s));
    Promise.resolve()
      .then(() => answersApi.read(eventId, answerRef, k))
      .then(
        (page) => alive && setLoad({ status: "ready", page, problem: null }),
        (error) => {
          if (!alive) return;
          const p = describeAnswersError(error);
          setLoad({ status: p.kind === "invalid" ? "invalid" : "error", page: null, problem: p });
        },
      );
    return () => {
      alive = false;
    };
  }, [eventId, answerRef, k, attempt]);

  let body;
  if (load.status === "invalid") body = <InvalidLink />;
  else if (load.status === "error")
    body = (
      <ErrorState
        title="Your details didn’t load"
        message={load.problem?.kind === "limit" ? load.problem.message : "We couldn’t reach MyOtherApp to open this link. Check your connection and try again."}
        onRetry={() => setAttempt((a) => a + 1)}
      />
    );
  else if (load.status !== "ready") body = <Skeleton />;
  else
    body = (
      <div className="rg-layout">
        <Summary event={asEvent(load.page.event)} club={load.page.event.orgName ? { name: load.page.event.orgName } : null} place={false} />
        <div className="rg-main">
          <Body page={load.page} eventId={eventId} answerRef={answerRef} k={k} onInvalid={() => setLoad({ status: "invalid", page: null, problem: null })} />
        </div>
      </div>
    );

  return (
    <SitePage>
      <div className="dc-wrap rg an">{body}</div>
    </SitePage>
  );
}
