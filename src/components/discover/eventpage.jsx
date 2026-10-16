import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { discoverApi } from "@/api/discover";
import { SITE_URL } from "@/config";
import NotFound from "@/components/notfound";
import { eventJsonLd } from "@/utils/eventld";
import { dateTile, eventPath, eventUrl, scheduleLines, seatsLeft, summary } from "@/utils/eventpage";
import { formatCount, formatPrice, formatWhen, imageUrl, plural } from "@/utils/format";
import { useJsonLd, usePageMeta, useShareMeta } from "@/utils/meta";
import { Agenda } from "./agenda";
import { Avatar, ErrorState, Section } from "./bits";
import { SitePage } from "./chrome";
import { EventCard } from "./eventcard";
import {
  CalendarButton,
  Contact,
  EpIcon,
  EpSection,
  EventSkeleton,
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
import "@/styles/event-page.css";

const DEFAULT_IMAGE = `${SITE_URL}/og-default.png`;
const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** What a link preview and a search engine are told about the event. */
function headOf(page) {
  if (!page) return {};
  const { event, club, speakers } = page;
  const url = eventUrl(event);
  const poster = imageUrl(event.poster, "original");
  const where = event.is_online ? "Online" : event.location_name;
  const when = formatWhen(event.starts_at);
  const description =
    summary(event.about) ||
    summary([when, where].filter(Boolean).join(" · ") + (club ? `. Hosted by ${club.name} on MyOtherApp.` : ". On MyOtherApp."));
  return {
    title: `${event.name} · MyOtherApp`,
    description,
    image: poster || DEFAULT_IMAGE,
    url,
    jsonLd: eventJsonLd({
      event,
      club,
      speakers,
      image: poster,
      url,
      clubUrl: club?.slug ? `${SITE_URL}/clubs/${encodeURIComponent(club.slug)}` : null,
      description: summary(event.about, 500) || null,
    }),
  };
}

function ClubRow({ club }) {
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

function Facts({ event, venueLink }) {
  const lines = scheduleLines(event);
  const tile = dateTile(event.starts_at);
  const left = seatsLeft(event);
  const people = [event.going > 0 ? `${formatCount(event.going)} going` : null, left !== null && left > 0 ? `${formatCount(left)} ${left === 1 ? "seat" : "seats"} left` : null]
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

const LONG_ABOUT = 900;

/** The about, folded after a screenful when it runs long. */
function About({ text }) {
  const long = text.length > LONG_ABOUT;
  const [open, setOpen] = useState(false);
  const id = "ep-about-text";
  return (
    <>
      <div id={id}>
        <RichText text={text} className={`ep-about${long && !open ? " is-clamped" : ""}`} />
      </div>
      {long ? (
        <button type="button" className="ep-more-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Read more"}
        </button>
      ) : null}
    </>
  );
}

/** The event, laid out: hero and card, the sections that have something, then more to go to. */
function EventView({ page }) {
  const { event, club, speakers, agenda, team, team_source: teamSource, more_from_club: more, similar } = page;
  const url = eventUrl(event);
  const prize = event.has_prize && event.prize_amount > 0 ? event.prize_amount : null;
  const hasVenue = event.is_online || Boolean(event.location_name) || (event.lat !== null && event.lng !== null);
  const contact = event.contact.email || event.contact.phone ? event.contact : null;
  const showTeam = team.length > 0 && teamSource !== "none";
  const hasAbout = Boolean(event.about) || event.interests.length > 0;

  const sections = [
    hasAbout && ["about", "About"],
    prize && ["prizes", "Prizes"],
    speakers.length > 0 && ["speakers", speakers.length === 1 ? "Speaker" : "Speakers"],
    agenda.items.length > 0 && ["agenda", "Agenda"],
    hasVenue && ["venue", event.is_online ? "Online" : "Venue"],
    event.guidelines && ["guidelines", "Guidelines"],
    showTeam && ["team", "Team"],
    contact && ["contact", "Contact"],
  ]
    .filter(Boolean)
    .map(([id, label]) => ({ id, label }));

  return (
    <article className="ep" aria-labelledby="ep-title">
      <div className="dc-wrap">
        <LiveStrips event={event} />
      </div>
      <div className="dc-wrap ep-layout">
        <header className="ep-intro">
          {event.category || prize ? (
            <p className="ep-chips">
              {event.category ? <span className="ep-chip ep-chip--cat">{event.category.name}</span> : null}
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
          {club ? <ClubRow club={club} /> : null}
          <Facts event={event} venueLink={hasVenue && !event.is_online} />
          <div className="ep-actions">
            <ShareButton title={event.name} text={club ? `${event.name} — ${club.name}` : event.name} url={url} />
            <CalendarButton event={event} url={url} />
          </div>
        </header>

        <div className="ep-side">
          <Poster event={event} club={club} />
          <RegisterCard event={event} />
        </div>

        <div className="ep-body">
          <SectionNav items={sections} />

          {hasAbout ? (
            <EpSection id="about" title="About this event">
              {event.about ? <About text={event.about} /> : null}
              {event.interests.length ? (
                <ul className="ep-tags" aria-label="Topics">
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

/**
 * An event's page at /events/{slug}. A numeric id or an old slug finds the
 * event too, and the address is then put right. Not public → the 404 page.
 */
export default function EventPage() {
  const { slug } = useParams();
  const { search, hash } = useLocation();
  const [state, setState] = useState({ status: "loading", data: null, ref: slug });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => (s.ref === slug && s.status === "ready" ? s : { status: "loading", data: null, ref: slug }));
    discoverApi.event(slug, { fresh: attempt > 0 }).then(
      (data) => alive && setState({ status: "ready", data, ref: slug }),
      (e) => alive && setState({ status: e?.notFound ? "missing" : "error", data: null, ref: slug })
    );
    return () => {
      alive = false;
    };
  }, [slug, attempt]);

  const page = state.status === "ready" && state.ref === slug ? state.data : null;
  const head = useMemo(() => headOf(page), [page]);
  usePageMeta(head.title || (state.status === "missing" ? "Event not found · MyOtherApp" : null), head.description);
  useShareMeta({ title: head.title, description: head.description, image: head.image, url: head.url, type: "website" });
  useJsonLd(head.jsonLd);

  if (state.status === "missing") return <NotFound />;
  if (state.status === "error") {
    return (
      <SitePage>
        <div className="dc-wrap">
          <div className="dc-section">
            <ErrorState message="We couldn't load this event right now. Check your connection and try again." onRetry={() => setAttempt((a) => a + 1)} />
          </div>
        </div>
      </SitePage>
    );
  }
  if (!page) {
    return (
      <SitePage>
        <EventSkeleton />
      </SitePage>
    );
  }
  if (page.event.slug && page.event.slug !== slug) {
    return <Navigate replace to={{ pathname: eventPath(page.event), search, hash }} />;
  }
  return (
    <SitePage>
      <EventView page={page} />
    </SitePage>
  );
}
