"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { accountApi } from "@/api/account";
import { requestsApi } from "@/api/requests";
import { useAuth } from "@/auth/context";
import { guestToken } from "@/auth/session";
import { eventPath, whenLine } from "@/utils/eventpage";
import { imageUrl } from "@/utils/format";
import { sizeFor } from "@/utils/pictures";
import { clubName, openRequests, payButton, requestPath, statusWord, underReviewNote } from "@/utils/requests";
import { VerifyBanner } from "../auth/verifyemail";
import { SitePage } from "../discover/chrome";
import { EmptyState, ErrorState, PosterImg, StoreButtons } from "../discover/bits";
import { ClubCard, ClubCardSkeleton } from "../discover/clubcard";
import { EventCover } from "../discover/cover";
import Icon from "../discover/icons";
import { FinishPaymentButton } from "../register/finishpayment";
import { CancelledNote, ownState, useEventStates } from "../cancelled";

/**
 * The signed-in person's own pages: /me/tickets and /me/following. Their
 * server halves (src/app/me/...) set the head (never indexed); these render
 * the same neutral first paint on the server and in the browser, then, once
 * the browser has read who is signed in: the list, or the way in. In a build
 * without sign-in, each points to the app, where these have always lived.
 * My tickets also lists the registrations still under review by a club that
 * reviews registrations (registration approval), or confirmed and not paid
 * yet, for an account or for the guest a registration here left, when the
 * API has them.
 */

const TICKETS_PAGE = 20;
const CLUBS_PAGE = 24;

/** A list from the account API that grows with "Show more". `load(offset)` resolves {items, more}. */
function useAccountList(load, pageSize, key) {
  const [state, setState] = useState({ status: "loading", items: [], more: false });
  const [extra, setExtra] = useState({ busy: false, error: false });
  const [attempt, setAttempt] = useState(0);
  const loader = useRef(load);
  const next = useRef(0);
  const seq = useRef(0);
  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    const id = ++seq.current;
    setState((s) => (s.status === "ready" && attempt > 0 ? s : { status: "loading", items: [], more: false }));
    setExtra({ busy: false, error: false });
    loader.current(0).then(
      (p) => {
        if (id !== seq.current) return;
        next.current = pageSize;
        setState({ status: "ready", items: p.items, more: p.more });
      },
      () => id === seq.current && setState((s) => ({ ...s, status: "error" })),
    );
  }, [key, attempt, pageSize]);

  const loadMore = useCallback(() => {
    const id = seq.current;
    setExtra({ busy: true, error: false });
    loader.current(next.current).then(
      (p) => {
        if (id !== seq.current) return;
        next.current += pageSize;
        setState((s) => ({ ...s, items: [...s.items, ...p.items], more: p.more }));
        setExtra({ busy: false, error: false });
      },
      () => id === seq.current && setExtra({ busy: false, error: true }),
    );
  }, [pageSize]);

  // Asked again in place: a list already shown stays until the new one comes.
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, extra, loadMore, retry };
}

function ShowMore({ list, label }) {
  if (!list.more && !list.extra.error) return null;
  return (
    <div className="me-more">
      <button type="button" className="dc-btn dc-btn--ghost" onClick={list.loadMore} disabled={list.extra.busy}>
        {list.extra.busy ? "Loading…" : list.extra.error ? "Couldn't load — try again" : label}
      </button>
    </div>
  );
}

/** A tab that knows it is the page being read. */
function Tab({ href, children }) {
  const current = usePathname() === href;
  return (
    <Link href={href} className={current ? "active" : undefined} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}

function MeTabs() {
  return (
    <nav className="me-tabs" aria-label="Your things">
      <Tab href="/me/tickets">
        <Icon name="ticket" size={16} />
        My tickets
      </Tab>
      <Tab href="/me/following">
        <Icon name="users" size={16} />
        Following
      </Tab>
    </nav>
  );
}

/** Signed out: what this page is, and the way in. */
function SignInPrompt({ icon, title, text, reason }) {
  const auth = useAuth();
  return (
    <div className="me-prompt">
      <span className="me-prompt-icon" aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="me-prompt-actions">
        <button type="button" className="dc-btn" onClick={() => auth.openSignIn({ reason })}>
          Sign in
        </button>
        <Link className="dc-btn dc-btn--ghost" href="/events">
          Find events
        </Link>
      </div>
    </div>
  );
}

/** A build without sign-in: these live in the app. */
function InTheApp({ icon, title, text }) {
  return (
    <div className="me-prompt">
      <span className="me-prompt-icon" aria-hidden="true">
        <Icon name={icon} size={26} />
      </span>
      <h1>{title}</h1>
      <p>{text}</p>
      <div className="me-prompt-actions">
        <StoreButtons />
      </div>
    </div>
  );
}

/** Before the browser has read who is signed in (the server's paint, and the first in the browser). */
function Reading({ label }) {
  return (
    <div className="me-tickets" role="status" aria-label={label}>
      {[0, 1].map((i) => (
        <span key={i} className="dc-skel me-skel" />
      ))}
    </div>
  );
}

/* ---------- /me/tickets ---------- */

/** The poster, small and whole (76px at most: styles/account.css). */
function Thumb({ event }) {
  return (
    <span className="me-thumb">
      <PosterImg src={imageUrl(event.poster, sizeFor("poster", 76))} alt="" fallback={<EventCover event={event} />} small />
    </span>
  );
}

/**
 * One ticket: the event (a link to its page) on the left, the stub with the
 * code and the ticket's own page on the right. A registration waiting for
 * payment is paid right here (Finish payment); on a server that can't say
 * which registration it is, the event's form takes over, as it always did.
 */
function TicketRow({ item, past, onPaid, state = null }) {
  const router = useRouter();
  const e = item.event;
  const when = whenLine(e.starts_at);
  const where = e.is_online ? "Online" : e.location_name || "Venue to be announced";
  const ticketPath = `/tickets/${encodeURIComponent(item.ticket_id)}`;
  // Called off by the club (docs: club_ops): said on the row, with the refund for a ticket that was paid for.
  const cancelled = state?.status === "cancelled";
  return (
    <li className={`me-ticket${past ? " is-past" : ""}${cancelled ? " is-cancelled" : ""}`}>
      <div className="me-ticket-main">
        <Thumb event={e} />
        <div className="me-ticket-info">
          {when ? (
            <p className="me-ticket-when">
              <time dateTime={e.starts_at}>{when}</time>
            </p>
          ) : null}
          <h3 className="me-ticket-name">
            <Link href={eventPath(e)}>{e.name}</Link>
          </h3>
          <p className="me-ticket-meta">
            {e.club?.name ? <span>by {e.club.name}</span> : null}
            <span>
              <Icon name={e.is_online ? "monitor" : "pin"} size={14} />
              {where}
            </span>
            {past && item.attended ? (
              <span className="me-pill me-pill--yes">
                <Icon name="check" size={12} />
                Attended
              </span>
            ) : null}
            {cancelled ? <span className="me-pill me-pill--cancelled">Cancelled</span> : null}
            {item.awaitingPayment && !cancelled ? (
              <span className="me-pill">{past ? "Payment not completed" : "Awaiting payment"}</span>
            ) : null}
            {item.ticketType ? <span className="me-ticket-type">{item.ticketType}</span> : null}
          </p>
          {cancelled ? (
            <CancelledNote
              compact
              cancellation={state.cancellation}
              paid={e.has_fee && !item.awaitingPayment}
              className="me-cancelled"
            />
          ) : null}
        </div>
      </div>
      <div className="me-ticket-stub">
        <div className="me-ticket-code">
          <p className="me-ticket-kicker">Ticket</p>
          <p className="me-ticket-number">{item.ticket_id}</p>
        </div>
        <div className="me-ticket-actions">
          {item.awaitingPayment ? (
            past || cancelled ? (
              cancelled ? <span className="me-nothing">Nothing to pay</span> : null
            ) : (
              <FinishPaymentButton
                eventId={e.id}
                className="dc-btn dc-btn--sm"
                label={`Finish payment for ${e.name}`}
                onPaid={() => onPaid(e)}
                onOldServer={() => router.push(eventPath(e, "register"))}
              />
            )
          ) : (
            <Link className="dc-btn dc-btn--sm" href={ticketPath} aria-label={`View ticket for ${e.name}`}>
              View ticket
            </Link>
          )}
          {item.certificate ? (
            <Link className="me-cert" href={`/certificates/${encodeURIComponent(item.ticket_id)}`} aria-label={`Certificate for ${e.name}`}>
              <Icon name="award" size={15} />
              Certificate
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/* ---------- registrations under review ---------- */

/**
 * One registration for an event that reviews registrations: the event, and
 * where it stands. Under review: its page (and cancelling it there).
 * Confirmed and not yet paid: pay on the claim page, or its page.
 */
function RequestRow({ request }) {
  const e = request.event;
  const when = whenLine(e.starts_at);
  const page = requestPath(request.token);
  const pay = request.status === "approved" ? request.pay : null;
  const payLabel = pay ? payButton(pay) : null;
  const club = clubName(e.club);
  return (
    <li className="me-ticket me-request">
      <div className="me-ticket-main">
        <Thumb event={e} />
        <div className="me-ticket-info">
          {when ? (
            <p className="me-ticket-when">
              <time dateTime={e.starts_at}>{when}</time>
            </p>
          ) : null}
          <h3 className="me-ticket-name">
            {e.slug || e.id ? <Link href={eventPath(e)}>{e.name}</Link> : e.name}
          </h3>
          <p className="me-ticket-meta">
            {e.club?.name ? <span>by {e.club.name}</span> : null}
            <span className={`me-pill${pay ? " me-pill--yes" : ""}`}>{statusWord(request)}</span>
            {request.ticketType ? <span className="me-ticket-type">{request.ticketType.name}</span> : null}
          </p>
          <p className="me-request-line">
            {request.status === "approved"
              ? pay
                ? `${club} confirmed your registration.${pay.payBy ? " Your ticket is held for you until then." : ""}`
                : `${club} confirmed your registration: your ticket is on its way by email.`
              : underReviewNote(e.club)}
          </p>
        </div>
      </div>
      <div className="me-ticket-stub">
        <div className="me-ticket-code">
          <p className="me-ticket-kicker">Registration</p>
          <p className="me-ticket-number me-request-state">{request.status === "approved" ? (pay ? "To pay" : "Confirmed") : "Under review"}</p>
        </div>
        <div className="me-ticket-actions">
          {pay ? (
            <Link className="dc-btn dc-btn--sm" href={`/claim/${encodeURIComponent(pay.claimToken)}`} aria-label={`${payLabel} for ${e.name}`}>
              {payLabel}
            </Link>
          ) : null}
          {page ? (
            <Link className={pay ? "me-cert" : "dc-btn dc-btn--sm"} href={page} aria-label={`See your registration for ${e.name}`}>
              See your registration
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * "Under review": the reader's registrations still open (under review, or
 * confirmed and not yet paid), from GET /registration-requests/mine, sent
 * with the account's token or, signed out, the guest token a registration
 * left. Nothing at all while it loads, when there are none, from a server
 * without requests (404) or when it fails: the tickets are this page's job.
 */
function WaitingRequests({ who }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    setItems(null);
    Promise.resolve()
      .then(() => requestsApi.mine())
      .then(
        (list) => alive && setItems(list ? openRequests(list) : []),
        () => alive && setItems([]),
      );
    return () => {
      alive = false;
    };
  }, [who]);
  if (!items || !items.length) return null;
  return (
    <section className="me-section me-requests" aria-labelledby="me-waiting">
      <h2 className="me-section-title" id="me-waiting">
        Under review <small>{items.length}</small>
      </h2>
      <ul className="me-tickets">
        {items.map((r, i) => (
          <RequestRow key={r.id || r.token || i} request={r} />
        ))}
      </ul>
    </section>
  );
}

/** Signed out, with a guest's token from a registration here: that guest's requests (read once the page is up). */
function GuestRequests() {
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    setGuest(Boolean(guestToken()));
  }, []);
  return guest ? <WaitingRequests who="guest" /> : null;
}

function TicketsSkeleton() {
  return <Reading label="Loading your tickets" />;
}

function Tickets({ email }) {
  const upcoming = useAccountList((offset) => accountApi.myEvents({ ended: false, offset, limit: TICKETS_PAGE }), TICKETS_PAGE, email);
  const past = useAccountList((offset) => accountApi.myEvents({ ended: true, offset, limit: TICKETS_PAGE }), TICKETS_PAGE, email);
  const [paid, setPaid] = useState(null);
  // Whether an upcoming event was cancelled: the list doesn't say, each event's page does (the first page's worth).
  const unsaid = upcoming.items.filter((t) => !ownState(t.event)).slice(0, TICKETS_PAGE);
  const states = useEventStates(unsaid.map((t) => t.event.slug));
  const stateOf = (t) => ownState(t.event) || (t.event.slug ? states[t.event.slug] : null) || null;

  // Paid from a row: say so, and read the lists again (the row becomes a ticket).
  const onPaid = (event) => {
    setPaid(event.name);
    upcoming.retry();
    past.retry();
  };

  let body;
  if (upcoming.status === "error" || past.status === "error") {
    body = (
      <ErrorState
        message="We couldn't load your tickets just now. Check your connection and try again."
        onRetry={() => {
          if (upcoming.status === "error") upcoming.retry();
          if (past.status === "error") past.retry();
        }}
      />
    );
  } else if (upcoming.status === "loading" || past.status === "loading") {
    body = <TicketsSkeleton />;
  } else if (!upcoming.items.length && !past.items.length) {
    body = (
      <EmptyState title="No tickets yet" message="When you register for an event — here or in the app — your ticket shows up here.">
        <Link className="dc-btn" href="/events">
          Find events
        </Link>
        <Link className="dc-btn dc-btn--ghost" href="/clubs">
          Browse clubs
        </Link>
      </EmptyState>
    );
  } else {
    body = (
      <>
        <section className="me-section" aria-labelledby="me-upcoming">
          <h2 className="me-section-title" id="me-upcoming">
            Upcoming {upcoming.items.length ? <small>{upcoming.more ? `${upcoming.items.length}+` : upcoming.items.length}</small> : null}
          </h2>
          {upcoming.items.length ? (
            <>
              <ul className="me-tickets">
                {upcoming.items.map((t) => (
                  <TicketRow key={t.ticket_id} item={t} onPaid={onPaid} state={stateOf(t)} />
                ))}
              </ul>
              <ShowMore list={upcoming} label="Show more" />
            </>
          ) : (
            <p className="dc-section-sub">
              Nothing coming up.{" "}
              <Link className="dc-link" href="/events">
                Find your next event
              </Link>
            </p>
          )}
        </section>
        {past.items.length ? (
          <section className="me-section" aria-labelledby="me-past">
            <h2 className="me-section-title" id="me-past">
              Past <small>{past.more ? `${past.items.length}+` : past.items.length}</small>
            </h2>
            <ul className="me-tickets">
              {past.items.map((t) => (
                <TicketRow key={t.ticket_id} item={t} past onPaid={onPaid} state={ownState(t.event)} />
              ))}
            </ul>
            <ShowMore list={past} label="Show older" />
          </section>
        ) : null}
      </>
    );
  }
  return (
    <>
      {paid ? (
        <p className="me-notice" role="status">
          <Icon name="check" size={16} />
          Payment received — your ticket for {paid} is ready.
        </p>
      ) : null}
      <WaitingRequests who={email} />
      {body}
    </>
  );
}

export function MyTicketsPage() {
  const auth = useAuth();
  let content;
  if (!auth.enabled) {
    content = (
      <>
        <InTheApp icon="ticket" title="Your tickets are in the app" text="Every ticket you get is in the MyOtherApp app, and in your email." />
        <GuestRequests />
      </>
    );
  } else if (!auth.ready) {
    content = <Reading label="Loading your tickets" />;
  } else if (auth.status !== "signed-in") {
    content = (
      <>
        <SignInPrompt
          icon="ticket"
          reason="tickets"
          title="Your tickets, in one place"
          text="Sign in with the Google account or email you use in the MyOtherApp app to see every ticket — the ones from here and from the app."
        />
        <GuestRequests />
      </>
    );
  } else {
    content = (
      <>
        <header className="me-head">
          <h1>My tickets</h1>
          {auth.user?.email ? (
            <p>
              Signed in as <strong>{auth.user.email}</strong>
            </p>
          ) : null}
        </header>
        <VerifyBanner />
        <MeTabs />
        {/* Verifying brings in what was booked here as a guest: the list loads again when it does. */}
        <Tickets email={`${auth.user?.email || ""}${auth.user?.emailVerified === false ? ":unverified" : ""}`} />
      </>
    );
  }
  return (
    <SitePage>
      <div className="dc-wrap dc-wrap--narrow me">{content}</div>
    </SitePage>
  );
}

/* ---------- /me/following ---------- */

function FollowedClubs({ email }) {
  const clubs = useAccountList((offset) => accountApi.following({ offset, limit: CLUBS_PAGE }), CLUBS_PAGE, email);
  if (clubs.status === "error") {
    return <ErrorState message="We couldn't load the clubs you follow just now. Check your connection and try again." onRetry={clubs.retry} />;
  }
  if (clubs.status === "loading") {
    return (
      <div className="dc-grid dc-grid--4 me-section" role="status" aria-label="Loading the clubs you follow">
        {[0, 1, 2, 3].map((i) => (
          <ClubCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (!clubs.items.length) {
    return (
      <EmptyState title="You're not following any clubs yet" message="Follow a club to hear the moment it announces an event or posts something new.">
        <Link className="dc-btn" href="/clubs">
          Browse clubs
        </Link>
      </EmptyState>
    );
  }
  return (
    <>
      <div className="dc-grid dc-grid--4 me-section">
        {clubs.items.map((c) => (
          <ClubCard key={c.id ?? c.slug} club={c} headingLevel={2} />
        ))}
      </div>
      <ShowMore list={clubs} label="Show more" />
    </>
  );
}

export function FollowingPage() {
  const auth = useAuth();
  let content;
  if (!auth.enabled) {
    content = <InTheApp icon="users" title="Follow clubs in the app" text="Follow clubs in the MyOtherApp app to hear the moment they announce an event." />;
  } else if (!auth.ready) {
    content = <Reading label="Loading the clubs you follow" />;
  } else if (auth.status !== "signed-in") {
    content = (
      <SignInPrompt
        icon="users"
        reason="follow"
        title="The clubs you follow"
        text="Sign in with the Google account or email you use in the MyOtherApp app to see the clubs you follow, and follow more from here."
      />
    );
  } else {
    content = (
      <>
        <header className="me-head">
          <h1>Following</h1>
          <p>Clubs you follow, here and in the MyOtherApp app.</p>
        </header>
        <MeTabs />
        <FollowedClubs email={auth.user?.email || ""} />
      </>
    );
  }
  return (
    <SitePage>
      <div className="dc-wrap me">{content}</div>
    </SitePage>
  );
}
