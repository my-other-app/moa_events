import { Link } from "react-router-dom";
import { formatCount, formatDistance, imageUrl } from "@/utils/format";
import { Avatar, Img } from "./bits";
import { ClubCover } from "./cover";
import Icon from "./icons";
import "@/styles/discover.css";
import "@/styles/cards-hero.css";

/**
 * A club in a list: its cover (or one drawn in the event covers' family),
 * the logo over it, what it is about, where, and how alive it is. The whole
 * card opens the club's page.
 */
export function ClubCard({ club, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const distance = formatDistance(club.distance_km);
  const to = club.slug ? `/clubs/${encodeURIComponent(club.slug)}` : null;
  const upcoming = club.upcoming_events;
  return (
    <article className="dc-ccard dc-clubcard">
      <div className="dc-ccard-cover">
        <Img src={imageUrl(club.cover, "medium")} alt="" fallback={<ClubCover club={club} />} />
        <Avatar name={club.name} src={club.logo} size={56} />
      </div>
      <div className="dc-ccard-body">
        <Heading className="dc-ccard-name">{to ? <Link className="dc-stretch" to={to}>{club.name}</Link> : club.name}</Heading>
        {club.tagline ? <p className="dc-ccard-tagline">{club.tagline}</p> : null}
        {club.location_name || distance ? (
          <p className="dc-ccard-meta dc-clubcard-place">
            <Icon name="pin" size={13} />
            {club.location_name ? <span>{club.location_name}</span> : null}
            {distance ? <span>{club.location_name ? `· ${distance}` : distance}</span> : null}
          </p>
        ) : null}
        {club.interests.length ? (
          <ul className="dc-chips" aria-label="Interests">
            {club.interests.slice(0, 3).map((i) => (
              <li key={i} className="dc-chip">
                {i}
              </li>
            ))}
            {club.interests.length > 3 ? <li className="dc-chip dc-chip--more">+{club.interests.length - 3}</li> : null}
          </ul>
        ) : null}
        <p className="dc-clubcard-stats">
          <span>
            <strong>{formatCount(club.followers)}</strong> {club.followers === 1 ? "follower" : "followers"}
          </span>
          <span className={upcoming > 0 ? "dc-clubcard-upcoming is-on" : "dc-clubcard-upcoming"}>
            <strong>{formatCount(upcoming)}</strong> upcoming
          </span>
        </p>
      </div>
    </article>
  );
}

export function ClubCardSkeleton() {
  return (
    <div className="dc-ccard dc-clubcard" aria-hidden="true">
      <div className="dc-ccard-cover dc-skel" style={{ borderRadius: 0 }} />
      <div className="dc-ccard-body">
        <div className="dc-skel dc-skel-title" style={{ width: "70%" }} />
        <div className="dc-skel dc-skel-line" />
        <div className="dc-skel dc-skel-line" style={{ width: "50%" }} />
      </div>
    </div>
  );
}

export function ClubRailSkeleton({ count = 4, grid = false }) {
  return (
    <div className={grid ? "dc-grid dc-grid--4" : "dc-rail dc-rail--cards"} role="status" aria-label="Loading clubs">
      {Array.from({ length: count }, (_, i) => (
        <ClubCardSkeleton key={i} />
      ))}
    </div>
  );
}
