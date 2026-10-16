import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { discoverApi } from "@/api/discover";
import { countVisit } from "@/utils/visit";
import { usePageMeta } from "@/utils/meta";
import { formatCount, imageUrl } from "@/utils/format";
import { faceLook, initials } from "@/utils/cover";
import { SitePage } from "./chrome";
import { AppPrompt, Avatar, EmptyState, ErrorState, Img, Section } from "./bits";
import { ClubCover } from "./cover";
import { EventCard } from "./eventcard";
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

/**
 * A club's page: who they are, what's coming up, what they've been posting,
 * what they've run, the people behind it and who backs them. Following
 * happens in the app; the website button goes to the club's own site.
 */
export default function ClubPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);
  const [prompt, setPrompt] = useState(false);
  const counted = useRef(null);

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
  usePageMeta(
    club ? `${club.name} · MyOtherApp` : state.status === "missing" ? "Club not found · MyOtherApp" : null,
    club ? club.tagline || (club.about ? club.about.slice(0, 155) : `Events and posts from ${club.name} on MyOtherApp.`) : null
  );

  const followHint = params.get("follow") ? (
    <div className="dc-banner" role="status">
      <strong>Follow</strong>
      <span>Following happens in the MyOtherApp app — open the club there and tap Follow.</span>
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
    data.past.length && ["past", "Past events", data.past.length],
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
                  <Icon name="users" size={14} /> <strong>{formatCount(club.followers)}</strong> {club.followers === 1 ? "follower" : "followers"}
                </span>
                {club.events_held !== null ? (
                  <span>
                    <Icon name="calendar" size={14} /> <strong>{formatCount(club.events_held)}</strong> {club.events_held === 1 ? "event held" : "events held"}
                  </span>
                ) : null}
              </p>
            </div>
            <div className="dc-club-actions">
              <button type="button" className="dc-btn" onClick={() => setPrompt(true)}>
                Follow in the app
              </button>
              {website ? (
                <a className="dc-btn dc-btn--ghost" href={website} target="_blank" rel="noopener noreferrer">
                  Visit website <Icon name="external" size={16} />
                </a>
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
            <div className="dc-rail dc-rail--cards">
              {data.upcoming.map((e) => (
                <EventCard key={e.id} event={e} showClub={false} />
              ))}
            </div>
          ) : (
            <EmptyState as="h3" title="Nothing scheduled yet" message={`Follow ${club.name} in the app to hear the moment they announce their next event.`}>
              <button type="button" className="dc-btn dc-btn--ghost" onClick={() => setPrompt(true)}>
                Follow in the app
              </button>
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
            <div className="dc-rowlist">
              {data.past.slice(0, 9).map((e) => (
                <EventCard key={e.id} event={e} variant="row" />
              ))}
            </div>
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
      />
    </SitePage>
  );
}
