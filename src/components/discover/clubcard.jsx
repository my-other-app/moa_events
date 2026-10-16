import { Link } from "react-router-dom";
import { formatCount, formatDistance, imageUrl } from "@/utils/format";
import { Avatar, Img } from "./bits";
import Icon from "./icons";

/** A club in a list: its cover and logo, what it is about, and how alive it is. */
export function ClubCard({ club, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`;
  const distance = formatDistance(club.distance_km);
  const to = club.slug ? `/clubs/${encodeURIComponent(club.slug)}` : null;
  return (
    <article className="dc-ccard">
      <div className="dc-ccard-cover">
        <Img src={imageUrl(club.cover, "medium")} alt="" />
        <Avatar name={club.name} src={club.logo} size={56} />
      </div>
      <div className="dc-ccard-body">
        <Heading className="dc-ccard-name">{to ? <Link className="dc-stretch" to={to}>{club.name}</Link> : club.name}</Heading>
        {club.tagline ? <p className="dc-ccard-tagline">{club.tagline}</p> : null}
        {club.location_name || distance ? (
          <p className="dc-ccard-meta">
            {club.location_name ? (
              <span>
                <Icon name="pin" size={13} /> {club.location_name}
              </span>
            ) : null}
            {distance ? <span>{distance}</span> : null}
          </p>
        ) : null}
        <p className="dc-ccard-meta">
          <span>
            <strong>{formatCount(club.followers)}</strong> {club.followers === 1 ? "follower" : "followers"}
          </span>
          <span>
            <strong>{formatCount(club.upcoming_events)}</strong> upcoming
          </span>
        </p>
        {club.interests.length ? (
          <ul className="dc-chips" aria-label="Interests">
            {club.interests.slice(0, 3).map((i) => (
              <li key={i} className="dc-chip">
                {i}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export function ClubCardSkeleton() {
  return (
    <div className="dc-ccard" aria-hidden="true">
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
    <div className={grid ? "dc-grid dc-grid--4" : "dc-rail"} role="status" aria-label="Loading clubs">
      {Array.from({ length: count }, (_, i) => (
        <ClubCardSkeleton key={i} />
      ))}
    </div>
  );
}
