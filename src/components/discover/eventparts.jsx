import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { liveApi } from "@/api/live";
import { competitionApi } from "@/api/competition";
import { roomIsActive } from "@/utils/live";
import { formatCount, formatPrice, imageUrl, statusPill } from "@/utils/format";
import { linkify, safeHref } from "@/utils/linkify";
import { buildIcs, calendarTimes, googleCalendarUrl, icsFilename, icsHref } from "@/utils/calendar";
import { eventEnd, eventPath, registerState, seatsLeft, summary, whenLine } from "@/utils/eventpage";
import { Img } from "./bits";
import { EventCover } from "./cover";
import Icon from "./icons";

/* ---------- small things ---------- */

/** Icons only this page needs, drawn like the rest (Feather-style, decorative). */
const PATHS = {
  share: (
    <>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </>
  ),
  calendarPlus: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="12" y1="13" x2="12" y2="19" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <line x1="13" y1="6" x2="13" y2="18" strokeDasharray="2 2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 6h3v1a4 4 0 0 1-4 4" />
      <path d="M7 6H4v1a4 4 0 0 0 4 4" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  check: <polyline points="20 6 9 17 4 12" />,
  directions: (
    <>
      <polygon points="12 2 22 12 12 22 2 12 12 2" />
      <path d="M9 13v-2a1 1 0 0 1 1-1h5" />
      <polyline points="13 8 15 10 13 12" />
    </>
  ),
};

export function EpIcon({ name, size = 18 }) {
  if (!PATHS[name]) return <Icon name={name} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

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

/** A club's typed text: paragraphs and line breaks kept, links made clickable, never parsed as HTML. */
export function RichText({ text, className = "" }) {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim());
  return (
    <div className={`ep-rich ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {linkify(p).map((t, j) =>
            t.type === "link" ? (
              <a key={j} href={t.href} target={t.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer nofollow ugc">
                {t.value}
              </a>
            ) : (
              t.value
            )
          )}
        </p>
      ))}
    </div>
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
  return <EventCover event={event} />;
}

/** The poster at 4:5 with the status pill on it, or the generated cover. Not lazy: it's the first thing seen. */
export function Poster({ event }) {
  const src = imageUrl(event.poster, "original");
  const [failed, setFailed] = useState(null);
  const pill = statusPill(event);
  return (
    <div className="ep-poster">
      {src && failed !== src ? (
        <img src={src} alt={`Poster for ${event.name}`} decoding="async" fetchPriority="high" onError={() => setFailed(src)} />
      ) : (
        <Cover event={event} />
      )}
      {pill ? <span className={`dc-pill dc-pill--${pill.tone}`}>{pill.label}</span> : null}
    </div>
  );
}

/* ---------- share and calendar ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* no clipboard API, or not allowed: try the old way */
  }
  try {
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Share through the phone's own sheet; where there is none, copy the link and say so. */
export function ShareButton({ title, text, url }) {
  const [said, setSaid] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = (line) => {
    setSaid(line);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(""), 2600);
  };
  const share = async () => {
    const data = { title, text, url };
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    say((await copyText(url)) ? "Link copied" : `Copy this link: ${url}`);
  };
  return (
    <span className="ep-actionwrap">
      <button type="button" className="ep-action" onClick={share}>
        <EpIcon name="share" size={17} />
        Share
      </button>
      <span className={`ep-toast${said ? " is-on" : ""}`} role="status" aria-live="polite">
        {said ? (
          <>
            <EpIcon name="check" size={14} />
            {said}
          </>
        ) : null}
      </span>
    </span>
  );
}

/** "Add to calendar": Google Calendar, or an .ics file for Apple Calendar, Outlook and the rest. */
export function CalendarButton({ event, url }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const button = useRef(null);
  const menuId = useId();
  const cal = useMemo(() => {
    const times = calendarTimes(event.starts_at, eventEnd(event));
    if (!times) return null;
    const location = event.is_online ? `Online — ${url}` : event.location_name || "";
    const about = summary(event.about, 600);
    const details = [about, `Event page: ${url}`].filter(Boolean).join("\n\n");
    return {
      google: googleCalendarUrl({ title: event.name, start: times.start, end: times.end, details, location }),
      ics: icsHref(buildIcs({ uid: `event-${event.id}@myotherapp.in`, title: event.name, start: times.start, end: times.end, description: details, location, url })),
      filename: icsFilename(event.slug || event.name),
    };
  }, [event, url]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  if (!cal) return null;
  return (
    <div className="ep-cal" ref={box}>
      <button ref={button} type="button" className="ep-action" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen((o) => !o)}>
        <EpIcon name="calendarPlus" size={17} />
        Add to calendar
      </button>
      <div id={menuId} className="ep-cal-menu" hidden={!open}>
        <a href={cal.google} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
          Google Calendar
        </a>
        <a href={cal.ics} download={cal.filename} onClick={() => setOpen(false)}>
          Apple, Outlook and others (.ics)
        </a>
      </div>
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

/* ---------- in-page navigation ---------- */

/** The tab bar under the hero: one link per section that has something in it; the one in view is marked. */
export function SectionNav({ items }) {
  const [active, setActive] = useState(items[0]?.id || null);
  const ids = items.map((i) => i.id).join(",");
  const bar = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const order = ids.split(",");
    let frame = 0;
    // The section being read is the last one whose top has passed under the tab bar.
    const look = () => {
      frame = 0;
      const line = (bar.current?.getBoundingClientRect().bottom || 0) + 24;
      let current = order[0];
      for (const id of order) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // At the very bottom, the last section is the one being read, however short.
      const root = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= root.scrollHeight - 4) {
        const last = [...order].reverse().find((id) => document.getElementById(id));
        if (last) current = last;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(look);
    };
    look();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [ids]);
  if (items.length < 2) return null;
  return (
    <nav ref={bar} className="ep-tabs" aria-label="On this page">
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className={active === i.id ? "is-on" : undefined} aria-current={active === i.id ? "location" : undefined}>
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
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

/* ---------- the room and the competition ---------- */

/**
 * The strips over the page while something is on: the live room (polled
 * every half minute until the event ends) and the competition, if any.
 */
export function LiveStrips({ event }) {
  const [live, setLive] = useState(null);
  const [competition, setCompetition] = useState(null);
  const id = event.id;
  const ended = event.status === "ended";

  useEffect(() => {
    let alive = true;
    competitionApi
      .leaderboard(id)
      .then((b) => alive && setCompetition(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    let alive = true;
    const look = () =>
      liveApi
        .fetchFeed(id)
        .then((f) => alive && setLive(f))
        .catch(() => {});
    look();
    const t = ended ? null : setInterval(look, 30000);
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [id, ended]);

  const roomOn = roomIsActive(live);
  if (!roomOn && !competition?.enabled) return null;
  return (
    <div className="ep-strips">
      {roomOn ? (
        <div className="ep-strip ep-strip--live" role="status">
          <div className="ep-strip-text">
            <span className="ep-strip-tag">Live now</span>
            <p>{live.banner ? live.banner.text : live.quiz?.live ? "The quiz is on — join with the code on the screen" : live.poll ? live.poll.prompt : "Questions are being taken from the floor"}</p>
          </div>
          <Link className="dc-btn dc-btn--accent dc-btn--sm" to={eventPath(event, "live")}>
            Open the live room
          </Link>
        </div>
      ) : null}
      {competition?.enabled ? (
        <div className="ep-strip" role="status">
          <div className="ep-strip-text">
            <span className="ep-strip-tag ep-strip-tag--plain">Competition</span>
            <p>{competition.public && competition.rows?.length ? `${competition.rows[0].name} leads the board` : "Form a team from your ticket, pick a track, and hand in your work here."}</p>
          </div>
          <Link className="dc-btn dc-btn--ghost dc-btn--sm" to={eventPath(event, "compete")}>
            Your team
          </Link>
        </div>
      ) : null}
    </div>
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
