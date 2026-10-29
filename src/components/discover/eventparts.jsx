import { Link } from "@/lib/router";
import { formatCount, formatPrice, imageUrl, statusPill } from "@/utils/format";
import { safeHref } from "@/utils/linkify";
import { appliedCount, peopleLine, registerState, seatsLeft, whenLine } from "@/utils/eventpage";
import { CANCELLED_TITLE, cancelledLine } from "@/utils/cancelled";
import { approvalNote, nobodyGoingLine } from "@/utils/requests";
import { Img } from "./img";
import { LogoImg, PosterImg } from "./picture";
import { coverFields } from "@/utils/cover";
import { EventCover } from "./cover";
import Icon from "./icons";
import { EpIcon } from "./eventbits";
import { RegisterGo } from "../register/registercta";

/*
 * The event page's parts. What is defined here has no state and renders on
 * the server (the page sends it as HTML, with no script). The parts that
 * react to the reader — the poster's fallback, Share, Add to calendar, the
 * section tabs, the live strip, "Read more" — are the client islands in
 * eventislands.jsx, re-exported here so callers import from one place; the
 * register button (Finish payment, or the ticket, for someone signed in) is
 * the registration flow's own, in register/registercta.jsx.
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
 * Never cropped: a poster of another shape shows whole, on a soft blurred
 * copy of itself (PosterImg). The original: the frame is up to about 560px
 * wide on a phone, more than half the large size. Not lazy: it's the first
 * thing seen. A poster that fails to load gives way to the cover (the one
 * client part, in picture.jsx).
 */
export function Poster({ event }) {
  const src = imageUrl(event.poster, "original");
  const pill = statusPill(event);
  return (
    <div className="ep-poster">
      {src ? (
        <PosterImg src={src} alt={`Poster for ${event.name}`} loading="eager" fetchPriority="high" width="800" height="1000" fallback={<Cover event={event} />} />
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
export function RegisterCard({ event, club = null }) {
  const state = registerState(event);
  // The club reviews every registration (registration approval): said beside the button while registration is open.
  const approval = event.requires_approval === true && (state.kind === "open" || (state.kind === "live" && Boolean(state.also)));
  const left = seatsLeft(event);
  const applied = appliedCount(event) !== null;
  const when = whenLine(event.starts_at);
  const taken = event.capacity && left !== null ? Math.min(event.capacity, Math.max(0, event.capacity - left)) : 0;
  const showMeter = event.capacity && (state.kind === "open" || state.kind === "full");
  const cancelled = state.kind === "cancelled";
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
          <p className="ep-cta-price">{cancelled ? "Cancelled" : formatPrice(event.has_fee, event.fee)}</p>
          {state.note ? <p className={`ep-cta-note${state.tone === "warn" ? " is-warn" : ""}`}>{state.note}</p> : null}
        </div>
        <div className="ep-cta-go">
          {/* The button, the same for everyone in the HTML; signed in, it becomes Finish payment or the ticket (a client island). */}
          <RegisterGo
            eventId={String(event.id)}
            state={{ kind: state.kind, label: state.label, href: state.href || null, also: state.also ? { label: state.also.label, href: state.also.href } : null }}
            approval={event.requires_approval === true}
          />
        </div>
      </div>
      {approval ? (
        <p className="ep-cta-approval">
          <EpIcon name="check" size={14} />
          <span>{approvalNote(club)}</span>
        </p>
      ) : null}
      {showMeter ? (
        <div className={`ep-meter${applied ? " ep-meter--applied" : ""}`}>
          {/* Where the club reviews registrations it decides who gets in: how many applied, and no bar of seats. */}
          {applied ? null : (
            <span className="ep-meter-bar" role="img" aria-label={`${formatCount(taken)} of ${formatCount(event.capacity)} seats taken`}>
              <span style={{ width: `${Math.round((taken / event.capacity) * 100)}%` }} />
            </span>
          )}
          <span className="ep-meter-text">
            {peopleLine(event) || nobodyGoingLine(event, club)}
            {left !== null && left > 0 ? ` · ${formatCount(left)} ${left === 1 ? "seat" : "seats"} left` : ""}
          </span>
        </div>
      ) : null}
      {cancelled ? <p className="ep-cta-refund">Anyone who paid online is being refunded in full.</p> : null}
    </div>
  );
}

/**
 * A cancelled event, said at the top of its page: that it is off, the
 * club's reason, and what happens to the money. The page stays up (its link
 * is in emails and on posters), but nothing on it can be registered or paid.
 */
export function CancelledNotice({ event }) {
  if (event.status !== "cancelled") return null;
  const c = event.cancellation || {};
  return (
    <div className="ep-cancelled" role="note" aria-label="This event was cancelled">
      <p className="ep-cancelled-title">{CANCELLED_TITLE}</p>
      {c.reason ? (
        <p className="ep-cancelled-reason">
          <span className="ep-cancelled-why">The organisers said:</span> {c.reason}
        </p>
      ) : null}
      <p className="ep-cancelled-text">
        {cancelledLine(c)}. Tickets for it are no longer valid, and anyone who paid online is being refunded in full — it goes back the way they paid,
        usually within 5–7 working days.
      </p>
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

/**
 * The event's own sponsors, or its partners: square tiles, each with the
 * logo on white (LogoImg: a square one fills the tile, any other shape is
 * whole with room, never cropped; the initials while it loads or without
 * one), the name, and the label under it. A tile with a link opens it in a new tab;
 * a sponsor's is marked `sponsored`, as search engines ask of paid links.
 */
export function Backers({ kind, items }) {
  const sponsors = kind === "sponsor";
  const title = sponsors ? (items.length === 1 ? "Sponsor" : "Sponsors") : items.length === 1 ? "Partner" : "Partners";
  return (
    <EpSection id={sponsors ? "sponsors" : "partners"} title={title}>
      <ul className="ep-backers">
        {items.map((b, i) => {
          const href = b.link ? safeHref(b.link) : null;
          const body = (
            <>
              <span className="ep-backer-logo">
                <span aria-hidden="true">{initials(b.name)}</span>
                <LogoImg src={b.logo} alt="" />
              </span>
              <span className="ep-backer-name">{b.name}</span>
              {b.label ? <span className="ep-backer-label">{b.label}</span> : null}
            </>
          );
          return (
            <li key={b.id ?? `${b.name}-${i}`}>
              {href && href.startsWith("https:") ? (
                <a className="ep-backer ep-backer--link" href={href} target="_blank" rel={sponsors ? "sponsored noopener noreferrer" : "noopener noreferrer"} aria-label={`${b.name}${b.label ? `, ${b.label}` : ""} (opens in a new tab)`}>
                  {body}
                </a>
              ) : (
                <div className="ep-backer">{body}</div>
              )}
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
