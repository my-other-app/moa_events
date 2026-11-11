"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supportApi } from "@/api/support";
import { useAuth } from "@/auth/context";
import {
  DEFAULT_TOPICS,
  MAX_MESSAGE,
  caseNumber,
  describeSupportError,
  looksLikeCard,
  looksLikeEmail,
  readHelpPrefill,
  requestContext,
} from "@/utils/help";
import Icon from "../discover/icons";
import { Spinner } from "../register/finishpayment";
import { Attachments, stillUploading, uploadedKeys } from "./attachments";
import { MailCard, SecretsNote } from "./helpbits";

/**
 * The help form on /help ("Ask us"): a topic, a message, up to three
 * screenshots, and for a guest their name and email. POST
 * /api/v1/support/requests (feature-register/support-leads-contract.md).
 *
 *   topics   the desk's topics, read by the server; null when the server
 *            couldn't tell (the form then asks for them itself, and a 404
 *            turns it into "Email us")
 *
 * A "Get help" button elsewhere on the site (utils/help.js helpHref) opens
 * this with what went wrong in the address: the topic is picked, and the
 * error's code, its reference and the page it happened on go with the
 * request (said under the box, so the person knows).
 *
 * Signed in, the request is linked to the account (and listed under "My
 * requests"); signed out, a name and an email are asked. The first paint is
 * the guest's form for everyone (the server knows nobody); signed in, the
 * two boxes give way to "Signed in as …" once the browser has read it.
 *
 * Without a desk (404 or 405 on send): "Email us", with the message already
 * in the email.
 */

/** Reads what a "Get help" link put in the address (an island of its own: useSearchParams needs a Suspense). */
function PrefillReader({ onRead }) {
  const params = useSearchParams();
  const key = params.toString();
  useEffect(() => {
    onRead(readHelpPrefill((name) => params.get(name)));
    // `params` changes identity with every render; its contents are `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, onRead]);
  return null;
}

const EMPTY = { topic: "", subject: "", message: "", name: "", email: "" };

function Field({ id, label, optional = false, error, hint, children }) {
  return (
    <div className={`rg-field${error ? " is-invalid" : ""}`}>
      <label className="rg-label" htmlFor={id}>
        {label}
        {optional ? <span className="rg-opt">Optional</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="rg-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      <p className="rg-error" id={`${id}-error`} role={error ? "alert" : undefined}>
        {error ? (
          <>
            <Icon name="alert" size={15} />
            {error}
          </>
        ) : null}
      </p>
    </div>
  );
}

/** What the request carries from a "Get help" link, said in words. */
function Carried({ prefill }) {
  const bits = [
    prefill.error_code ? `the error (${prefill.error_code})` : null,
    prefill.track_id ? `its reference (${prefill.track_id})` : null,
    prefill.page_url ? `the page you were on (${prefill.page_url})` : null,
  ].filter(Boolean);
  if (!bits.length) return null;
  return (
    <p className="hp-carried">
      <Icon name="check" size={15} />
      <span>We&rsquo;ll include {bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits.at(-1)}` : bits[0]}, so you needn&rsquo;t explain it.</span>
    </p>
  );
}

function Sent({ sent, email, signedIn, onAgain }) {
  const ref = useRef(null);
  useEffect(() => ref.current?.focus({ preventScroll: false }), []);
  const number = caseNumber(sent.number);
  return (
    <div className="hp-sent" role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        <Icon name="check" size={26} />
      </span>
      <h3 className="hp-sent-title" ref={ref} tabIndex={-1}>
        Thanks, we&rsquo;ve got it{number ? ` (request ${number})` : ""}
      </h3>
      <p className="rg-closed-text">
        Someone from our team will read it and reply by email{email ? ` to ${email}` : ""}.
        {signedIn ? " You can also follow it here, under My requests." : " Keep that email: replying to it adds to the same request."}
      </p>
      <div className="rg-closed-actions">
        {signedIn && sent.id !== null && sent.id !== undefined ? (
          <Link className="dc-btn" href={`/help/requests/${encodeURIComponent(sent.id)}`}>
            See your request
          </Link>
        ) : null}
        <button type="button" className="dc-btn dc-btn--ghost" onClick={onAgain}>
          Ask something else
        </button>
      </div>
    </div>
  );
}

export function HelpForm({ topics: initialTopics = null }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const id = useId();
  const [topics, setTopics] = useState(initialTopics);
  const [desk, setDesk] = useState(initialTopics ? "on" : "unknown");
  const [values, setValues] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [prefill, setPrefill] = useState({});
  const [mailed, setMailed] = useState(null);
  const fields = useRef({});

  // The server couldn't say what the topics are: ask once here. 404 means no desk yet.
  useEffect(() => {
    if (initialTopics) return undefined;
    let alive = true;
    supportApi.topics().then(
      (list) => {
        if (!alive) return;
        if (list === null) setDesk("off");
        else {
          setTopics(list.length ? list : DEFAULT_TOPICS);
          setDesk("on");
        }
      },
      () => alive && setDesk("on"),
    );
    return () => {
      alive = false;
    };
  }, [initialTopics]);

  // A "Get help" link's topic picks itself (when it is one of the desk's).
  useEffect(() => {
    if (!prefill.topic) return;
    const known = (topics || DEFAULT_TOPICS).some((t) => t.key === prefill.topic);
    if (known) setValues((v) => (v.topic ? v : { ...v, topic: prefill.topic }));
  }, [prefill.topic, topics]);

  const set = (name) => (e) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((x) => ({ ...x, [name]: null }));
  };

  const shown = topics || DEFAULT_TOPICS;
  const topicLabel = shown.find((t) => t.key === values.topic)?.label || "";
  const mailSubject = `${values.subject || topicLabel || "Help"}${prefill.error_code ? ` (${prefill.error_code})` : ""}`;
  const mailBody = [values.message, prefill.page_url ? `Page: https://myotherapp.in${prefill.page_url}` : null, prefill.track_id ? `Reference: ${prefill.track_id}` : null]
    .filter(Boolean)
    .join("\n\n");

  const focus = (name) => setTimeout(() => fields.current[name]?.focus(), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const found = {};
    if (!values.topic) found.topic = "Choose what it's about.";
    if (!values.message.trim()) found.message = "Tell us what happened.";
    else if (values.message.length > MAX_MESSAGE) found.message = `Keep it under ${MAX_MESSAGE.toLocaleString("en-IN")} characters.`;
    if (!signedIn) {
      if (!values.name.trim()) found.name = "Enter your name.";
      if (!values.email.trim()) found.email = "Enter your email, so we can reply.";
      else if (!looksLikeEmail(values.email)) found.email = "Enter an email address like name@example.com.";
    }
    setErrors(found);
    const first = ["topic", "name", "email", "message"].find((k) => found[k]);
    if (first) {
      setNote(null);
      focus(first);
      return;
    }
    if (stillUploading(files)) {
      setNote({ tone: "calm", text: "Wait a moment: your screenshots are still uploading." });
      return;
    }
    setNote(null);
    setBusy(true);
    const body = {
      topic: values.topic,
      message: values.message.trim(),
      context: requestContext(prefill),
    };
    if (values.subject.trim()) body.subject = values.subject.trim();
    const keys = uploadedKeys(files);
    if (keys.length) body.attachments = keys;
    if (!signedIn) {
      body.name = values.name.trim();
      body.email = values.email.trim();
    }
    try {
      const done = await supportApi.send(body);
      setSent({ ...done, email: signedIn ? auth.user?.email || null : body.email });
      setValues((v) => ({ ...EMPTY, name: v.name, email: v.email }));
      setFiles([]);
      try {
        window.dispatchEvent(new Event("moa:help-sent"));
      } catch {
        /* not in a browser */
      }
    } catch (error) {
      const p = describeSupportError(error, "send");
      if (p.kind === "off") setMailed({ subject: mailSubject, body: mailBody });
      else if (p.kind === "fields") {
        setErrors(p.fields);
        const k = ["topic", "name", "email", "subject", "message"].find((x) => p.fields[x]);
        if (k) focus(k);
        else setNote({ tone: "error", text: Object.values(p.fields)[0] });
      } else setNote({ tone: p.kind === "limit" ? "calm" : "error", text: p.message });
    } finally {
      setBusy(false);
    }
  };

  if (desk === "off") return <MailCard />;
  if (mailed)
    return (
      <MailCard
        title="Email us instead"
        text="Our help form can't take messages just yet. Your message is in the email below: check it, then send it."
        subject={mailed.subject}
        body={mailed.body}
      />
    );
  if (sent) return <Sent sent={sent} email={sent.email} signedIn={signedIn} onAgain={() => setSent(null)} />;

  const reg = (name) => (el) => {
    fields.current[name] = el;
  };
  const described = (name, hint = false) => [hint ? `${id}-${name}-hint` : null, errors[name] ? `${id}-${name}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form className="hp-form" noValidate onSubmit={submit} aria-label="Ask us for help">
      <Suspense fallback={null}>
        <PrefillReader onRead={setPrefill} />
      </Suspense>
      <div className="rg-fields">
        <Field id={`${id}-topic`} label="What's it about?" error={errors.topic}>
          <div className="rg-select">
            <select
              ref={reg("topic")}
              id={`${id}-topic`}
              className={`rg-input${values.topic ? "" : " is-empty"}`}
              value={values.topic}
              onChange={set("topic")}
              aria-invalid={errors.topic ? true : undefined}
              aria-describedby={described("topic")}
            >
              <option value="">Choose one</option>
              {shown.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={18} className="rg-select-chev" />
          </div>
        </Field>

        {signedIn ? (
          <p className="hp-as">
            <Icon name="check" size={15} /> Signed in as <strong>{auth.user?.email || auth.user?.name}</strong>. We&rsquo;ll reply there, and here under My requests.
          </p>
        ) : (
          <div className="hp-two">
            <Field id={`${id}-name`} label="Your name" error={errors.name}>
              <input
                ref={reg("name")}
                id={`${id}-name`}
                className="rg-input"
                autoComplete="name"
                maxLength={120}
                value={values.name}
                onChange={set("name")}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={described("name")}
              />
            </Field>
            <Field id={`${id}-email`} label="Your email" error={errors.email}>
              <input
                ref={reg("email")}
                id={`${id}-email`}
                className="rg-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={200}
                value={values.email}
                onChange={set("email")}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={described("email")}
              />
            </Field>
          </div>
        )}

        <Field id={`${id}-subject`} label="Subject" optional error={errors.subject}>
          <input ref={reg("subject")} id={`${id}-subject`} className="rg-input" maxLength={160} value={values.subject} onChange={set("subject")} aria-describedby={described("subject")} />
        </Field>

        <Field
          id={`${id}-message`}
          label="What happened?"
          error={errors.message}
          hint="Say what you were doing and what you saw. The event's name or link helps us find it."
        >
          <textarea
            ref={reg("message")}
            id={`${id}-message`}
            className="rg-input rg-textarea"
            rows={6}
            maxLength={MAX_MESSAGE}
            value={values.message}
            onChange={set("message")}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={described("message", true)}
          />
        </Field>
        {looksLikeCard(values.message) ? <SecretsNote card /> : <SecretsNote />}
        <Carried prefill={prefill} />

        <Attachments files={files} onChange={setFiles} disabled={busy} id={`${id}-files`} />
      </div>

      {note ? (
        <p className={`hp-note is-${note.tone}`} role="alert">
          {note.text}
        </p>
      ) : null}
      <div className="hp-actions">
        <button type="submit" className="dc-btn" disabled={busy}>
          {busy ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            "Send"
          )}
        </button>
      </div>
    </form>
  );
}
