import { useId, useState } from "react";
import { Link, useNavigate } from "@/lib/router";
import { formatCount, formatWhen, imageUrl } from "@/utils/format";
import { eventHref, heroPicks } from "@/utils/cover";
import { Avatar, Img } from "./bits";
import { DateBadge, EventCover } from "./cover";
import { LocationPill } from "./locationpill";
import Icon from "./icons";

const CHIPS = 8;

/** One event in the fan: its poster or cover, the date on it, the name and club underneath. */
function FanTile({ event }) {
  const when = formatWhen(event.starts_at);
  const live = event.status === "live";
  return (
    <Link className="dc-fan-tile" to={eventHref(event)} aria-label={`${event.name}${when ? `, ${when}` : ""}`}>
      <span className="dc-fan-media">
        <Img src={imageUrl(event.poster, "medium")} alt="" loading="eager" fallback={<EventCover event={event} />} extra={<DateBadge iso={event.starts_at} />} />
        {live ? <span className="dc-pill dc-pill--live">Live now</span> : null}
      </span>
      <span className="dc-fan-caption">
        <span className="dc-fan-name">{event.name}</span>
        {event.club ? (
          <span className="dc-fan-club">
            <Avatar name={event.club.name} src={event.club.logo} size={18} />
            <span>{event.club.name}</span>
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/** The kinds of thing on here, drawn, for when there are no events to show yet. */
const IDLE = [
  { id: 3, label: "Hackathons" },
  { id: 1, label: "Workshops" },
  { id: 4, label: "Meetups" },
];

function Fan({ events, loading }) {
  if (loading) {
    return (
      <div className="dc-fan dc-fan--3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`dc-fan-slot dc-fan-slot--${i + 1}`}>
            <span className="dc-fan-tile">
              <span className="dc-fan-media dc-skel" />
              <span className="dc-fan-caption">
                <span className="dc-skel dc-skel-line" style={{ width: "80%", marginTop: 0 }} />
              </span>
            </span>
          </span>
        ))}
      </div>
    );
  }
  if (!events.length) {
    return (
      <div className="dc-fan dc-fan--3 dc-fan--idle" aria-hidden="true">
        {IDLE.map((t, i) => (
          <span key={t.id} className={`dc-fan-slot dc-fan-slot--${i + 1}`}>
            <span className="dc-fan-tile">
              <span className="dc-fan-media">
                <EventCover event={{ id: t.id + 6, category: { id: t.id } }} label={t.label} />
              </span>
            </span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <ul className={`dc-fan dc-fan--${events.length}`} aria-label="Coming up">
      {events.map((e, i) => (
        <li key={e.id} className={`dc-fan-slot dc-fan-slot--${i + 1}`}>
          <FanTile event={e} />
        </li>
      ))}
    </ul>
  );
}

/** Upcoming events, clubs and cities, with a few of the clubs' faces. */
function Stats({ stats, clubs }) {
  if (!stats || !(stats.upcoming_events > 0 || stats.clubs > 0)) return null;
  const faces = clubs.filter((c) => c.logo).slice(0, 4);
  return (
    <p className="dc-hero2-stats">
      {faces.length ? (
        <span className="dc-hero2-faces" aria-hidden="true">
          {faces.map((c) => (
            <Avatar key={c.slug || c.id} name={c.name} src={c.logo} size={30} />
          ))}
        </span>
      ) : null}
      <span className="dc-hero2-stat">
        <strong>{formatCount(stats.upcoming_events)}</strong> upcoming {stats.upcoming_events === 1 ? "event" : "events"}
      </span>
      <span className="dc-hero2-stat">
        <strong>{formatCount(stats.clubs)}</strong> {stats.clubs === 1 ? "club" : "clubs"}
      </span>
      {stats.cities > 1 ? (
        <span className="dc-hero2-stat">
          <strong>{formatCount(stats.cities)}</strong> cities
        </span>
      ) : null}
    </p>
  );
}

/**
 * The front of the site: what this is in one line, a search for what and
 * where, the categories one tap away, and a fan of real events coming up
 * that open straight into their pages.
 */
export function HomeHero({ data = null, loading = false, where = null, stored = null, onWhereChange }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const searchId = useId();
  const events = heroPicks(data, 3);
  const live = events.find((e) => e.status === "live");
  const categories = [...(data?.categories || [])].sort((a, b) => b.upcoming - a.upcoming);
  const shown = categories.slice(0, CHIPS);

  const search = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/events?q=${encodeURIComponent(term)}` : "/events");
  };

  return (
    <section className="dc-hero2" aria-labelledby="dc-hero-title">
      <div className="dc-hero2-copy">
        {live ? (
          <Link className="dc-hero2-live" to={eventHref(live)}>
            <span className="dc-hero2-livedot" aria-hidden="true" />
            <span className="dc-hero2-livelabel">Live now</span>
            <span className="dc-hero2-livename">{live.name}</span>
            <Icon name="arrowRight" size={14} />
          </Link>
        ) : null}
        <h1 id="dc-hero-title" className="dc-hero2-title">
          <span>Find your people.</span> <span className="dc-hl">Show up.</span>
        </h1>
        <p className="dc-hero2-lede">Hackathons, workshops and meetups from the student clubs around you — find one this week and grab a spot in a tap.</p>

        <form className="dc-hero2-search" role="search" onSubmit={search}>
          <div className="dc-hero2-field dc-hero2-what">
            <Icon name="search" size={20} />
            <label className="dc-sr" htmlFor={searchId}>
              Search events
            </label>
            <input id={searchId} type="search" placeholder="Search events or topics" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" autoComplete="off" />
          </div>
          <div className="dc-hero2-field dc-hero2-where">
            <LocationPill className="dc-where--bare" where={where} stored={stored} onChange={onWhereChange} />
          </div>
          <button type="submit" className="dc-btn dc-hero2-go">
            <Icon name="search" size={18} />
            <span>Search</span>
          </button>
        </form>

        {shown.length ? (
          <nav className="dc-hero2-cats" aria-label="Browse by category">
            <ul>
              {shown.map((c) => (
                <li key={c.id}>
                  <Link className="dc-hero2-cat" to={`/events?category=${encodeURIComponent(c.id)}`}>
                    {c.name}
                    {c.upcoming > 0 ? <small>{formatCount(c.upcoming)}</small> : null}
                  </Link>
                </li>
              ))}
              {categories.length > CHIPS ? (
                <li>
                  <Link className="dc-hero2-cat dc-hero2-cat--more" to="/events">
                    All events <Icon name="arrowRight" size={14} />
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>
        ) : null}

        <Stats stats={data?.stats} clubs={data?.clubs || []} />
      </div>

      <div className="dc-hero2-visual">
        <span className="dc-hero2-sun" aria-hidden="true" />
        <span className="dc-hero2-dots" aria-hidden="true" />
        <CoverSpark />
        <Fan events={events} loading={loading && !data} />
      </div>
    </section>
  );
}

/** A small drawn spark beside the fan. */
function CoverSpark() {
  return (
    <svg className="dc-hero2-spark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M20 2 L23 17 L38 20 L23 23 L20 38 L17 23 L2 20 L17 17 Z" />
    </svg>
  );
}

