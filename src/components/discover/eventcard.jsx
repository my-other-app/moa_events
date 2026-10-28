"use client";

/*
 * A client component on purpose: a card is a lot of markup and a little
 * data, so a server-rendered page sends its HTML and the card's data,
 * rather than its HTML and the same markup again as React's payload. Its
 * HTML is still made on the server; nothing here reads the browser.
 */
import { Link } from "@/lib/router";
import { formatCount, formatDistance, formatPrice, formatWhen, imageUrl, showsHighDemand, statusPill } from "@/utils/format";
import { coverFields, eventHref, seatsInfo } from "@/utils/cover";
import { sizeFor } from "@/utils/pictures";
import { Avatar, PosterImg } from "./bits";
import { DateBadge, EventCover } from "./cover";
import Icon from "./icons";

/**
 * The pills for the poster: what is most pressing, the club's "High demand"
 * label when it has it on, and a quiet "Free" beside them while there are places.
 */
function Pills({ event }) {
  const status = statusPill(event);
  const pill = status && status.tone !== "free" ? status : null;
  const demand = showsHighDemand(event);
  const free = !event.has_fee && event.status !== "ended" && event.status !== "full";
  if (!pill && !demand && !free) return null;
  return (
    <span className="dc-evcard-pills">
      {pill ? <span className={`dc-pill dc-pill--${pill.tone}`}>{pill.label}</span> : null}
      {demand ? (
        <span className="dc-pill dc-pill--demand">
          <Icon name="zap" size={12} />
          High demand
        </span>
      ) : null}
      {free ? <span className="dc-pill dc-pill--quiet">Free</span> : null}
    </span>
  );
}

/** How full it is: the seats left when few are, how many are left while it fills, the size while it is empty. */
function Seats({ seats }) {
  if (!seats || seats.kind === "full") return null;
  if (seats.kind === "open") return <span className="dc-evcard-seats">{formatCount(seats.capacity)} seats</span>;
  return (
    <span className={`dc-evcard-seats dc-evcard-seats--${seats.kind}`}>
      {seats.kind === "few" ? `${formatCount(seats.left)} ${seats.left === 1 ? "seat" : "seats"} left` : `${formatCount(seats.left)} left`}
      <span className="dc-sr">
        , {formatCount(seats.going)} of {formatCount(seats.capacity)} taken
      </span>
    </span>
  );
}

/** The slim line over the footer that fills as people sign up. */
function FillBar({ seats }) {
  if (!seats || (seats.kind !== "bar" && seats.kind !== "few")) return null;
  return (
    <span className={`dc-evcard-bar dc-evcard-bar--${seats.kind}`} aria-hidden="true">
      <span style={{ width: `${Math.max(3, seats.pct)}%` }} />
    </span>
  );
}

/** How wide each card's poster is drawn at most (styles/cards-hero.css): a card in a rail or grid, and the sideways row. */
const CARD_POSTER_W = 360;
const ROW_POSTER_W = 104;

/**
 * An event as the app's feed shows it: the club on top, the poster (or a
 * cover drawn for it) with the date and what matters right now pinned to
 * it, then the name once, when and where, the price and how many are going.
 * The whole card is one link to the event page.
 *
 * `variant="row"` is the compact, sideways version for dense lists.
 * `showClub={false}` drops the club row where the page is already the
 * club's own.
 */
export function EventCard({ event, headingLevel = 3, variant = "card", showClub = true }) {
  const Heading = `h${headingLevel}`;
  const row = variant === "row";
  const ended = event.status === "ended";
  const when = formatWhen(event.starts_at);
  const distance = event.is_online ? null : formatDistance(event.distance_km);
  const place = event.is_online ? "Online" : event.location_name || (distance ? null : "Venue to be announced");
  const club = event.club;
  const status = statusPill(event);
  const seats = row ? null : seatsInfo(event);
  const filling = seats && (seats.kind === "bar" || seats.kind === "few");

  return (
    <article className={`dc-evcard${row ? " dc-evcard--row" : ""}${ended ? " is-ended" : ""}`}>
      {club && showClub && !row ? (
        <p className="dc-evcard-club">
          <Avatar name={club.name} src={club.logo} size={24} />
          <span>{club.name}</span>
        </p>
      ) : null}
      <div className="dc-evcard-media">
        <PosterImg
          src={imageUrl(event.poster, sizeFor("poster", row ? ROW_POSTER_W : CARD_POSTER_W))}
          alt={`Poster for ${event.name}`}
          fallback={<EventCover event={coverFields(event)} />}
          extra={row ? null : <DateBadge iso={event.starts_at} />}
          small={row}
        />
        {row ? null : <Pills event={event} />}
      </div>
      <div className="dc-evcard-body">
        <div className="dc-evcard-info">
          {row && when ? (
            <p className="dc-evcard-when">
              <time dateTime={event.starts_at}>{when}</time>
            </p>
          ) : null}
          <Heading className="dc-evcard-title">
            <Link className="dc-evcard-link" to={eventHref(event)}>
              {event.name}
            </Link>
          </Heading>
          {!row && when ? (
            <p className="dc-evcard-when">
              <time dateTime={event.starts_at}>{when}</time>
            </p>
          ) : null}
          {place || distance ? (
            <p className="dc-evcard-where">
              <Icon name={event.is_online ? "monitor" : "pin"} size={14} />
              {place ? <span>{place}</span> : null}
              {distance ? <span className="dc-evcard-dist">{place ? `· ${distance}` : distance}</span> : null}
            </p>
          ) : null}
        </div>
        <div className={`dc-evcard-foot${filling ? " has-bar" : ""}`}>
          <FillBar seats={seats} />
          <span className="dc-price">{formatPrice(event.has_fee, event.fee)}</span>
          {event.going > 0 ? (
            <span className="dc-going">
              <Icon name="users" size={14} />
              {formatCount(event.going)} going
            </span>
          ) : null}
          {row ? (
            <>
              {status && status.tone !== "free" ? <span className={`dc-evcard-status dc-evcard-status--${status.tone}`}>{status.label}</span> : null}
              {showsHighDemand(event) ? <span className="dc-evcard-status dc-evcard-status--demand">High demand</span> : null}
            </>
          ) : (
            <Seats seats={seats} />
          )}
        </div>
      </div>
    </article>
  );
}

export function EventCardSkeleton({ variant = "card" }) {
  if (variant === "row") {
    return (
      <div className="dc-evcard dc-evcard--row" aria-hidden="true">
        <div className="dc-evcard-media dc-skel" />
        <div className="dc-evcard-body">
          <div className="dc-skel dc-skel-line" style={{ width: "50%", marginTop: 0 }} />
          <div className="dc-skel dc-skel-title" />
          <div className="dc-skel dc-skel-line" style={{ width: "40%" }} />
        </div>
      </div>
    );
  }
  return (
    <div className="dc-evcard" aria-hidden="true">
      <div className="dc-evcard-club">
        <span className="dc-skel" style={{ width: 24, height: 24, borderRadius: 999 }} />
        <span className="dc-skel" style={{ width: 110, height: 12 }} />
      </div>
      <div className="dc-evcard-media dc-skel" />
      <div className="dc-evcard-body">
        <div className="dc-skel dc-skel-title" />
        <div className="dc-skel dc-skel-line" style={{ width: "60%" }} />
        <div className="dc-skel dc-skel-line" style={{ width: "40%" }} />
      </div>
    </div>
  );
}

/** A loading row of cards, announced once for screen readers. */
export function EventRailSkeleton({ count = 4, grid = false }) {
  return (
    <div className={grid ? "dc-grid dc-grid--4" : "dc-rail dc-rail--cards"} role="status" aria-label="Loading events">
      {Array.from({ length: count }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A row of events: it scrolls sideways on a phone and is a one-row grid on a desk ("See all" has the rest). */
export function EventRail({ events, limit = 8 }) {
  return (
    <div className="dc-rail dc-rail--cards dc-rail--clip">
      {events.slice(0, limit).map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
    </div>
  );
}
