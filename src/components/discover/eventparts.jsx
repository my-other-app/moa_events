import { Link } from "@/lib/router";
import { formatCount, formatPrice, imageUrl, statusPill } from "@/utils/format";
import { safeHref } from "@/utils/linkify";
import { registerState, seatsLeft, whenLine } from "@/utils/eventpage";
import { Img } from "./img";
import { coverFields } from "@/utils/cover";
import { EventCover } from "./cover";
import Icon from "./icons";
import { EpIcon } from "./eventbits";

/*
 * The event page's parts. What is defined here has no state and renders on
 * the server (the page sends it as HTML, with no script). The parts that
 * react to the reader — the poster's fallback, Share, Add to calendar, the
 * section tabs, the live strip, "Read more" — are the client islands in
 * eventislands.jsx, re-exported here so callers import from one place.
 */
export { About, CalendarButton, LiveStrips, SectionNav, ShareButton } from "./eventislands";
export { EpIcon, RichText } from "./eventbits";

/** "Ananya Iyer" → "AI". */
const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

/** A person's round photo over their initials: the initials show while it loads, or if it never does. */
export function Face({ name, src, size = 64 }) {
  return (
    <span className="ep-face" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      <span aria-hidden="true">{initials(name)}</span>
      <Img src={imageUrl(src, size > 72 ? "medium" : "thumbnail")} alt="" />
    </span>
  );
}

/** A titled block of the event page; `id` is what the section nav links to. */
export function EpSection({ id, title, children, className = "", aside = null }) {
  const headingId = `${id}-title`;
  return (
    <section id={id} className={`ep-section ${className}`} aria-labelledby={headingId}>
      <div className="ep-section-head">
        <h2 className="ep-h2" id={headingId}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* ---------- the poster ---------- */

/**
 * The cover an event without a poster gets: the same drawn cover its card
 * shows, so the event looks the same on the card and on its page.
 */
export function Cover({ event }) {
  return <EventCover event={coverFields(event)} />;
}

/**
 * The poster at 4:5 with the status pill on it, or the generated cover.
 * Not lazy: it's the first thing seen. A poster that fails to load gives way
 * to the cover (the one client part, in img.jsx).
 */
export function Poster({ event }) {
  const src = imageUrl(event.poster, "original");
  const pill = statusPill(event);
  return (
    <div className="ep-poster">
      {src ? (
        <Img src={src} alt={`Poster for ${event.name}`} loading="eager" fetchPriority="high" width="800" height="1000" fallback={<Cover event={event} />} />
      ) : (
        <Cover event={event} />
      )}
      {pill ? <span className={`dc-pill dc-pill--${pill.tone}`}>{pill.label}</span> : null}
    </div>
  );
}

/* ---------- registration ---------- */

/**
 * The price and the one button, from the event's state. Sticky beside the
 * page on a desk; a bar fixed to the bottom of a phone.
 */
export function RegisterCard({ event }) {
  const state = registerState(event);
  const left = seatsLeft(event);
  const when = whenLine(event.starts_at);
  const taken = event.capacity && left !== null ? Math.min(event.capacity, Math.max(0, event.capacity - left)) : 0;
  const showMeter = event.capacity && (state.kind === "open" || state.kind === "full");
  return (
    <div className={`ep-cta ep-cta--${state.kind}`} role="region" aria-label="Registration">
      {when ? (
        <p className="ep-cta-when">
          <EpIcon name="calendar" size={15} />
          <time dateTime={event.starts_at}>{when}</time>
        </p>
      ) : null}
      <div className="ep-cta-row">
        <div className="ep-cta-info">
          {state.eyebrow ? <p className="ep-cta-eyebrow">{state.eyebrow}</p> : null}
          <p className="ep-cta-price">{formatPrice(event.has_fee, event.fee)}</p>
          {state.note ? <p className={`ep-cta-note${state.tone === "warn" ? " is-warn" : ""}`}>{state.note}</p> : null}
        </div>
        <div className="ep-cta-go">
          {state.href ? (
            <Link className="dc-btn ep-cta-btn" to={state.href}>
              {state.label}
            </Link>
          ) : (
            <button type="button" className="dc-btn ep-cta-btn" disabled>
              {state.label}
            </button>
          )}
          {state.also ? (
            <Link className="ep-cta-also" to={state.also.href}>
              {state.also.label}
            </Link>
          ) : null}
        </div>
      </div>
      {showMeter ? (
        <div className="ep-meter">
          <span className="ep-meter-bar" role="img" aria-label={`${formatCount(taken)} of ${formatCount(event.capacity)} seats taken`}>
            <span style={{ width: `${Math.round((taken / event.capacity) * 100)}%` }} />
          </span>
          <span className="ep-meter-text">
            {event.going > 0 ? `${formatCount(event.going)} going` : "Be the first to register"}
            {left !== null && left > 0 ? ` · ${formatCount(left)} ${left === 1 ? "seat" : "seats"} left` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- sections ---------- */

const hostIcon = (url) => {
  const host = (() => {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (/(^|\.)linkedin\.com$/.test(host)) return ["linkedin", "LinkedIn"];
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return ["x", "X"];
  if (/(^|\.)instagram\.com$/.test(host)) return ["instagram", "Instagram"];
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(host)) return ["youtube", "YouTube"];
  return ["globe", "their website"];
};

export function Speakers({ speakers }) {
  return (
    <EpSection id="speakers" title={speakers.length === 1 ? "Speaker" : "Speakers"}>
      <ul className="ep-speakers">
        {speakers.map((s, i) => {
          const link = safeHref(s.link);
          const [icon, label] = link ? hostIcon(link) : [];
          return (
            <li key={s.id ?? `${s.name}-${i}`} className="ep-speaker">
              <Face name={s.name} src={s.photo} size={72} />
              <div className="ep-speaker-body">
                <div className="ep-speaker-head">
                  <div>
                    <h3 className="ep-speaker-name">{s.name}</h3>
                    {s.designation ? <p className="ep-speaker-role">{s.designation}</p> : null}
                  </div>
                  {link && !link.startsWith("mailto:") ? (
                    <a className="ep-iconlink" href={link} target="_blank" rel="noopener noreferrer" aria-label={`${s.name} on ${label}`}>
                      <EpIcon name={icon === "globe" ? "link" : icon} size={17} />
                    </a>
                  ) : null}
                </div>
                {s.bio ? <p className="ep-speaker-bio">{s.bio}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </EpSection>
  );
}

const PERSON_LINKS = [
  ["instagram", "Instagram", "instagram"],
  ["linkedin", "LinkedIn", "linkedin"],
  ["x", "X", "x"],
  ["website", "their website", "globe"],
];

export function Team({ team, source, club }) {
  const title = source === "event" ? "Organising team" : `Hosted by ${club?.name || "the club"}`;
  return (
    <EpSection
      id="team"
      title={title}
      aside={
        source === "club" && club?.slug ? (
          <Link className="dc-seeall" to={`/clubs/${encodeURIComponent(club.slug)}`}>
            About the club <Icon name="arrowRight" size={16} />
          </Link>
        ) : null
      }
    >
      <ul className="ep-team">
        {team.map((p, i) => {
          const links = PERSON_LINKS.map(([k, label, icon]) => [k, label, icon, safeHref(p.links?.[k])]).filter(([, , , url]) => url && !url.startsWith("mailto:"));
          return (
            <li key={`${p.name}-${i}`} className="ep-person">
              <Face name={p.name} src={p.photo} size={64} />
              <div className="ep-person-body">
                <p className="ep-person-name">{p.name}</p>
                {p.role ? <p className="ep-person-role">{p.role}</p> : null}
                {links.length ? (
                  <p className="ep-person-links">
                    {links.map(([k, label, icon, url]) => (
                      <a key={k} href={url} target="_blank" rel="noopener noreferrer" aria-label={`${p.name} on ${label}`}>
                        <Icon name={icon} size={15} />
                      </a>
                    ))}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </EpSection>
  );
}

const rupees = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function Prizes({ amount }) {
  return (
    <EpSection id="prizes" title="Prizes">
      <div className="ep-prize">
        <span className="ep-prize-icon">
          <EpIcon name="trophy" size={28} />
        </span>
        <div>
          <p className="ep-prize-amount">₹{rupees.format(amount)}</p>
          <p className="ep-prize-label">in prizes to be won</p>
        </div>
      </div>
    </EpSection>
  );
}

/** Where to go: a map and directions for a venue, the ticket for an online event. */
export function Venue({ event }) {
  if (event.is_online) {
    return (
      <EpSection id="venue" title="Online event">
        <div className="ep-online">
          <span className="ep-online-icon">
            <Icon name="monitor" size={24} />
          </span>
          <div>
            <p className="ep-online-title">Join from anywhere</p>
            <p className="ep-online-text">The joining link is on your ticket once you register. Keep it handy — it opens when the event starts.</p>
          </div>
        </div>
      </EpSection>
    );
  }
  const hasPoint = event.lat !== null && event.lng !== null;
  const directions =
    safeHref(event.location_link) ||
    (hasPoint
      ? `https://www.google.com/maps/dir/?api=1&destination=${event.lat},${event.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location_name)}`);
  return (
    <EpSection id="venue" title="Venue">
      <div className="ep-venue">
        {hasPoint ? (
          <div className="ep-map">
            <iframe
              title={`Map of ${event.location_name || "the venue"}`}
              src={`https://www.google.com/maps?q=${event.lat},${event.lng}&z=15&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        ) : null}
        <div className="ep-venue-row">
          <span className="ep-tile ep-tile--icon" aria-hidden="true">
            <Icon name="pin" size={20} />
          </span>
          <div className="ep-venue-text">
            <p className="ep-venue-name">{event.location_name || "Venue to be announced"}</p>
            {hasPoint ? <p className="ep-venue-sub">Pinned on the map</p> : null}
          </div>
          <a className="dc-btn dc-btn--ghost dc-btn--sm ep-venue-go" href={directions} target="_blank" rel="noopener noreferrer">
            <Icon name="navigation" size={15} /> Get directions
          </a>
        </div>
      </div>
    </EpSection>
  );
}

export function Contact({ contact }) {
  const tel = contact.phone ? contact.phone.replace(/[^\d+]/g, "") : "";
  return (
    <EpSection id="contact" title="Questions?">
      <div className="ep-contact">
        <p className="ep-contact-lede">{contact.name ? `Reach ${contact.name}, who is organising this event.` : "Reach the organisers directly."}</p>
        <div className="ep-contact-links">
          {contact.email ? (
            <a className="ep-contact-link" href={`mailto:${contact.email}`}>
              <Icon name="mail" size={18} />
              <span>{contact.email}</span>
            </a>
          ) : null}
          {tel ? (
            <a className="ep-contact-link" href={`tel:${tel}`}>
              <Icon name="phone" size={18} />
              <span>{contact.phone}</span>
            </a>
          ) : null}
        </div>
      </div>
    </EpSection>
  );
}

/* ---------- loading ---------- */

/** The page's own shape while it loads: title, facts, poster and card, the first lines. */
export function EventSkeleton() {
  return (
    <div className="dc-wrap ep-layout" role="status" aria-busy="true" aria-label="Loading the event">
      <div className="ep-intro">
        <span className="dc-skel" style={{ display: "block", width: 96, height: 28, borderRadius: 999 }} />
        <span className="dc-skel" style={{ display: "block", width: "92%", height: 48, marginTop: 14 }} />
        <span className="dc-skel" style={{ display: "block", width: "58%", height: 48, marginTop: 8 }} />
        <span className="ep-skel-fact" style={{ marginTop: 22 }}>
          <span className="dc-skel" style={{ width: 44, height: 44, borderRadius: 999 }} />
          <span className="dc-skel" style={{ display: "block", width: 160, height: 16 }} />
        </span>
        {[0, 1, 2].map((i) => (
          <span key={i} className="ep-skel-fact">
            <span className="dc-skel" style={{ width: 48, height: 48, borderRadius: 10 }} />
            <span style={{ flex: 1 }}>
              <span className="dc-skel" style={{ display: "block", width: "62%", height: 16 }} />
              <span className="dc-skel" style={{ display: "block", width: "40%", height: 13, marginTop: 8 }} />
            </span>
          </span>
        ))}
      </div>
      <div className="ep-side">
        <div className="ep-poster dc-skel" />
        <div className="ep-cta ep-cta--skel" aria-hidden="true">
          <div className="ep-cta-row">
            <span style={{ flex: 1 }}>
              <span className="dc-skel" style={{ display: "block", width: 90, height: 30 }} />
              <span className="dc-skel" style={{ display: "block", width: "70%", height: 12, marginTop: 8 }} />
            </span>
            <span className="dc-skel ep-skel-btn" />
          </div>
        </div>
      </div>
      <div className="ep-body">
        {[100, 94, 97, 62].map((w, i) => (
          <span key={i} className="dc-skel dc-skel-line" style={{ display: "block", width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
