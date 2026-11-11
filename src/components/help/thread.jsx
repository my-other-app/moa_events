"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supportApi } from "@/api/support";
import { useAuth } from "@/auth/context";
import { MAX_MESSAGE, caseNumber, describeSupportError, looksLikeCard, statusLabel } from "@/utils/help";
import { formatWhen } from "@/utils/format";
import { ErrorState } from "../discover/bits";
import { SitePage } from "../discover/chrome";
import { RichText } from "../discover/eventbits";
import Icon from "../discover/icons";
import { Spinner } from "../register/finishpayment";
import { Attachments, stillUploading, uploadedKeys } from "./attachments";
import { SecretsNote, StatusChip } from "./helpbits";

/**
 * /help/requests/{id}: one of the signed-in person's requests, its thread
 * (their messages and our replies; never our internal notes, which the API
 * doesn't send), a reply box while the request takes replies (`can_reply`),
 * and "Did we solve it?" once it is solved and unanswered.
 *
 *   GET  /support/requests/{id}            the request and its thread
 *   POST /support/requests/{id}/replies    {message, attachments?}: a reply
 *                                          reopens a solved request within
 *                                          7 days (later, the API starts a
 *                                          new one linked to it)
 *   POST /support/requests/{id}/survey     {solved, comment?}
 *
 * The first paint (the server's, and the browser's first) is the loading
 * card: who is reading is the browser's to know. Signed out: sign in to see
 * it. Not theirs, or not there (404): said kindly, with the way to /help.
 */

function Skeleton() {
  return (
    <div className="rg-skel" role="status" aria-label="Loading your request">
      <span className="dc-skel rg-skel-title" />
      <span className="dc-skel rg-skel-lede" />
      <span className="dc-skel hp-row-skel" />
      <span className="dc-skel hp-row-skel" />
    </div>
  );
}

function Message({ m }) {
  if (m.kind === "system") {
    return (
      <li className="hp-msg is-system">
        <p>{m.body}</p>
        {m.createdAt ? <time dateTime={m.createdAt}>{formatWhen(m.createdAt)}</time> : null}
      </li>
    );
  }
  const ours = m.kind === "reply_out";
  return (
    <li className={`hp-msg ${ours ? "is-ours" : "is-theirs"}`}>
      <p className="hp-msg-who">
        <strong>{ours ? m.authorName ? `${m.authorName}, MyOtherApp support` : "MyOtherApp support" : "You"}</strong>
        {m.createdAt ? (
          <>
            {" · "}
            <time dateTime={m.createdAt}>{formatWhen(m.createdAt)} IST</time>
          </>
        ) : null}
      </p>
      {m.body ? <RichText text={m.body} className="hp-msg-body" /> : null}
      {m.attachments.length ? (
        <ul className="hp-msg-files" aria-label="Attachments">
          {m.attachments.map((a, i) => (
            <li key={`${a.url}-${i}`}>
              <a href={a.url} target="_blank" rel="noopener noreferrer">
                <Icon name="fileText" size={15} />
                {a.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Reply({ id, onSent }) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const box = useRef(null);

  const send = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!message.trim()) {
      setProblem("Write your reply first.");
      box.current?.focus();
      return;
    }
    if (stillUploading(files)) {
      setProblem("Wait a moment: your screenshots are still uploading.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const body = { message: message.trim() };
    const keys = uploadedKeys(files);
    if (keys.length) body.attachments = keys;
    try {
      await supportApi.reply(id, body);
      setMessage("");
      setFiles([]);
      onSent();
    } catch (error) {
      const p = describeSupportError(error, "reply");
      setProblem(p.kind === "fields" ? Object.values(p.fields)[0] : p.kind === "off" ? "Replies can't be sent from here just now. Reply to our email instead." : p.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="hp-reply" noValidate onSubmit={send} aria-label="Reply">
      <div className={`rg-field${problem ? " is-invalid" : ""}`}>
        <label className="rg-label" htmlFor="hp-reply-box">
          Reply
        </label>
        <textarea
          ref={box}
          id="hp-reply-box"
          className="rg-input rg-textarea"
          rows={4}
          maxLength={MAX_MESSAGE}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? "hp-reply-error" : undefined}
        />
        <p className="rg-error" id="hp-reply-error" role={problem ? "alert" : undefined}>
          {problem ? (
            <>
              <Icon name="alert" size={15} />
              {problem}
            </>
          ) : null}
        </p>
      </div>
      {looksLikeCard(message) ? <SecretsNote card /> : <SecretsNote />}
      <Attachments files={files} onChange={setFiles} disabled={busy} id="hp-reply-files" />
      <div className="hp-actions">
        <button type="submit" className="dc-btn" disabled={busy}>
          {busy ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            "Send reply"
          )}
        </button>
      </div>
    </form>
  );
}

/** "Did we solve it?": yes or no, and a word if they want. `send(body)` posts it. */
export function SurveyBox({ send, initial = null, onDone }) {
  const [solved, setSolved] = useState(initial);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const go = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (solved === null) {
      setProblem("Choose yes or no.");
      return;
    }
    setBusy(true);
    setProblem(null);
    const body = { solved };
    if (comment.trim()) body.comment = comment.trim().slice(0, 1000);
    try {
      await send(body);
      onDone({ solved, comment: body.comment || null });
    } catch (error) {
      const p = describeSupportError(error, "survey");
      if (p.kind === "done") onDone({ solved, comment: body.comment || null, already: true });
      else if (p.kind === "gone") onDone({ gone: true, message: p.message });
      else setProblem(p.kind === "fields" ? Object.values(p.fields)[0] : p.kind === "off" ? "We can't take answers here just yet. Thank you all the same." : p.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="hp-survey" noValidate onSubmit={go} aria-label="Did we solve it?">
      <fieldset className="rg-field">
        <legend className="rg-label">Did we solve it?</legend>
        <div className="hp-yesno">
          {[
            [true, "Yes, it's solved"],
            [false, "No, not yet"],
          ].map(([value, label]) => (
            <button key={String(value)} type="button" className={`hp-pick${solved === value ? " is-on" : ""}`} aria-pressed={solved === value} onClick={() => setSolved(value)}>
              <Icon name={value ? "check" : "close"} size={16} />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="rg-field">
        <label className="rg-label" htmlFor="hp-survey-comment">
          Anything to add?<span className="rg-opt">Optional</span>
        </label>
        <textarea id="hp-survey-comment" className="rg-input rg-textarea hp-survey-box" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      {problem ? (
        <p className="hp-note is-error" role="alert">
          {problem}
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

function Gone({ title = "We couldn't find this request", text = "It may belong to another account, or the link may be cut short. Your requests are listed on the help page when you're signed in." }) {
  return (
    <div className="rg-closed" role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        <Icon name="comment" size={26} />
      </span>
      <h1 className="rg-h1">{title}</h1>
      <p className="rg-closed-text">{text}</p>
      <div className="rg-closed-actions">
        <Link className="dc-btn" href="/help">
          Go to Help
        </Link>
      </div>
    </div>
  );
}

export default function RequestThread({ id }) {
  const auth = useAuth();
  const signedIn = auth.ready && auth.status === "signed-in";
  const [load, setLoad] = useState({ status: "loading", request: null, problem: null });
  const [attempt, setAttempt] = useState(0);
  const [thanks, setThanks] = useState(null);

  useEffect(() => {
    if (!signedIn) return undefined;
    let alive = true;
    supportApi.request(id).then(
      (request) => alive && setLoad({ status: "ready", request, problem: null }),
      (error) => {
        if (!alive) return;
        const p = describeSupportError(error, "read");
        setLoad((s) => (s.request ? s : { status: p.kind === "gone" || p.kind === "off" ? "gone" : p.kind === "signin" ? "signin" : "error", request: null, problem: p }));
      },
    );
    return () => {
      alive = false;
    };
  }, [id, signedIn, attempt]);

  let body;
  if (!auth.ready) body = <Skeleton />;
  else if (!signedIn || load.status === "signin")
    body = (
      <div className="rg-closed" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="comment" size={26} />
        </span>
        <h1 className="rg-h1">Sign in to see your request</h1>
        <p className="rg-closed-text">Your requests and our replies are kept with your account. Sign in with the account you asked from.</p>
        <div className="rg-closed-actions">
          {auth.enabled ? (
            <button type="button" className="dc-btn" onClick={() => auth.openSignIn({ reason: "help" })}>
              Sign in
            </button>
          ) : null}
          <Link className="dc-btn dc-btn--ghost" href="/help">
            Go to Help
          </Link>
        </div>
      </div>
    );
  else if (load.status === "loading") body = <Skeleton />;
  else if (load.status === "gone") body = <Gone />;
  else if (load.status === "error")
    body = <ErrorState title="Your request didn't load" message={load.problem?.message || "Try again in a moment."} onRetry={() => setAttempt((a) => a + 1)} />;
  else {
    const r = load.request;
    const number = caseNumber(r.number);
    const asks = (r.status === "resolved" || r.status === "closed") && !r.survey && !thanks;
    body = (
      <article className="hp-thread" aria-labelledby="hp-thread-title">
        <Link className="rg-back" href="/help">
          <Icon name="arrowLeft" size={18} /> Help
        </Link>
        <header className="hp-thread-head">
          <p className="hp-thread-meta">
            {number ? <span>Request {number}</span> : null}
            <StatusChip status={r.status} label={statusLabel(r.status)} />
          </p>
          <h1 id="hp-thread-title" className="rg-h1">
            {r.subject || (number ? `Request ${number}` : "Your request")}
          </h1>
          {r.createdAt ? <p className="hp-thread-when">Sent {formatWhen(r.createdAt)} IST</p> : null}
        </header>
        <ol className="hp-msgs">
          {r.messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
        </ol>
        {r.status === "waiting" ? <p className="hp-note is-calm">We&rsquo;re waiting for your reply. If it&rsquo;s sorted, you needn&rsquo;t write.</p> : null}
        {r.canReply ? (
          <Reply id={r.id} onSent={() => setAttempt((a) => a + 1)} />
        ) : (
          <p className="hp-note is-calm">
            This request is closed. Something else? <Link href="/help#ask">Ask us again</Link>.
          </p>
        )}
        {asks ? <SurveyBox send={(b) => supportApi.surveyMine(r.id, b)} onDone={(t) => setThanks(t)} /> : null}
        {thanks?.gone ? (
          <p className="hp-note is-calm" role="status">
            {thanks.message}
          </p>
        ) : thanks || r.survey ? (
          <p className="hp-note is-good" role="status">
            <Icon name="check" size={15} /> Thanks for telling us{(thanks || r.survey).solved ? ". Glad it's sorted." : ". We'll look at it again."}
          </p>
        ) : null}
      </article>
    );
  }

  return (
    <SitePage>
      <div className="dc-wrap hp hp-page">{body}</div>
    </SitePage>
  );
}
