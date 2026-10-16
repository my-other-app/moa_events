import { Link } from "react-router-dom";
import { formatCount, formatDistance, formatPrice, formatWhen, imageUrl, statusPill } from "@/utils/format";
import { Avatar, Img } from "./bits";
import Icon from "./icons";

/**
 * An event as the app's feed shows it: the club on top, the poster with
 * what matters right now pinned to it, then the name, when, where, the
 * price and how many are going. The whole card opens the event page.
 */
export function EventCard({ event, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const pill = statusPill(event);
  const when = formatWhen(event.starts_at);
  const distance = event.is_online ? null : formatDistance(event.distance_km);
  const club = event.club;
  const clubInner = club ? (
    <>
      <Avatar name={club.name} src={club.logo} size={28} />
      <span>{club.name}</span>
    </>
  ) : null;

  return (
    <article className="dc-ecard">
      {club ? (
        club.slug ? (
          <Link className="dc-ecard-club" to={`/clubs/${encodeURIComponent(club.slug)}`}>
            {clubInner}
          </Link>
        ) : (
          <div className="dc-ecard-club">{clubInner}</div>
        )
      ) : null}
      <div className="dc-ecard-media">
        <Img
          src={imageUrl(event.poster, "medium")}
          alt={`Poster for ${event.name}`}
          fallback={
            <div className="dc-poster-fallback" aria-hidden="true">
              {event.name}
            </div>
          }
        />
        {pill ? <span className={`dc-pill dc-pill--${pill.tone}`}>{pill.label}</span> : null}
      </div>
      <Heading className="dc-ecard-title">
        <Link className="dc-ecard-link" to={`/${encodeURIComponent(event.id)}`}>
          {event.name}
        </Link>
      </Heading>
      {when ? (
        <p className="dc-ecard-when">
          <time dateTime={event.starts_at}>{when}</time>
        </p>
      ) : null}
      <p className="dc-ecard-where">
        <Icon name={event.is_online ? "monitor" : "pin"} size={14} />
        <span>{event.is_online ? "Online" : event.location_name || "Venue to be announced"}</span>
        {distance ? <span>· {distance}</span> : null}
      </p>
      <p className="dc-ecard-foot">
        <span className="dc-price">{formatPrice(event.has_fee, event.fee)}</span>
        {event.going > 0 ? (
          <span className="dc-going">
            <Icon name="users" size={14} />
            {formatCount(event.going)} going
          </span>
        ) : null}
      </p>
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="dc-ecard" aria-hidden="true">
      <div className="dc-ecard-club">
        <span className="dc-skel" style={{ width: 28, height: 28, borderRadius: 999 }} />
        <span className="dc-skel" style={{ width: 120, height: 12 }} />
      </div>
      <div className="dc-ecard-media dc-skel" style={{ borderRadius: 10 }} />
      <div className="dc-skel dc-skel-title" />
      <div className="dc-skel dc-skel-line" style={{ width: "60%" }} />
      <div className="dc-skel dc-skel-line" style={{ width: "40%" }} />
    </div>
  );
}

/** A loading row of cards, announced once for screen readers. */
export function EventRailSkeleton({ count = 4, grid = false }) {
  return (
    <div className={grid ? "dc-grid dc-grid--4" : "dc-rail"} role="status" aria-label="Loading events">
      {Array.from({ length: count }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}
