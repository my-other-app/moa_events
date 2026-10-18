"use client";

/**
 * The covers the site draws for an event (or a club) without a picture of
 * its own. A client component on purpose: a page that shows a dozen covers
 * sends each as a few numbers (its id, category and date) rather than its
 * whole drawing twice (as HTML and again as the page's data).
 */
import { useId } from "react";
import { coverLook, dateParts } from "@/utils/cover";
import { Motif, tidySvg } from "./coverart";

/** The drawn art of a cover, sized to its box. Decorative. */
export function CoverArt({ look, w = 100, h = 125 }) {
  const uid = `dc${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const flip = look.variant === 2;
  return (
    <svg className="dc-cover-art" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">
      <g transform={flip ? `translate(${w} 0) scale(-1 1)` : undefined}>
        {tidySvg(Motif({ motif: look.motif, w, h, c: look.palette, v: look.variant, uid }))}
      </g>
    </svg>
  );
}

/**
 * The cover we draw for an event without a poster: its category and a big
 * date over a pattern in the site's colours. Never the title — the card
 * says that once, underneath.
 */
export function EventCover({ event, label }) {
  const look = coverLook({ id: event.id, category: event.category });
  const date = dateParts(event.starts_at);
  const kind = label ?? (event.category?.name || (event.is_online ? "Online" : ""));
  return (
    <div className={`dc-cover dc-cover--${look.palette.name}`} style={{ background: look.palette.bg, color: look.palette.ink }} aria-hidden="true">
      <CoverArt look={look} />
      <div className="dc-cover-text">
        {kind ? <span className="dc-cover-kind">{kind}</span> : null}
        {date ? (
          <span className="dc-cover-date">
            <span className="dc-cover-day">{date.day}</span>
            <span className="dc-cover-mon">
              <span>{date.month}</span>
              <span>{date.weekday}</span>
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** A wide cover for a club with none of its own, in the same family as the event covers. */
export function ClubCover({ club, w = 160, h = 70 }) {
  const look = coverLook({ id: club?.slug || club?.id || club?.name });
  return (
    <div className={`dc-cover dc-cover--wide dc-cover--${look.palette.name}`} style={{ background: look.palette.bg }} aria-hidden="true">
      <CoverArt look={look} w={w} h={h} />
    </div>
  );
}

/** The little calendar leaf pinned to a poster: month over the day, in India time. */
export function DateBadge({ iso }) {
  const d = dateParts(iso);
  if (!d) return null;
  return (
    <span className="dc-datebadge" aria-hidden="true">
      <span className="dc-datebadge-mon">{d.month}</span>
      <span className="dc-datebadge-day">{d.day}</span>
    </span>
  );
}
