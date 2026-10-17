import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { accountApi } from "@/api/account";
import { discoverApi } from "@/api/discover";
import { useAuth } from "@/auth/context";
import { currentRef } from "@/utils/ref";
import { countVisit } from "@/utils/visit";
import { usePageMeta } from "@/utils/meta";
import { formatCount, imageUrl } from "@/utils/format";
import { faceLook, initials } from "@/utils/cover";
import { SitePage } from "./chrome";
import { AppPrompt, Avatar, EmptyState, ErrorState, Img, Section } from "./bits";
import { ClubCover } from "./cover";
import { EventCard } from "./eventcard";
import { LoadMore } from "./finder";
import { ThreadCard } from "./threadcard";
import Icon from "./icons";
import "@/styles/cards-hero.css";

const SOCIALS = [
  ["instagram", "Instagram", "instagram"],
  ["linkedin", "LinkedIn", "linkedin"],
  ["youtube", "YouTube", "youtube"],
  ["x", "X", "x"],
  ["website", "Website", "globe"],
];

const hostOf = (url) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Only http(s) links leave this site; anything else a club typed is shown as text, not followed. */
const safeUrl = (url) => {
  if (!url) return null;
  const withScheme = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};

function ClubSkeleton() {
  return (
    <div className="dc-wrap" aria-busy="true" role="status" aria-label="Loading the club">
      <div className="dc-club-cover dc-skel" />
      <div className="dc-club-id">
        <span className="dc-skel dc-avatar" style={{ width: 104, height: 104, borderRadius: 999 }} />
        <div className="dc-club-headrow">
          <div className="dc-club-titles">
            <div className="dc-skel" style={{ width: "50%", height: 44 }} />
            <div className="dc-skel dc-skel-line" style={{ width: "70%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const PERSON_LINKS = [
  ["instagram", "Instagram", "instagram"],
  ["linkedin", "LinkedIn", "linkedin"],
  ["x", "X", "x"],
  ["website", "Website", "globe"],
];

/** A face for a person: their photo, or their initials on a colour that is always theirs. */
function Face({ name, photo }) {
  const look = faceLook(name);
  const fallback = (
    <span className="dc-member-initials" style={{ background: look.palette.bg, color: look.palette.ink }} aria-hidden="true">
      {initials(name)}
    </span>
  );
  return (
    <span className="dc-member-face">
      <Img src={imageUrl(photo, "medium")} alt="" fallback={fallback} />
    </span>
  );
}

/** One of the people behind the club, with only the links they gave that are safe to follow. */
function Member({ person }) {
  const links = PERSON_LINKS.map(([k, label, icon]) => [k, label, icon, safeUrl(person.links[k])]).filter(([, , , url]) => url);
  return (
    <li className="dc-member">
      <Face name={person.name} photo={person.photo} />
      <span className="dc-member-name">{person.name}</span>
      {person.role ? <span className="dc-member-role">{person.role}</span> : null}
      {links.length ? (
        <span className="dc-member-links">
          {links.map(([k, label, icon, url]) => (
            <a key={k} href={url} target="_blank" rel="noopener noreferrer" aria-label={`${person.name} on ${label}`} title={label}>
              <Icon name={icon} size={16} />
            </a>
          ))}
        </span>
      ) : null}
    </li>
  );
}

/** A partner on the logo wall: the logo large, the name and what they do for the club below. */
function Partner({ partner }) {
  return (
    <li className="dc-ptile">
      <span className="dc-ptile-logo">
        <Img
          src={imageUrl(partner.logo, "medium")}
          alt=""
          fallback={
            <span className="dc-ptile-initials" aria-hidden="true">
              {initials(partner.name)}
            </span>
          }
        />
      </span>
      <span className="dc-ptile-name">{partner.name}</span>
      {partner.role ? <span className="dc-ptile-role">{partner.role}</span> : null}
    </li>
  );
}

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
 * A list of the club's events that grows with "Show more", and says how
 * far along it is ("Showing 12 of 37"). `children` draws the events.
 */
function MoreEvents({ slug, when, initial, known, noun, children }) {
  const list = useMoreEvents(slug, when, initial, known);
  return (
    <>
      {children(list.items)}
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

function FollowButton({ follow, ghost = false }) {
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

/**
 * A club's page: who they are, what's coming up, what they've been posting,
 * what they've run, the people behind it and who backs them. Signed in,
 * Follow follows here; signed out, following happens in the app (or after
 * signing in). The website button goes to the club's own site.
 */
export default function ClubPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [prompt, setPrompt] = useState(false);
  const counted = useRef(null);
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", data: null });
    discoverApi.club(slug).then(
      (data) => {
        if (!alive) return;
        setState({ status: "ready", data });
        // One visit per page load, for the club's analytics, with the link it came by.
        if (counted.current !== slug) {
          counted.current = slug;
          countVisit(slug, params);
        }
      },
      (e) => alive && setState({ status: e?.notFound ? "missing" : "error", data: null })
    );
    return () => {
      alive = false;
    };
    // The visit is counted once per page, not again when the query changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt]);

  const data = state.data;
  const club = data?.club;
  const follow = useClubFollow(club?.id ?? null, signedIn);

  usePageMeta(
    club ? `${club.name} · MyOtherApp` : state.status === "missing" ? "Club not found · MyOtherApp" : null,
    club ? club.tagline || (club.about ? club.about.slice(0, 155) : `Events and posts from ${club.name} on MyOtherApp.`) : null
  );

  const signInToFollow = () => {
    setPrompt(false);
    auth.openSignIn({ reason: "follow", onDone: () => follow.set(true) });
  };

  const followHint =
    params.get("follow") && !signedIn ? (
      <div className="dc-banner" role="status">
        <strong>Follow</strong>
        {auth.enabled ? (
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
    ) : null;

  if (state.status === "loading") {
    return (
      <SitePage>
        <ClubSkeleton />
      </SitePage>
    );
  }
  if (state.status === "missing") {
    return (
      <SitePage>
        <div className="dc-wrap">
          <div className="dc-section">
            <EmptyState as="h1" title="We couldn't find that club" message="The link may be old, or the club may have changed its address.">
              <Link className="dc-btn" to="/clubs">
                Browse clubs
              </Link>
              <Link className="dc-btn dc-btn--ghost" to="/events">
                Find events
              </Link>
            </EmptyState>
          </div>
        </div>
      </SitePage>
    );
  }
  if (state.status === "error") {
    return (
      <SitePage>
        <div className="dc-wrap">
          <div className="dc-section">
            <ErrorState message="We couldn't load this club right now. Check your connection and try again." onRetry={() => setAttempt((a) => a + 1)} />
          </div>
        </div>
      </SitePage>
    );
  }

  const followers = Math.max(0, club.followers + follow.delta);
  const website = safeUrl(club.website_url);
  const socials = SOCIALS.map(([k, label, icon]) => [k, label, icon, safeUrl(club.socials[k] || (k === "website" ? club.website_url : null))]).filter(
    ([, , , url]) => url
  );
  const hasAbout = Boolean(club.about || club.contact_email || socials.length);
  const threads = data.threads.slice(0, 5);
  const tabs = [
    ["upcoming", "Upcoming", data.upcoming.length],
    hasAbout && ["about", "About"],
    threads.length && ["threads", "Threads", data.threads.length],
    data.past.length && ["past", "Past events", Math.max(club.events_held || 0, data.past.length)],
    data.team.length && ["team", "Team", data.team.length],
    data.partners.length && ["partners", "Partners", data.partners.length],
  ].filter(Boolean);

  return (
    <SitePage>
      <div className="dc-wrap">
        <div className="dc-club-cover">
          <Img src={imageUrl(club.cover, "original")} alt="" fallback={<ClubCover club={club} w={240} h={80} />} />
        </div>
        <div className="dc-club-id">
          <Avatar name={club.name} src={club.logo} size={104} alt={`${club.name} logo`} />
          <div className="dc-club-headrow">
            <div className="dc-club-titles">
              <h1>{club.name}</h1>
              {club.tagline ? <p className="dc-club-tagline">{club.tagline}</p> : null}
              <p className="dc-club-meta">
                {club.location_name ? (
                  <span>
                    <Icon name="pin" size={14} /> {club.location_name}
                  </span>
                ) : null}
                <span>
                  <Icon name="users" size={14} /> <strong>{formatCount(followers)}</strong> {followers === 1 ? "follower" : "followers"}
                </span>
                {club.events_held !== null ? (
                  <span>
                    <Icon name="calendar" size={14} /> <strong>{formatCount(club.events_held)}</strong> {club.events_held === 1 ? "event held" : "events held"}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="dc-club-actions">
              {signedIn ? (
                <FollowButton follow={follow} />
              ) : (
                <button type="button" className="dc-btn" onClick={() => setPrompt(true)}>
                  Follow in the app
                </button>
              )}
              {website ? (
                <a className="dc-btn dc-btn--ghost" href={website} target="_blank" rel="noopener noreferrer">
                  Visit website <Icon name="external" size={16} />
                </a>
              ) : null}
              {follow.error ? (
                <p className="ac-follow-err" role="status">
                  {follow.error}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {followHint}

        <nav className="dc-tabs" aria-label={`${club.name} sections`}>
          {tabs.map(([id, label, n]) => (
            <a key={id} href={`#${id}`}>
              {label}
              {n ? <small>{formatCount(n)}</small> : null}
            </a>
          ))}
        </nav>

        <Section id="upcoming" title="Upcoming events" className="dc-club-section">
          {data.upcoming.length ? (
            <MoreEvents slug={slug} when="upcoming" initial={data.upcoming} known={Math.max(club.upcoming_events, data.upcoming.length)} noun="upcoming events">
              {(items) => (
                <div className="dc-rail dc-rail--cards">
                  {items.map((e) => (
                    <EventCard key={e.id} event={e} showClub={false} />
                  ))}
                </div>
              )}
            </MoreEvents>
          ) : (
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
                  <FollowButton follow={follow} ghost />
                )
              ) : (
                <button type="button" className="dc-btn dc-btn--ghost" onClick={() => setPrompt(true)}>
                  Follow in the app
                </button>
              )}
            </EmptyState>
          )}
        </Section>

        {hasAbout ? (
          <Section id="about" title="About" className="dc-club-section">
            <div className="dc-about">
              <div className="dc-about-text">{club.about || `${club.name} is on MyOtherApp.`}</div>
              {club.contact_email || socials.length ? (
                <aside className="dc-about-side" aria-label="Contact and links">
                  {club.contact_email ? (
                    <>
                      <h3>Contact</h3>
                      <div className="dc-sociallist">
                        <a href={`mailto:${club.contact_email}`}>
                          <Icon name="mail" size={16} /> {club.contact_email}
                        </a>
                      </div>
                    </>
                  ) : null}
                  {socials.length ? (
                    <>
                      <h3>Find them on</h3>
                      <div className="dc-sociallist">
                        {socials.map(([k, label, icon, url]) => (
                          <a key={k} href={url} target="_blank" rel="noopener noreferrer">
                            <Icon name={icon} size={16} /> {k === "website" ? hostOf(url) : label}
                          </a>
                        ))}
                      </div>
                    </>
                  ) : null}
                </aside>
              ) : null}
            </div>
          </Section>
        ) : null}

        {threads.length ? (
          <Section id="threads" title="Threads" sub={`The latest from ${club.name}`} className="dc-club-section">
            <div className="dc-threads dc-threads--cols">
              {threads.map((t) => (
                <ThreadCard key={t.id} thread={t} />
              ))}
            </div>
          </Section>
        ) : null}

        {data.past.length ? (
          <Section id="past" title="Past events" className="dc-club-section">
            <MoreEvents slug={slug} when="past" initial={data.past} known={club.events_held} noun="past events">
              {(items) => (
                <div className="dc-rowlist">
                  {items.map((e) => (
                    <EventCard key={e.id} event={e} variant="row" />
                  ))}
                </div>
              )}
            </MoreEvents>
          </Section>
        ) : null}

        {data.team.length ? (
          <Section id="team" title="Team" sub={`The people behind ${club.name}`} className="dc-club-section">
            <ul className="dc-crew">
              {data.team.map((p, i) => (
                <Member key={`${p.name}-${i}`} person={p} />
              ))}
            </ul>
          </Section>
        ) : null}

        {data.partners.length ? (
          <Section id="partners" title="Partners" sub={`Who backs ${club.name}`} className="dc-club-section">
            <ul className="dc-pwall">
              {data.partners.map((p, i) => (
                <Partner key={`${p.name}-${i}`} partner={p} />
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

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
    </SitePage>
  );
}
