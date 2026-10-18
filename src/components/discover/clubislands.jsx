"use client";

/**
 * The club page's client islands. The page itself is server-rendered
 * (clubpage.jsx); these are the parts that depend on who is reading:
 * following (the button, the count, the empty list's offer, the app
 * prompt), the ?follow= hint, counting the visit, and "Show more".
 *
 * <ClubFollow> holds the follow state for the whole page; the islands
 * inside it read it. Each takes only plain data from the server.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { accountApi } from "@/api/account";
import { discoverApi } from "@/api/discover";
import { useAuth } from "@/auth/context";
import { useSearchParams } from "@/lib/router";
import { formatCount } from "@/utils/format";
import { currentRef } from "@/utils/ref";
import { countVisit } from "@/utils/visit";
import { EmptyState } from "./bits";
import { AppPrompt } from "./dialog";
import { EventCard } from "./eventcard";
import { LoadMore } from "./finder";
import Icon from "./icons";

/* ---------- following ---------- */

/**
 * Following a club as the signed-in person. The button flips the moment it
 * is pressed (and the count with it), and flips back if the server says no.
 * "Already following" and "not following" from the server are the state the
 * person asked for, not errors.
 */
function useClubFollow(clubId, signedIn) {
  const [s, setS] = useState({ known: false, on: false, busy: false, error: null, delta: 0 });
  const acted = useRef(false);

  useEffect(() => {
    acted.current = false;
    setS({ known: false, on: false, busy: false, error: null, delta: 0 });
    if (!signedIn || clubId === null || clubId === undefined) return undefined;
    let alive = true;
    accountApi.isFollowing(clubId).then(
      (on) => alive && !acted.current && setS((x) => ({ ...x, known: true, on })),
      () => alive && !acted.current && setS((x) => ({ ...x, known: true }))
    );
    return () => {
      alive = false;
    };
  }, [clubId, signedIn]);

  const set = useCallback(
    (want) => {
      if (clubId === null || clubId === undefined) return;
      acted.current = true;
      const step = want ? 1 : -1;
      setS((x) => ({ ...x, known: true, on: want, busy: true, error: null, delta: x.delta + step }));
      (want ? accountApi.follow(clubId, currentRef()) : accountApi.unfollow(clubId)).then(
        (changed) => setS((x) => ({ ...x, busy: false, delta: changed ? x.delta : x.delta - step })),
        () =>
          setS((x) => ({
            ...x,
            on: !want,
            busy: false,
            delta: x.delta - step,
            error: want ? "Couldn't follow just now. Try again." : "Couldn't unfollow just now. Try again.",
          }))
      );
    },
    [clubId]
  );

  return { ...s, set };
}

const FollowContext = createContext(null);
const useFollow = () => useContext(FollowContext);

/**
 * The follow state for one club's page, and its "Follow in the app" prompt.
 * Signed in, Follow follows here; signed out, following happens in the app
 * (or after signing in).
 */
export function ClubFollow({ club, children }) {
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";
  const follow = useClubFollow(club.id ?? null, signedIn);
  const [prompt, setPrompt] = useState(false);
  const signInToFollow = useCallback(() => {
    setPrompt(false);
    auth.openSignIn({ reason: "follow", onDone: () => follow.set(true) });
    // follow.set is stable for the club; auth.openSignIn for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.openSignIn, follow.set]);
  const value = { club, follow, signedIn, enabled: auth.enabled, openPrompt: () => setPrompt(true), signInToFollow };
  return (
    <FollowContext.Provider value={value}>
      {children}
      <AppPrompt
        open={prompt}
        onClose={() => setPrompt(false)}
        title={`Follow ${club.name}`}
        message={`Following happens in the MyOtherApp app — open ${club.name} there and tap Follow to hear about every new event and post.`}
        alt={
          auth.enabled ? (
            <button type="button" className="dc-btn dc-btn--ghost" onClick={signInToFollow}>
              Sign in to follow here
            </button>
          ) : null
        }
      />
    </FollowContext.Provider>
  );
}

function FollowButton({ ghost = false }) {
  const { follow } = useFollow();
  return (
    <button
      type="button"
      className={`dc-btn ac-follow${follow.on ? " is-on" : ghost ? " dc-btn--ghost" : ""}`}
      aria-pressed={follow.on}
      aria-busy={follow.busy || undefined}
      onClick={() => {
        if (!follow.busy) follow.set(!follow.on);
      }}
    >
      <Icon name={follow.on ? "check" : "plus"} size={18} />
      {follow.on ? "Following" : "Follow"}
    </button>
  );
}

/** "1.2k followers", moving with the reader's own follow. */
export function FollowerCount({ followers }) {
  const { follow } = useFollow();
  const n = Math.max(0, followers + follow.delta);
  return (
    <span>
      <Icon name="users" size={14} /> <strong>{formatCount(n)}</strong> {n === 1 ? "follower" : "followers"}
    </span>
  );
}

/** The header's buttons: Follow (or Follow in the app), then whatever the page puts after it (the website). */
export function ClubActions({ children }) {
  const { follow, signedIn, openPrompt } = useFollow();
  return (
    <div className="dc-club-actions">
      {signedIn ? (
        <FollowButton />
      ) : (
        <button type="button" className="dc-btn" onClick={openPrompt}>
          Follow in the app
        </button>
      )}
      {children}
      {follow.error ? (
        <p className="ac-follow-err" role="status">
          {follow.error}
        </p>
      ) : null}
    </div>
  );
}

/** Arriving with ?follow= (from the app's or a club's link) while signed out: how following works here. */
export function FollowHint() {
  const [params] = useSearchParams();
  const { signedIn, enabled, signInToFollow } = useFollow();
  if (!params.get("follow") || signedIn) return null;
  return (
    <div className="dc-banner" role="status">
      <strong>Follow</strong>
      {enabled ? (
        <span>
          Following happens in the MyOtherApp app — open the club there and tap Follow, or{" "}
          <button type="button" className="ac-linkbtn" onClick={signInToFollow}>
            sign in to follow here
          </button>
          .
        </span>
      ) : (
        <span>Following happens in the MyOtherApp app — open the club there and tap Follow.</span>
      )}
    </div>
  );
}

/** Nothing coming up: say so, and offer to follow (here, or in the app). */
export function UpcomingEmpty() {
  const { club, follow, signedIn, openPrompt } = useFollow();
  return (
    <EmptyState
      as="h3"
      title="Nothing scheduled yet"
      message={
        signedIn
          ? follow.on
            ? `You follow ${club.name}: you'll hear the moment they announce their next event.`
            : `Follow ${club.name} to hear the moment they announce their next event.`
          : `Follow ${club.name} in the app to hear the moment they announce their next event.`
      }
    >
      {signedIn ? (
        follow.on ? null : (
          <FollowButton ghost />
        )
      ) : (
        <button type="button" className="dc-btn dc-btn--ghost" onClick={openPrompt}>
          Follow in the app
        </button>
      )}
    </EmptyState>
  );
}

/* ---------- the visit ---------- */

/** One visit per page load, for the club's analytics, with the link it came by (?ref=, ?via=). Draws nothing. */
export function VisitCounter({ slug }) {
  const [params] = useSearchParams();
  const counted = useRef(null);
  useEffect(() => {
    if (counted.current === slug) return;
    counted.current = slug;
    countVisit(slug, params);
    // Once per page, not again when the query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  return null;
}

/* ---------- more events ---------- */

/** How many a club's page carries of its past events; more come a page at a time. */
const PAST_ON_PAGE = 6;
const MORE_PAGE = 12;

/**
 * A club's past or upcoming events beyond the few its page carries. "Show
 * more" asks for the next twelve and adds them to the end; `known` is the
 * full count when the page says it (null: unknown). Where the API has no
 * such list, `gone` turns true and "Show more" goes away for good.
 */
function useMoreEvents(slug, when, initial, known) {
  const [s, setS] = useState({ items: initial, total: known, busy: false, error: false, gone: false });
  const count = useRef(initial.length);

  const loadMore = () => {
    setS((x) => ({ ...x, busy: true, error: false }));
    discoverApi.clubEvents(slug, { when, offset: count.current, limit: MORE_PAGE }).then(
      (page) => {
        count.current += page.items.length;
        setS((x) => {
          const seen = new Set(x.items.map((e) => e.id));
          const items = [...x.items, ...page.items.filter((e) => !seen.has(e.id))];
          // An empty page is the end, whatever the count said.
          return { ...x, items, busy: false, total: page.items.length ? Math.max(page.total, items.length) : items.length };
        });
      },
      (e) => setS((x) => ({ ...x, busy: false, error: !e?.notFound, gone: Boolean(e?.notFound) }))
    );
  };

  // Without a count, a full first page suggests there are more; the first answer brings the real count.
  const more = !s.gone && (s.total === null ? s.items.length >= PAST_ON_PAGE : s.items.length < s.total);
  const grown = s.items.length > initial.length;
  return { ...s, more, grown, loadMore };
}

/**
 * A list of the club's events that grows with "Show more", and says how far
 * along it is ("Showing 12 of 37"). Upcoming events are a rail of cards
 * (without the club's own name), past ones compact rows.
 */
export function MoreEvents({ slug, when, initial, known, noun }) {
  const list = useMoreEvents(slug, when, initial, known);
  const rows = when === "past";
  return (
    <>
      {rows ? (
        <div className="dc-rowlist">
          {list.items.map((e) => (
            <EventCard key={e.id} event={e} variant="row" />
          ))}
        </div>
      ) : (
        <div className="dc-rail dc-rail--cards">
          {list.items.map((e) => (
            <EventCard key={e.id} event={e} showClub={false} />
          ))}
        </div>
      )}
      {list.more || (list.grown && !list.gone) ? (
        <LoadMore
          className="dc-more--tight"
          shown={list.items.length}
          total={list.more ? list.total : list.items.length}
          busy={list.busy}
          error={list.error}
          onMore={list.loadMore}
          noun={noun}
          label="Show more"
        />
      ) : null}
    </>
  );
}
