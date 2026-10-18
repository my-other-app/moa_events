"use client";

import { useId, useState } from "react";
import { dateTile, scheduleLines, seatsLeft, whenLine } from "@/utils/eventpage";
import { imageUrl } from "@/utils/format";
import { rupees } from "@/utils/register";
import { EventCover } from "../discover/cover";
import { EpIcon } from "../discover/eventparts";
import Icon from "../discover/icons";

/**
 * What you are signing up for, beside the form: the event, when and where,
 * and what it adds up to. A sticky card on a desk; on a phone, a compact card
 * over the form whose order summary opens on a tap.
 */

/** The poster, small; the drawn cover when there is none (or it fails). */
export function Thumb({ event, className = "" }) {
  const src = imageUrl(event.poster, "medium") || imageUrl(event.poster_thumb, "medium");
  const [failed, setFailed] = useState(null);
  return (
    <span className={`rg-thumb ${className}`}>
      {src && failed !== src ? <img src={src} alt="" decoding="async" onError={() => setFailed(src)} /> : <EventCover event={event} />}
    </span>
  );
}

const money = (n) => (n === null || n === undefined ? "Paid" : n > 0 ? rupees(n) : "Free");

export function Lines({ lines, total }) {
  return (
    <div className="rg-lines">
      <ul>
        {lines.map((l) => (
          <li key={l.id}>
            <span className="rg-line-label">
              {l.label}
              {l.sub ? <span className="rg-line-sub">{l.sub}</span> : null}
            </span>
            <span className="rg-line-amount">{money(l.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="rg-total">
        <span>Total</span>
        <strong>{total === null ? "—" : total > 0 ? rupees(total) : "Free"}</strong>
      </p>
    </div>
  );
}

export function Summary({ event, club, lines = null, total = null, picked = false }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const sched = scheduleLines(event);
  const tile = dateTile(event.starts_at);
  const where = event.is_online ? "Online" : event.location_name || "Venue to be announced";
  const left = seatsLeft(event);
  const brief = [whenLine(event.starts_at), where].filter(Boolean).join(" · ");
  const hasOrder = Array.isArray(lines);

  return (
    <aside className={`rg-sum${open ? " is-open" : ""}`} aria-label="Your registration">
      <div className="rg-sum-head">
        <Thumb event={event} />
        <div className="rg-sum-id">
          {event.category ? <span className="rg-sum-cat">{event.category.name}</span> : null}
          <p className="rg-sum-name">{event.name}</p>
          {club?.name ? <p className="rg-sum-club">by {club.name}</p> : null}
          {brief ? <p className="rg-sum-brief">{brief}</p> : null}
        </div>
      </div>

      <ul className="rg-sum-facts">
        {sched ? (
          <li>
            {tile ? (
              <span className="ep-tile" aria-hidden="true">
                <span>{tile.month}</span>
                <strong>{tile.day}</strong>
              </span>
            ) : null}
            <span className="rg-sum-fact">
              <time dateTime={event.starts_at}>{sched.day}</time>
              <span>{sched.time}</span>
            </span>
          </li>
        ) : null}
        <li>
          <span className="ep-tile ep-tile--icon" aria-hidden="true">
            <Icon name={event.is_online ? "monitor" : "pin"} size={20} />
          </span>
          <span className="rg-sum-fact">
            <span className="rg-sum-where">{where}</span>
            {event.is_online ? <span>The joining link comes with your ticket</span> : null}
          </span>
        </li>
      </ul>

      {hasOrder ? (
        <>
          <button type="button" className="rg-sum-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
            <span>{open ? "Hide order summary" : "Show order summary"}</span>
            <svg className="rg-sum-chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
              <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <strong>{total === null ? "Paid" : total > 0 ? rupees(total) : "Free"}</strong>
          </button>
          <div className="rg-sum-body" id={bodyId}>
            <Lines lines={lines} total={total} />
            <ul className="rg-included" aria-label="What's included">
              <li>
                <EpIcon name="check" size={15} />
                Your ticket, by email and in the MyOtherApp app
              </li>
              {event.is_online ? (
                <li>
                  <EpIcon name="check" size={15} />
                  The joining link, on your ticket
                </li>
              ) : (
                <li>
                  <EpIcon name="check" size={15} />
                  Entry with the QR code on your ticket
                </li>
              )}
              {picked ? (
                <li>
                  <EpIcon name="check" size={15} />
                  Add-ons to collect at the event
                </li>
              ) : null}
            </ul>
            {left !== null && left > 0 && left <= 10 ? <p className="rg-sum-seats">Only {left === 1 ? "1 seat" : `${left} seats`} left</p> : null}
          </div>
        </>
      ) : null}
    </aside>
  );
}
