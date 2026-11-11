"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ticketCancelApi } from "@/api/ticketcancel";
import { eventPath } from "@/utils/eventpage";
import { MAX_REASON, describeCancelError, refusalWords } from "@/utils/ticketcancel";
import { ErrorState } from "./discover/bits";
import { SitePage } from "./discover/chrome";
import { EpIcon } from "./discover/eventbits";
import Icon from "./discover/icons";
import { Spinner } from "./register/finishpayment";
import { Summary } from "./register/summary";

/**
 * /tickets/cancel?t=<token>: "Can't come? Give your ticket back", from the
 * link in the ticket emails (feature-register/ticket-self-cancel-contract.md).
 * The token is the link's only credential; everything is read and done in
 * the browser:
 *
 *   GET  /tickets/cancel/{token}   the event, the attendee, the ticket's code
 *                                  (masked), and whether it can be given back
 *   POST /tickets/cancel/{token}   {reason?}: gives it back (409 with the
 *                                  reason when it can't any more)
 *
 * Shows the event and the ticket, then "Give my ticket back", which asks
 * first (with a box for why, if they want). Each refusal is said plainly: a
 * paid ticket is never refunded here ("Write to <organiser> for a refund"),
 * nor one for an event that has started, a ticket used at the door, one
 * given back already, or an event that doesn't take tickets back. Done: the
 * seat is free, and an email confirms it.
 *
 * The first paint (the server's, and the browser's first) is the loading
 * card; a link with no token, or one that isn't a token, says so at once.
 */

const asEvent = (e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  starts_at: e.starts_at,
  ends_at: null,
  duration_hours: null,
  is_online: false,
  location_name: null,
  poster: e.poster,
  poster_thumb: null,
  category: null,
});

function Skeleton() {
  return (
    <div className="rg-skel" role="status" aria-label="Loading your ticket">
      <span className="dc-skel rg-skel-title" />
      <span className="dc-skel rg-skel-lede" />
    </div>
  );
}

/** A refusal (or the link's own problem), in words, with somewhere to go. */
function Refused({ reason, info }) {
  const words = refusalWords(reason, info?.organiserEmail || null);
  const href = info?.event && (info.event.slug || info.event.id !== null) ? eventPath(info.event) : null;
  const mail = (reason === "paid" || reason === "not_allowed") && info?.organiserEmail;
  return (
    <div className={`rg-closed tc-refused is-${reason}`} role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        {reason === "already_cancelled" ? <Icon name="check" size={26} /> : <EpIcon name="ticket" size={26} />}
      </span>
      <h1 className="rg-h1">{words.title}</h1>
      <p className="rg-closed-text">{words.text}</p>
      <div className="rg-closed-actions">
        {mail ? (
          <a className="dc-btn" href={`mailto:${info.organiserEmail}?subject=${encodeURIComponent(`${reason === "paid" ? "Refund" : "Can't come"}: ${info.event.name}`)}`}>
            <Icon name="mail" size={16} /> Write to {info.organiserEmail}
          </a>
        ) : null}
        {href && reason !== "invalid" ? (
          <Link className="dc-btn dc-btn--ghost" href={href}>
            Back to the event
          </Link>
        ) : (
          <Link className="dc-btn dc-btn--ghost" href="/events">
            Find events
          </Link>
        )}
      </div>
    </div>
  );
}

function Facts({ info }) {
  if (!info.attendeeName && !info.ticketCode) return null;
  return (
    <dl className="rg-dl rq-facts">
      {info.attendeeName ? (
        <div>
          <dt>Name</dt>
          <dd>{info.attendeeName}</dd>
        </div>
      ) : null}
      {info.ticketCode ? (
        <div>
          <dt>Ticket</dt>
          <dd>{info.ticketCode}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function GiveBack({ token, info, onDone, onRefused }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    if (asking) box.current?.focus();
  }, [asking]);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await ticketCancelApi.cancel(token, reason.trim().slice(0, MAX_REASON));
      onDone();
    } catch (error) {
      const p = describeCancelError(error);
      if (p.kind === "reason") onRefused(p.reason);
      else if (p.kind === "invalid") onRefused("invalid");
      else setProblem(p.message);
      setBusy(false);
    }
  };

  const first = String(info.attendeeName || "").split(/\s+/)[0];
  return (
    <div className="rg-closed tc-card">
      <span className="rg-closed-icon" aria-hidden="true">
        <EpIcon name="ticket" size={26} />
      </span>
      <h1 className="rg-h1">Can&rsquo;t come?</h1>
      <p className="rg-closed-text">
        {first ? `${first}, if` : "If"} you can&rsquo;t make it to <strong>{info.event.name}</strong>, give your ticket back. Your seat goes free for someone else, and
        the organisers will know you&rsquo;re not coming.
      </p>
      <Facts info={info} />
      {asking ? (
        <div className="tc-ask" role="group" aria-label="Give your ticket back">
          <label className="rg-label" htmlFor="tc-reason">
            Why can&rsquo;t you come?<span className="rg-opt">Optional</span>
          </label>
          <textarea
            ref={box}
            id="tc-reason"
            className="rg-input rg-textarea tc-reason"
            rows={3}
            maxLength={MAX_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-describedby="tc-reason-hint"
          />
          <p className="rg-hint" id="tc-reason-hint">
            The organisers see this. {MAX_REASON - reason.length} characters left.
          </p>
          <p className="tc-warn">You can&rsquo;t undo this: the ticket stops working, and you&rsquo;d need to register again.</p>
          {problem ? (
            <p className="tc-problem" role="alert">
              {problem}
            </p>
          ) : null}
          <div className="rg-closed-actions">
            <button type="button" className="dc-btn" onClick={go} disabled={busy}>
              {busy ? (
                <>
                  <Spinner />
                  Giving it back…
                </>
              ) : (
                "Yes, give it back"
              )}
            </button>
            <button type="button" className="rg-textbtn" onClick={() => setAsking(false)} disabled={busy}>
              Keep my ticket
            </button>
          </div>
        </div>
      ) : (
        <div className="rg-closed-actions">
          <button type="button" className="dc-btn" onClick={() => setAsking(true)}>
            Give my ticket back
          </button>
          {info.event.slug || info.event.id !== null ? (
            <Link className="dc-btn dc-btn--ghost" href={eventPath(info.event)}>
              Back to the event
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function TicketCancel({ token }) {
  const [load, setLoad] = useState(token ? { status: "loading", info: null, problem: null } : { status: "invalid", info: null, problem: null });
  const [attempt, setAttempt] = useState(0);
  const [refused, setRefused] = useState(null);
  const [done, setDone] = useState(false);
  const heading = useRef(null);

  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    ticketCancelApi.info(token).then(
      (info) => alive && setLoad({ status: "ready", info, problem: null }),
      (error) => {
        if (!alive) return;
        const p = describeCancelError(error);
        if (p.kind === "reason") setRefused(p.reason);
        setLoad({ status: p.kind === "invalid" ? "invalid" : p.kind === "reason" ? "ready" : "error", info: null, problem: p });
      },
    );
    return () => {
      alive = false;
    };
  }, [token, attempt]);

  useEffect(() => {
    if (done) heading.current?.focus({ preventScroll: true });
  }, [done]);

  let main;
  if (load.status === "loading") main = <Skeleton />;
  else if (load.status === "invalid") main = <Refused reason="invalid" info={null} />;
  else if (load.status === "error")
    main = <ErrorState title="Your ticket didn't load" message={load.problem?.message} onRetry={() => setAttempt((a) => a + 1)} />;
  else if (done) {
    const info = load.info;
    main = (
      <div className="rg-closed is-good" role="status">
        <span className="rg-closed-icon" aria-hidden="true">
          <Icon name="check" size={26} />
        </span>
        <h1 className="rg-h1" ref={heading} tabIndex={-1}>
          Your ticket is given back
        </h1>
        <p className="rg-closed-text">
          Thanks for letting the organisers know. Your seat at <strong>{info.event.name}</strong> is free for someone else, and we&rsquo;ve emailed you to
          confirm. If plans change, you can register again while registration is open.
        </p>
        <div className="rg-closed-actions">
          <Link className="dc-btn" href="/events">
            Find other events
          </Link>
        </div>
      </div>
    );
  } else if (refused || !load.info.cancellable) main = <Refused reason={refused || load.info.reason} info={load.info} />;
  else main = <GiveBack token={token} info={load.info} onDone={() => setDone(true)} onRefused={setRefused} />;

  const info = load.info;
  return (
    <SitePage>
      <div className="dc-wrap rg rq tc">
        {info ? (
          <div className="rg-layout">
            <Summary event={asEvent(info.event)} club={null} place={false} />
            <div className="rg-main">{main}</div>
          </div>
        ) : (
          main
        )}
      </div>
    </SitePage>
  );
}
