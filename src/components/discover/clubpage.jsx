import { Suspense } from "react";
import { Link } from "@/lib/router";
import { formatCount, imageUrl } from "@/utils/format";
import { faceLook, initials } from "@/utils/cover";
import { feeds } from "@/seo/urls";
import { Avatar, EmptyState, Img, Section } from "./bits";
import { ClubActions, ClubFollow, FollowerCount, FollowHint, MoreEvents, UpcomingEmpty, VisitCounter } from "./clubislands";
import { ClubCover } from "./cover";
import { ThreadCard } from "./threadcard";
import Icon from "./icons";
import { TopicChips } from "./topicbits";

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
 * what they've run, the people behind it and who backs them. `data` is GET
 * /discover/clubs/{slug} as parseClubPage reads it.
 *
 * No state of its own: the server renders it whole (the page at
 * src/app/clubs/[slug]/page.jsx). Following, the ?follow= hint, the visit
 * count and "Show more" are the islands in clubislands.jsx.
 */
export function ClubView({ data }) {
  const { club } = data;
  const slug = club.slug;
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
    <ClubFollow club={{ id: club.id, name: club.name, slug }}>
      <Suspense fallback={null}>
        <VisitCounter slug={slug} />
      </Suspense>
      <div className="dc-wrap">
        <div className="dc-club-cover">
          <Img src={imageUrl(club.cover, "original")} alt="" loading="eager" fallback={<ClubCover club={{ id: club.id, slug: club.slug, name: club.name }} w={240} h={80} />} />
        </div>
        <div className="dc-club-id">
          <Avatar name={club.name} src={club.logo} size={104} alt={`${club.name} logo`} />
          <div className="dc-club-headrow">
            <div className="dc-club-titles">
              <h1>{club.name}</h1>
              {club.tagline ? <p className="dc-club-tagline">{club.tagline}</p> : null}
              <TopicChips topics={club.topics} className="tp-chips dc-club-topics" />
              <p className="dc-club-meta">
                {club.location_name ? (
                  <span>
                    <Icon name="pin" size={14} /> {club.location_name}
                  </span>
                ) : null}
                <FollowerCount followers={club.followers} />
                {club.events_held !== null ? (
                  <span>
                    <Icon name="calendar" size={14} /> <strong>{formatCount(club.events_held)}</strong> {club.events_held === 1 ? "event held" : "events held"}
                  </span>
                ) : null}
              </p>
            </div>
            <ClubActions>
              {website ? (
                <a className="dc-btn dc-btn--ghost" href={website} target="_blank" rel="noopener noreferrer">
                  Visit website <Icon name="external" size={16} />
                </a>
              ) : null}
            </ClubActions>
          </div>
        </div>

        <Suspense fallback={null}>
          <FollowHint />
        </Suspense>

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
            <MoreEvents slug={slug} when="upcoming" initial={data.upcoming} known={Math.max(club.upcoming_events, data.upcoming.length)} noun="upcoming events" />
          ) : (
            <UpcomingEmpty />
          )}
          {slug ? (
            <p className="dc-club-feed">
              <a href={feeds.club(slug)} type="application/rss+xml">
                <Icon name="rss" size={14} /> Follow {club.name}&rsquo;s events by RSS
              </a>
            </p>
          ) : null}
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
            <MoreEvents slug={slug} when="past" initial={data.past} known={club.events_held} noun="past events" />
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
    </ClubFollow>
  );
}

/** The page for a club the API doesn't know (or doesn't show). */
export function ClubMissing() {
  return (
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
  );
}
