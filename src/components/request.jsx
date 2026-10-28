"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requestsApi } from "@/api/requests";
import { eventPath } from "@/utils/eventpage";
import { formatWhen } from "@/utils/format";
import { rupees } from "@/utils/register";
import { clubName, describeRequestError, statusWord, underReviewNote } from "@/utils/requests";
import { ErrorState } from "./discover/bits";
import { SitePage } from "./discover/chrome";
import { EpIcon } from "./discover/eventbits";
import Icon from "./discover/icons";
import { PayNote, Spinner } from "./register/finishpayment";
import { Summary } from "./register/summary";

/**
 * /requests/{token}: where a registration stands, for an event that reviews
 * registrations (registration approval; the API calls it a request). The
 * link comes in the "Thanks for registering" email and on the form's last
 * screen. The server half (src/app/requests/[token]/page.jsx) checks the
 * address; everything here happens in the browser, the token being the
 * registration's only credential:
 *
 *   GET  /registration-requests/{token}            where it stands
 *   POST /registration-requests/{token}/withdraw   cancel it (under review, or
 *                                                  confirmed and not yet paid);
 *                                                  409 REQUEST_NOT_WITHDRAWABLE
 *                                                  carries it as it stands
 *
 * What each status shows, under its status chip ("Under review",
 * "Confirmed", "Not confirmed", "Cancelled", "Expired", "Closed"):
 *   pending     under review; "Cancel my registration", after asking
 *   approved    with `ticket_id`: you're in, and the ticket;
 *               with `pay`: pay by the time the ticket is held until, on the
 *               waiting list's claim page (/claim/{pay.claim_token});
 *               neither: confirmed, the rest comes by email
 *   declined    gently, with the club's note when it left one
 *   withdrawn, lapsed: what happened, and the way back
 *   closed      by its `closed_reason`: the event ended (or was deleted)
 *               first, the event was cancelled, or a ticket came another way
 * and an address that is no registration: "This link isn't valid".
 *
 * `askToCancel` (the email's "Cancel my registration" link,
 * `{status_url}?withdraw=1`): once the registration has loaded, and only if
 * it can still be cancelled, the cancel question opens straight away. It is
 * asked once: the address loses `?withdraw=1`, so a reload doesn't ask again.
 *
 * The first paint (on the server, and the browser's first) is the loading
 * card: the registration is the browser's to read.
 */

/** The request's event, as the summary draws an event. */
const asEvent = (e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  starts_at: e.starts_at,
  ends_at: null,
  duration_hours: null,
  is_online: e.is_online,
  location_name: e.location_name,
  poster: e.poster,
  poster_thumb: null,
  category: null,
});

const eventLink = (e) => (e?.slug || (e?.id !== null && e?.id !== undefined) ? eventPath(e) : null);

/** Whether the person can still cancel it here: under review, or confirmed with a ticket still to pay for. */
const cancellable = (r) => r?.status === "pending" || (r?.status === "approved" && !r.ticketId && Boolean(r.pay));

function Skeleton() {
  return (
    <div className="rg-skel" role="status" aria-label="Loading your registration">
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

/** A link that is no registration (the API's 404): said kindly, with somewhere to go. */
function NotFound() {
  return (
    <div className="rg-closed cl-ended" role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        <EpIcon name="ticket" size={26} />
      </span>
      <h1 className="rg-h1">This link isn&rsquo;t valid</h1>
      <p className="rg-closed-text">
        We couldn&rsquo;t find a registration at this address. Check that the whole link was copied from your email: each link shows one registration.
      </p>
      <div className="rg-closed-actions">
        <Link className="dc-btn" href="/events">
          Find events
        </Link>
        <Link className="dc-btn dc-btn--ghost" href="/me/tickets">
          My tickets
        </Link>
      </div>
    </div>
  );
}

/**
 * "Cancel my registration", then the question, with the way to keep it.
 * `open`: asked straight away (the email's link), the question brought into view.
 */
function Withdraw({ token, label, question, open = false, onDone, onChanged }) {
  const [asking, setAsking] = useState(open);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const ask = useRef(null);

  // Opened by the email's link: the question is where the eye goes (below the event on a phone).
  useEffect(() => {
    if (!open) return;
    const el = ask.current;
    try {
      el?.scrollIntoView?.({ block: "center" });
    } catch {
      /* not in a browser */
    }
    el?.focus({ preventScroll: true });
  }, [open]);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      onDone(await requestsApi.withdraw(token));
    } catch (error) {
      const p = describeRequestError(error);
      if (p.kind === "gone" || p.kind === "changed") onChanged(p.kind, p.request || null);
      else setProblem({ tone: p.kind === "limit" ? "calm" : "error", title: "We couldn't cancel your registration", text: p.message });
      setBusy(false);
      setAsking(false);
    }
  };

  return (
    <div className="rq-withdraw">
      {asking ? (
        <div className="wl-leave" role="group" aria-label="Cancel your registration">
          <p ref={ask} tabIndex={-1}>
            {question}
          </p>
          <div className="wl-leave-actions">
            <button type="button" className="dc-btn dc-btn--sm dc-btn--ghost" onClick={go} disabled={busy}>
              {busy ? (
                <>
                  <Spinner />
                  Cancelling…
                </>
              ) : (
                "Yes, cancel it"
              )}
            </button>
            <button type="button" className="rg-textbtn" onClick={() => setAsking(false)} disabled={busy}>
              Keep my registration
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="rg-textbtn" onClick={() => setAsking(true)}>
          {label}
        </button>
      )}
      <PayNote problem={problem} />
    </div>
  );
}

/** What the person registered with: their name, the ticket, when. */
function Facts({ request }) {
  const sent = formatWhen(request.submittedAt);
  if (!request.fullName && !request.ticketType && !sent) return null;
  return (
    <dl className="rg-dl rq-facts">
      {request.fullName ? (
        <div>
          <dt>Name</dt>
          <dd>{request.fullName}</dd>
        </div>
      ) : null}
      {request.ticketType ? (
        <div>
          <dt>Ticket</dt>
          <dd>{request.ticketType.name}</dd>
        </div>
      ) : null}
      {sent ? (
        <div>
          <dt>Registered</dt>
          <dd>{sent} IST</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** The registration as it stands: its chip, its title, what it means, and what can be done now. */
function Status({ request, token, askToCancel = false, onWithdrawn, onChanged, notice }) {
  const heading = useRef(null);
  const e = request.event;
  const club = clubName(e.club);
  const clubMid = clubName(e.club, { start: false });
  const href = eventLink(e);
  const first = String(request.fullName || "").trim().split(/\s+/)[0];
  const chip = statusWord(request);
  const back = href ? (
    <Link className="dc-btn dc-btn--ghost" href={href}>
      Back to the event
    </Link>
  ) : null;
  const findMore = (
    <Link className="dc-btn dc-btn--ghost" href="/events">
      Find other events
    </Link>
  );
  const myTickets = (
    <Link className="dc-btn" href="/me/tickets">
      My tickets
    </Link>
  );

  // A status changed here (cancelled, or found changed): its title takes the focus.
  useEffect(() => {
    if (notice) heading.current?.focus({ preventScroll: true });
  }, [notice, request.status]);

  let icon = "ticket";
  let title;
  let tone = "";
  let body = null;
  let actions = null;
  let after = null;

  switch (request.status) {
    case "pending":
      icon = "mail";
      title = "Your registration is under review";
      body = (
        <p className="rg-closed-text">
          {first ? `${first}, you’re` : "You’re"} registered for <strong>{e.name}</strong>. {underReviewNote(e.club)} There&rsquo;s nothing else to do.
        </p>
      );
      actions = back;
      after = (
        <Withdraw
          token={token}
          label="Cancel my registration"
          question={`Cancel your registration? ${club} won't review it any more. You can register again while registration is open.`}
          open={askToCancel}
          onDone={onWithdrawn}
          onChanged={onChanged}
        />
      );
      break;
    case "approved":
      tone = "good";
      icon = "check";
      if (request.ticketId) {
        title = "You're in";
        body = (
          <p className="rg-closed-text">
            {club} confirmed your registration for <strong>{e.name}</strong>. Your ticket is in your email too.
          </p>
        );
        actions = (
          <>
            <Link className="dc-btn" href={`/tickets/${encodeURIComponent(request.ticketId)}`}>
              View your ticket
            </Link>
            {back}
          </>
        );
      } else if (request.pay) {
        const by = formatWhen(request.pay.payBy);
        const amount = request.pay.amount > 0 ? rupees(request.pay.amount) : null;
        title = "Your registration is confirmed";
        body = (
          <p className="rg-closed-text">
            {amount ? `Pay ${amount}` : "Pay"}
            {by ? (
              <>
                {" "}
                by <strong>{by} IST</strong>
              </>
            ) : null}{" "}
            to get your ticket for <strong>{e.name}</strong>.{by ? " Your ticket is held for you until then." : ""}
          </p>
        );
        actions = (
          <Link className="dc-btn" href={`/claim/${encodeURIComponent(request.pay.claimToken)}`}>
            {amount ? `Pay ${amount}` : "Pay now"}
          </Link>
        );
        after = (
          <Withdraw
            token={token}
            label="I can't come: cancel my registration"
            question="Cancel your registration? Your ticket will go to someone else, and you can't undo this."
            open={askToCancel}
            onDone={onWithdrawn}
            onChanged={onChanged}
          />
        );
      } else {
        title = "Your registration is confirmed";
        body = <p className="rg-closed-text">Look in your email for your ticket, or for the link to pay for it.</p>;
        actions = (
          <>
            {myTickets}
            {back}
          </>
        );
      }
      break;
    case "declined":
      title = "Your registration wasn't confirmed";
      body = (
        <>
          <p className="rg-closed-text">
            Thank you for your interest in <strong>{e.name}</strong>. {club} couldn&rsquo;t confirm your registration this time.
          </p>
          {request.declineNote ? (
            <p className="rg-closed-text rg-cancel-reason rq-note">
              <span>{club} said:</span> {request.declineNote}
            </p>
          ) : null}
        </>
      );
      actions = (
        <>
          <Link className="dc-btn" href="/events">
            Find other events
          </Link>
          {back}
        </>
      );
      break;
    case "withdrawn":
      title = "You cancelled your registration";
      body = (
        <p className="rg-closed-text">
          {club} won&rsquo;t review it any more. If you change your mind, you can register again while registration is open.
        </p>
      );
      actions = (
        <>
          {href ? (
            <Link className="dc-btn" href={eventPath(e, "register")}>
              Register again
            </Link>
          ) : null}
          {back}
        </>
      );
      break;
    case "lapsed":
      title = "Your registration has expired";
      body = (
        <p className="rg-closed-text">
          {club} confirmed your registration for <strong>{e.name}</strong>, but it wasn&rsquo;t paid in time. If registration is still open, you can register
          again.
        </p>
      );
      actions = (
        <>
          {back}
          {findMore}
        </>
      );
      break;
    case "closed":
      if (request.closedReason === "registered_directly") {
        tone = "good";
        icon = "check";
        title = "You're registered";
        body = (
          <p className="rg-closed-text">
            You have a ticket for <strong>{e.name}</strong> already.
          </p>
        );
        actions = (
          <>
            {myTickets}
            {back}
          </>
        );
        break;
      }
      title = "This registration is closed";
      body =
        request.closedReason === "event_cancelled" ? (
          <p className="rg-closed-text">
            <strong>{e.name}</strong> was cancelled. We&rsquo;ve emailed you about it.
          </p>
        ) : (
          <p className="rg-closed-text">
            <strong>{e.name}</strong> ended before {clubMid} could confirm your registration.
          </p>
        );
      actions = (
        <>
          {/* A deleted event has no page to go back to. */}
          {request.closedReason === "event_deleted" ? null : back}
          {findMore}
        </>
      );
      break;
    default:
      title = "Your registration";
      body = <p className="rg-closed-text">Check your email for the latest from {clubMid} about your registration.</p>;
      actions = back;
  }

  return (
    <div className={`rg-closed rq-status${tone ? ` is-${tone}` : ""}`}>
      <span className="rg-closed-icon" aria-hidden="true">
        {icon === "ticket" ? <EpIcon name="ticket" size={26} /> : <Icon name={icon} size={26} />}
      </span>
      {notice ? (
        <p className="rq-notice" role="status">
          {notice}
        </p>
      ) : null}
      {chip ? <p className={`rq-chip${request.status === "approved" ? " is-good" : ""}`}>{chip}</p> : null}
      <h1 className="rg-h1" ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {body}
      <Facts request={request} />
      {actions ? <div className="rg-closed-actions">{actions}</div> : null}
      {after}
    </div>
  );
}

/**
 * `askToCancel`: the address had `?withdraw=1` (the email's "Cancel my
 * registration" link). Asked once, for the registration as it first loads.
 */
export default function RequestStatus({ token, askToCancel = false }) {
  const [load, setLoad] = useState({ status: "loading", request: null, problem: null });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState(null);
  // Whether the email's cancel link still asks: only until the first registration that loads is shown.
  const [asks, setAsks] = useState(askToCancel);

  useEffect(() => {
    let alive = true;
    setLoad((s) => (s.status === "error" ? { ...s, status: "loading" } : s));
    Promise.resolve()
      .then(() => requestsApi.byToken(token))
      .then(
        (request) => alive && setLoad({ status: "ready", request, problem: null }),
        (error) => {
          if (!alive) return;
          const p = describeRequestError(error);
          setLoad({ status: p.kind === "gone" ? "gone" : "error", request: null, problem: p });
        },
      );
    return () => {
      alive = false;
    };
  }, [token, attempt]);

  // The question was asked (or there was nothing to cancel): the address forgets `?withdraw=1`, and so does a reload.
  const shown = load.status === "ready" || load.status === "gone";
  useEffect(() => {
    if (!askToCancel || !shown) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("withdraw")) {
        url.searchParams.delete("withdraw");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      /* not in a browser */
    }
  }, [askToCancel, shown]);

  const withdrawn = (next) => {
    setAsks(false);
    setNotice("Your registration was cancelled.");
    setLoad((s) => ({ ...s, request: next || { ...s.request, status: "withdrawn" } }));
  };
  // Cancelling found it changed (decided meanwhile: 409 REQUEST_NOT_WITHDRAWABLE, with the registration as
  // it stands) or gone: show it as it is now (read again when the refusal didn't carry it) and say so.
  const changed = (kind, now = null) => {
    setAsks(false);
    if (kind === "gone") {
      setLoad({ status: "gone", request: null, problem: null });
      return;
    }
    setNotice("Your registration changed meanwhile, so it wasn't cancelled. Here's where it stands now.");
    if (now) setLoad({ status: "ready", request: now, problem: null });
    else setAttempt((a) => a + 1);
  };

  let body;
  if (load.status === "loading" && !load.request) body = <Skeleton />;
  else if (load.status === "gone") body = <NotFound />;
  else if (load.status === "error" && !load.request)
    body = (
      <ErrorState
        title="Your registration didn't load"
        message={
          load.problem?.kind === "limit"
            ? load.problem.message
            : "We couldn't reach MyOtherApp to read this registration. Check your connection and try again."
        }
        onRetry={() => setAttempt((a) => a + 1)}
      />
    );
  else
    body = (
      <div className="rg-layout">
        <Summary
          event={asEvent(load.request.event)}
          club={load.request.event.club}
          place={Boolean(load.request.event.location_name || load.request.event.is_online)}
        />
        <div className="rg-main">
          <Status
            request={load.request}
            token={token}
            askToCancel={asks && cancellable(load.request)}
            onWithdrawn={withdrawn}
            onChanged={changed}
            notice={notice}
          />
        </div>
      </div>
    );

  return (
    <SitePage>
      <div className="dc-wrap rg rq">{body}</div>
    </SitePage>
  );
}
