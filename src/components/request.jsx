"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requestsApi } from "@/api/requests";
import { eventPath } from "@/utils/eventpage";
import { formatWhen } from "@/utils/format";
import { rupees } from "@/utils/register";
import { clubName, describeRequestError } from "@/utils/requests";
import { ErrorState } from "./discover/bits";
import { SitePage } from "./discover/chrome";
import { EpIcon } from "./discover/eventbits";
import Icon from "./discover/icons";
import { PayNote, Spinner } from "./register/finishpayment";
import { Summary } from "./register/summary";

/**
 * /requests/{token}: where a request for a place stands, for an event whose
 * club confirms each place (registration approval). The link comes in the
 * "you're on the waiting list" email and on the form's last screen. The
 * server half (src/app/requests/[token]/page.jsx) checks the address;
 * everything here happens in the browser, the token being the request's
 * only credential:
 *
 *   GET  /registration-requests/{token}            where it stands
 *   POST /registration-requests/{token}/withdraw   take it back (pending, or
 *                                                  confirmed and not yet paid)
 *
 * What each status shows:
 *   pending     waiting for the club; Withdraw, after asking
 *   approved    with `ticket_id`: you're in, and the ticket;
 *               with `pay`: pay by the time the place is held until, on the
 *               waiting list's claim page (/claim/{pay.claim_token});
 *               neither: confirmed, the rest comes by email
 *   declined    gently, with the club's note when it left one
 *   withdrawn, lapsed, closed: what happened, and the way back
 * and an address that is no request: "This link isn't valid".
 *
 * The first paint (on the server, and the browser's first) is the loading
 * card: the request is the browser's to read.
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

function Skeleton() {
  return (
    <div className="rg-skel" role="status" aria-label="Loading your request">
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

/** A link that is no request (the API's 404): said kindly, with somewhere to go. */
function NotFound() {
  return (
    <div className="rg-closed cl-ended" role="status">
      <span className="rg-closed-icon" aria-hidden="true">
        <EpIcon name="ticket" size={26} />
      </span>
      <h1 className="rg-h1">This link isn&rsquo;t valid</h1>
      <p className="rg-closed-text">
        We couldn&rsquo;t find a request for a place at this address. Check that the whole link was copied from your email: each link shows one request.
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

/** "Withdraw", then "Withdraw your request?" with the way to keep it. */
function Withdraw({ token, label, question, onDone, onChanged }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      onDone(await requestsApi.withdraw(token));
    } catch (error) {
      const p = describeRequestError(error);
      if (p.kind === "gone" || p.kind === "changed") onChanged(p.kind);
      else setProblem({ tone: p.kind === "limit" ? "calm" : "error", title: "We couldn't withdraw your request", text: p.message });
      setBusy(false);
      setAsking(false);
    }
  };

  return (
    <div className="rq-withdraw">
      {asking ? (
        <div className="wl-leave" role="group" aria-label="Withdraw your request">
          <p>{question}</p>
          <div className="wl-leave-actions">
            <button type="button" className="dc-btn dc-btn--sm dc-btn--ghost" onClick={go} disabled={busy}>
              {busy ? (
                <>
                  <Spinner />
                  Withdrawing…
                </>
              ) : (
                "Yes, withdraw it"
              )}
            </button>
            <button type="button" className="rg-textbtn" onClick={() => setAsking(false)} disabled={busy}>
              Keep my request
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

/** What the person sent: their name, the ticket, when. */
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
          <dt>Sent</dt>
          <dd>{sent} IST</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** The request as it stands: its title, what it means, and what can be done now. */
function Status({ request, token, onWithdrawn, onChanged, notice }) {
  const heading = useRef(null);
  const e = request.event;
  const club = clubName(e.club);
  const clubMid = clubName(e.club, { start: false });
  const href = eventLink(e);
  const first = String(request.fullName || "").trim().split(/\s+/)[0];
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

  // A status changed here (withdrawn, or found changed): its title takes the focus.
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
      title = `Waiting for ${clubMid} to confirm`;
      body = (
        <p className="rg-closed-text">
          {first ? `${first}, your` : "Your"} request for a place at <strong>{e.name}</strong> is in. {club} confirms each place, and your ticket will come by
          email as soon as they confirm yours. There&rsquo;s nothing else to do.
        </p>
      );
      actions = back;
      after = (
        <Withdraw
          token={token}
          label="Withdraw my request"
          question={`Withdraw your request? ${club} won't see it any more. You can send a new one while registration is open.`}
          onDone={onWithdrawn}
          onChanged={onChanged}
        />
      );
      break;
    case "approved":
      tone = "good";
      if (request.ticketId) {
        icon = "check";
        title = "You're in";
        body = (
          <p className="rg-closed-text">
            {club} confirmed your place at <strong>{e.name}</strong>. Your ticket is in your email too.
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
        icon = "check";
        title = `${club} confirmed your place`;
        body = (
          <p className="rg-closed-text">
            {amount ? `Pay ${amount}` : "Pay"}
            {by ? (
              <>
                {" "}
                by <strong>{by} IST</strong>
              </>
            ) : null}{" "}
            to get your ticket for <strong>{e.name}</strong>.{by ? " Your place is held until then." : ""}
          </p>
        );
        actions = (
          <>
            <Link className="dc-btn" href={`/claim/${encodeURIComponent(request.pay.claimToken)}`}>
              {amount ? `Pay ${amount}` : "Pay now"}
            </Link>
            {back}
          </>
        );
        after = (
          <Withdraw
            token={token}
            label="I can't come: release my place"
            question={`Release your place? ${club} can offer it to someone else, and you can't take it back.`}
            onDone={onWithdrawn}
            onChanged={onChanged}
          />
        );
      } else {
        icon = "check";
        title = `${club} confirmed your place`;
        body = (
          <p className="rg-closed-text">
            Your place at <strong>{e.name}</strong> is confirmed. Look in your email for your ticket, or for the link to pay for it.
          </p>
        );
        actions = (
          <>
            <Link className="dc-btn" href="/me/tickets">
              My tickets
            </Link>
            {back}
          </>
        );
      }
      break;
    case "declined":
      title = "No place this time";
      body = (
        <>
          <p className="rg-closed-text">
            Sorry, {clubMid} couldn&rsquo;t offer you a place at <strong>{e.name}</strong> this time. Thank you for asking: there are plenty of other events to
            go to.
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
      title = "You withdrew your request";
      body = (
        <p className="rg-closed-text">
          {club} won&rsquo;t see it any more. If you change your mind, you can send a new request while registration is open.
        </p>
      );
      actions = (
        <>
          {e.slug || href ? (
            <Link className="dc-btn" href={eventPath(e, "register")}>
              Request a place again
            </Link>
          ) : null}
          {back}
        </>
      );
      break;
    case "lapsed":
      title = "Your place was released";
      body = (
        <p className="rg-closed-text">
          {club} confirmed your place at <strong>{e.name}</strong>, but the payment didn&rsquo;t arrive in time, so it was released. If registration is still
          open, you can request a place again.
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
      title = "This request is closed";
      body = (
        <p className="rg-closed-text">
          <strong>{e.name}</strong> isn&rsquo;t taking requests any more: it has ended, or the organisers called it off. If it was cancelled, we&rsquo;ve emailed you
          about it.
        </p>
      );
      actions = (
        <>
          {back}
          {findMore}
        </>
      );
      break;
    default:
      title = "Your request";
      body = <p className="rg-closed-text">Check your email for the latest from {clubMid} about your place.</p>;
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

export default function RequestStatus({ token }) {
  const [load, setLoad] = useState({ status: "loading", request: null, problem: null });
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState(null);

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

  const withdrawn = (next) => {
    setNotice("Your request was withdrawn.");
    setLoad((s) => ({ ...s, request: next || { ...s.request, status: "withdrawn" } }));
  };
  // Withdrawing found it changed (decided meanwhile) or gone: read it again and say so.
  const changed = (kind) => {
    if (kind === "gone") {
      setLoad({ status: "gone", request: null, problem: null });
      return;
    }
    setNotice("Your request changed meanwhile, so it wasn't withdrawn. Here's where it stands now.");
    setAttempt((a) => a + 1);
  };

  let body;
  if (load.status === "loading" && !load.request) body = <Skeleton />;
  else if (load.status === "gone") body = <NotFound />;
  else if (load.status === "error" && !load.request)
    body = (
      <ErrorState
        title="Your request didn't load"
        message={
          load.problem?.kind === "limit" ? load.problem.message : "We couldn't reach MyOtherApp to read this request. Check your connection and try again."
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
          <Status request={load.request} token={token} onWithdrawn={withdrawn} onChanged={changed} notice={notice} />
        </div>
      </div>
    );

  return (
    <SitePage>
      <div className="dc-wrap rg rq">{body}</div>
    </SitePage>
  );
}
