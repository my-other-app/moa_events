import { Link } from "@/lib/router";
import { dateTile, eventUrl, peopleLine, registerState, scheduleLines, seatsLeft, summary } from "@/utils/eventpage";
import { EventTickets } from "../register/eventtickets";
import { formatCount, formatPrice, plural, showsHighDemand } from "@/utils/format";
import { hostNames, hostsOf } from "@/utils/hosts";
import { confirmsEachPlace } from "@/utils/requests";
import { topicPagePath } from "@/seo/urls";
import { Agenda } from "./agenda";
import { Avatar, Section } from "./bits";
import { EventCard } from "./eventcard";
import { HostFaces, HostLinks } from "./hosts";
import {
  About,
  Backers,
  CalendarButton,
  CancelledNotice,
  Contact,
  EpIcon,
  EpSection,
  LiveStrips,
  Poster,
  Prizes,
  RegisterCard,
  RichText,
  SectionNav,
  ShareButton,
  Speakers,
  Team,
  Venue,
} from "./eventparts";
import Icon from "./icons";
import { topicTone } from "./topicbits";

const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** What "Add to calendar" needs, and no more (the button works its links out in the browser). */
const calendarEvent = (e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  starts_at: e.starts_at,
  ends_at: e.ends_at,
  duration_hours: e.duration_hours,
  is_online: e.is_online,
  location_name: e.location_name,
  about: summary(e.about, 600),
});

/**
 * "Hosted by A and B" (or "A, B and C"): every host's logo, overlapping,
 * the host's first, then the names, each a link to its club's page.
 */
function HostsRow({ hosts }) {
  return (
    <div className="ep-club ep-hosts">
      <HostFaces hosts={hosts} size={40} className="ep-hosts-faces" />
      <p className="ep-club-text">
        <span className="ep-club-by">Hosted by</span>{" "}
        <span className="ep-club-name ep-hosts-names">
          <HostLinks hosts={hosts} />
        </span>
      </p>
    </div>
  );
}

/** Who runs it: the club, as one link to its page; with co-hosts, every host (HostsRow). */
function ClubRow({ club, cohosts }) {
  const hosts = hostsOf(club, cohosts);
  if (hosts.length > 1) return <HostsRow hosts={hosts} />;
  const inner = (
    <>
      <Avatar name={club.name} src={club.logo} size={44} />
      <span className="ep-club-text">
        <span className="ep-club-by">Hosted by</span>
        <span className="ep-club-name">{club.name}</span>
        {club.followers > 0 ? <span className="ep-club-meta">{plural(club.followers, "follower")}</span> : null}
      </span>
    </>
  );
  return club.slug ? (
    <Link className="ep-club" to={`/clubs/${encodeURIComponent(club.slug)}`}>
      {inner}
      <Icon name="arrowRight" size={16} className="ep-club-go" />
    </Link>
  ) : (
    <div className="ep-club">{inner}</div>
  );
}

function Facts({ event, club, venueLink }) {
  const lines = scheduleLines(event);
  const tile = dateTile(event.starts_at);
  // A cancelled event has no seats to speak of; one that reviews registrations shows none either (seatsLeft).
  const left = event.status === "cancelled" ? null : seatsLeft(event);
  // Nobody yet at an event that reviews registrations: "{Club} reviews every registration".
  const confirms = event.requires_approval === true && event.status !== "ended" ? confirmsEachPlace(club) : null;
  const people =
    event.status === "cancelled"
      ? ""
      : [peopleLine(event) || confirms, left !== null && left > 0 ? `${formatCount(left)} ${left === 1 ? "seat" : "seats"} left` : null]
          .filter(Boolean)
          .join(" · ");
  return (
    <ul className="ep-facts">
      {lines ? (
        <li className="ep-fact">
          {tile ? (
            <span className="ep-tile" aria-hidden="true">
              <span>{tile.month}</span>
              <strong>{tile.day}</strong>
            </span>
          ) : null}
          <span className="ep-fact-text">
            <time className="ep-fact-main" dateTime={event.starts_at}>
              {lines.day}
            </time>
            <span className="ep-fact-sub">{lines.time}</span>
          </span>
        </li>
      ) : null}
      <li className="ep-fact">
        <span className="ep-tile ep-tile--icon" aria-hidden="true">
          <Icon name={event.is_online ? "monitor" : "pin"} size={20} />
        </span>
        <span className="ep-fact-text">
          <span className="ep-fact-main">{event.is_online ? "Online" : event.location_name || "Venue to be announced"}</span>
          {event.is_online ? (
            <span className="ep-fact-sub">The joining link comes with your ticket</span>
          ) : venueLink ? (
            <a className="ep-fact-sub ep-fact-link" href="#venue">
              Map and directions
            </a>
          ) : null}
        </span>
      </li>
      <li className="ep-fact">
        <span className="ep-tile ep-tile--icon" aria-hidden="true">
          <EpIcon name="ticket" size={20} />
        </span>
        <span className="ep-fact-text">
          <span className="ep-fact-main">{formatPrice(event.has_fee, event.fee)}</span>
          {people ? <span className="ep-fact-sub">{people}</span> : null}
        </span>
      </li>
    </ul>
  );
}

/**
 * An event, laid out: hero and card, the sections that have something,
 * then more to go to. `page` is GET /discover/events/{ref} as parseEventPage
 * reads it. No state of its own: the server renders it whole (the page at
 * src/app/events/[slug]/page.jsx), and only the islands (eventislands.jsx)
 * run in the browser.
 */
export function EventView({ page }) {
  const { event, club, speakers, agenda, team, team_source: teamSource, more_from_club: more, similar } = page;
  // The event's own sponsors and partners; an older API sends neither.
  const sponsors = page.sponsors || [];
  const partners = page.partners || [];
  // The clubs co-hosting it with its club; an older API sends none.
  const cohosts = page.cohosts || [];
  const url = eventUrl(event);
  const prize = event.has_prize && event.prize_amount > 0 ? event.prize_amount : null;
  const hasVenue = event.is_online || Boolean(event.location_name) || (event.lat !== null && event.lng !== null);
  const contact = event.contact.email || event.contact.phone ? event.contact : null;
  const showTeam = team.length > 0 && teamSource !== "none";
  const hasAbout = Boolean(event.about) || event.interests.length > 0;
  const topics = event.topics || [];

  const sections = [
    hasAbout && ["about", "About"],
    prize && ["prizes", "Prizes"],
    speakers.length > 0 && ["speakers", speakers.length === 1 ? "Speaker" : "Speakers"],
    agenda.items.length > 0 && ["agenda", "Agenda"],
    sponsors.length > 0 && ["sponsors", sponsors.length === 1 ? "Sponsor" : "Sponsors"],
    partners.length > 0 && ["partners", partners.length === 1 ? "Partner" : "Partners"],
    hasVenue && ["venue", event.is_online ? "Online" : "Venue"],
    event.guidelines && ["guidelines", "Guidelines"],
    showTeam && ["team", "Team"],
    contact && ["contact", "Contact"],
  ]
    .filter(Boolean)
    .map(([id, label]) => ({ id, label }));

  const cancelled = event.status === "cancelled";
  const regState = registerState(event);
  // The club's "High demand" label (no numbers), while the event is still to come or on.
  const demand = showsHighDemand(event);

  return (
    <article className="ep" aria-labelledby="ep-title">
      <div className="dc-wrap">{cancelled ? null : <LiveStrips event={{ id: event.id, slug: event.slug, status: event.status }} />}</div>
      <div className="dc-wrap ep-layout">
        <header className="ep-intro">
          {event.category || prize || topics.length || demand ? (
            <p className="ep-chips">
              {demand ? (
                <span className="ep-chip ep-chip--demand">
                  <Icon name="zap" size={14} />
                  High demand
                </span>
              ) : null}
              {event.category ? <span className="ep-chip ep-chip--cat">{event.category.name}</span> : null}
              {topics.map((t) => (
                <Link key={t.slug} className="ep-chip ep-chip--topic" to={topicPagePath(t)} style={topicTone(t)}>
                  <span className="tp-chip-dot" aria-hidden="true" />
                  {t.name}
                </Link>
              ))}
              {prize ? (
                <a className="ep-chip" href="#prizes">
                  <EpIcon name="trophy" size={14} />₹{rupees.format(prize)} in prizes
                </a>
              ) : null}
            </p>
          ) : null}
          <h1 id="ep-title" className="ep-title">
            {event.name}
          </h1>
          <CancelledNotice event={event} />
          {club ? <ClubRow club={club} cohosts={cohosts} /> : null}
          <Facts event={event} club={club} venueLink={hasVenue && !event.is_online} />
          <div className="ep-actions">
            <ShareButton title={event.name} text={club ? `${event.name} — ${hostNames(hostsOf(club, cohosts))}` : event.name} url={url} />
            {cancelled ? null : <CalendarButton event={calendarEvent(event)} url={url} />}
          </div>
        </header>

        <div className="ep-side">
          <Poster event={event} />
          <RegisterCard event={event} club={club} />
        </div>

        <div className="ep-body">
          <SectionNav items={sections} />

          {/* Its ticket types and waiting list, read in the browser (nothing for a single ticket with no line). */}
          <EventTickets
            eventId={String(event.id)}
            kind={regState.kind}
            registerHref={regState.kind === "open" ? regState.href || null : regState.kind === "live" ? regState.also?.href || null : null}
            approval={event.requires_approval === true}
          />

          {hasAbout ? (
            <EpSection id="about" title="About this event">
              {event.about ? <About text={event.about} /> : null}
              {event.interests.length ? (
                <ul className="ep-tags" aria-label="Interests">
                  {event.interests.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : null}
            </EpSection>
          ) : null}

          {prize ? <Prizes amount={prize} /> : null}
          {speakers.length ? <Speakers speakers={speakers} /> : null}
          {agenda.items.length ? <Agenda agenda={agenda} /> : null}
          {sponsors.length ? <Backers kind="sponsor" items={sponsors} /> : null}
          {partners.length ? <Backers kind="partner" items={partners} /> : null}
          {hasVenue ? <Venue event={event} /> : null}

          {event.guidelines ? (
            <EpSection id="guidelines" title="Guidelines">
              <RichText text={event.guidelines} className="ep-guidelines" />
            </EpSection>
          ) : null}

          {showTeam ? <Team team={team} source={teamSource} club={club} /> : null}
          {contact ? <Contact contact={contact} /> : null}
        </div>
      </div>

      {more.length || similar.length ? (
        <div className="dc-wrap ep-more">
          {more.length ? (
            <Section id="more" title={`More from ${club?.name || "this club"}`} seeAll={club?.slug ? `/clubs/${encodeURIComponent(club.slug)}` : null}>
              <div className="dc-rail">
                {more.slice(0, 4).map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </Section>
          ) : null}
          {similar.length ? (
            <Section id="similar" title="Similar events" seeAll={event.category ? `/events?category=${encodeURIComponent(event.category.id)}` : "/events"}>
              <div className="dc-rail">
                {similar.slice(0, 4).map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
