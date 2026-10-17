import { useState } from "react";
import { Link } from "react-router-dom";
import { eventHref } from "@/utils/cover";
import { WEEKDAYS, addMonths, dayName, dayShort, istDay, monthLabel, monthOf, monthWeeks, monthWord } from "@/utils/days";
import { NAMES_PER_DAY, eventsByDay, useCalendarCounts } from "@/utils/eventcalendar";
import { formatTime } from "@/utils/format";
import { NARROW, useMedia } from "@/utils/media";
import { EmptyState, ErrorState } from "./bits";
import Icon from "./icons";
import "@/styles/calendar.css";

const plural = (n) => `${n} ${n === 1 ? "event" : "events"}`;
const shortTime = (iso) => formatTime(iso).replace(":00", "");

function MonthNav({ month, onMonth, headingId, level = 2 }) {
  const thisMonth = monthOf(istDay());
  const Heading = `h${level}`;
  return (
    <div className="dc-calview-head">
      <div className="dc-calview-nav">
        <button type="button" className="dc-iconbtn" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <Heading id={headingId} className="dc-calview-month" aria-live="polite">
          {monthLabel(month)}
        </Heading>
        <button type="button" className="dc-iconbtn" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
      {month !== thisMonth ? (
        <button type="button" className="dc-btn dc-btn--ghost dc-btn--sm" onClick={() => onMonth(thisMonth)}>
          This month
        </button>
      ) : null}
    </div>
  );
}

/** A wide screen: the month as a big grid, each day with up to three events by name. */
function MonthGrid({ month, byDay, counts, onDay, today }) {
  return (
    <table className="dc-calview-grid" aria-labelledby="dc-calview-month">
      <thead>
        <tr>
          {WEEKDAYS.map(([short, full]) => (
            <th key={short} scope="col">
              <span aria-hidden="true">{full.slice(0, 3)}</span>
              <span className="dc-sr">{full}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {monthWeeks(month).map((week) => (
          <tr key={week.find(Boolean)}>
            {week.map((day, i) => {
              if (!day) return <td key={`blank-${i}`} className="dc-calcell is-blank" />;
              const entries = byDay.get(day) || [];
              const count = Math.max(counts?.[day] || 0, entries.length);
              const shown = entries.slice(0, NAMES_PER_DAY);
              const more = count - shown.length;
              const cls = ["dc-calcell", day === today ? "is-today" : "", day < today ? "is-past" : "", count ? "has-events" : ""].filter(Boolean).join(" ");
              return (
                <td key={day} className={cls}>
                  <button type="button" className="dc-calcell-day" onClick={() => onDay(day)} aria-label={`${dayName(day)}${day === today ? ", today" : ""}: ${count ? plural(count) : "nothing on"}. Show this day.`}>
                    {+day.slice(8, 10)}
                  </button>
                  {shown.length ? (
                    <ul className="dc-calchips">
                      {shown.map(({ event, first }) => (
                        <li key={event.id}>
                          <Link className={`dc-calchip${event.status === "ended" ? " is-ended" : ""}`} to={eventHref(event)} title={event.name}>
                            {first && event.starts_at ? <time dateTime={event.starts_at}>{shortTime(event.starts_at)}</time> : null}
                            <span>{event.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {more > 0 ? (
                    <button type="button" className="dc-calmore" onClick={() => onDay(day)} aria-label={`${more} more on ${dayName(day)}`}>
                      +{more} more
                    </button>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AgendaDay({ day, entries, count, onDay, today }) {
  const more = count - entries.length;
  const headingId = `dc-agday-${day}`;
  return (
    <section className={`dc-agday${day < today ? " is-past" : ""}`} aria-labelledby={headingId}>
      <h3 id={headingId} className="dc-agday-head">
        <span className="dc-agday-num" aria-hidden="true">
          {+day.slice(8, 10)}
        </span>
        <span className="dc-agday-name" aria-hidden="true">
          {dayShort(day).split(" ")[0]}
        </span>
        {day === today ? (
          <span className="dc-agday-today" aria-hidden="true">
            Today
          </span>
        ) : null}
        <span className="dc-sr">
          {dayName(day)}
          {day === today ? ", today" : ""}
        </span>
      </h3>
      <ul className="dc-aglist">
        {entries.map(({ event, first }) => (
          <li key={event.id}>
            <Link className={`dc-agitem${event.status === "ended" ? " is-ended" : ""}`} to={eventHref(event)}>
              <span className="dc-agitem-time">{first && event.starts_at ? formatTime(event.starts_at) : "Continues"}</span>
              <span className="dc-agitem-body">
                <span className="dc-agitem-name">{event.name}</span>
                <span className="dc-agitem-meta">
                  {[event.club?.name, event.is_online ? "Online" : event.location_name].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Icon name="chevronRight" size={16} className="dc-agitem-go" />
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <button type="button" className="dc-calmore" onClick={() => onDay(day)}>
          {entries.length ? `+${more} more on ${dayShort(day)}` : `${plural(more)} — show them`}
        </button>
      ) : null}
    </section>
  );
}

/** A phone: the month as a list, a heading per day. Past days of this month fold away. */
function MonthAgenda({ month, byDay, counts, onDay, today }) {
  const [earlier, setEarlier] = useState(false);
  const days = [...new Set([...byDay.keys(), ...Object.keys(counts || {}).filter((d) => monthOf(d) === month)])].sort();
  if (!days.length) return null;
  const past = month === monthOf(today) ? days.filter((d) => d < today) : [];
  const shown = earlier ? days : days.filter((d) => !past.includes(d));
  return (
    <div className="dc-agenda">
      {past.length && !earlier ? (
        <button type="button" className="dc-agenda-earlier" onClick={() => setEarlier(true)}>
          <Icon name="chevronDown" size={16} /> Earlier this month · {past.length} {past.length === 1 ? "day" : "days"}
        </button>
      ) : null}
      {shown.map((day) => {
        const entries = byDay.get(day) || [];
        return <AgendaDay key={day} day={day} entries={entries} count={Math.max(counts?.[day] || 0, entries.length)} onDay={onDay} today={today} />;
      })}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="dc-calview-skel" role="status" aria-label="Loading the calendar">
      {Array.from({ length: 35 }, (_, i) => (
        <span key={i} className="dc-skel" />
      ))}
    </div>
  );
}

/**
 * Find events as a calendar. The month's counts come from the calendar
 * API (when it has one) and the names from the month's events; picking a
 * day goes back to the list, for just that day.
 */
export function CalendarView({ filters, where, month, items, status, onMonth, onDay, onRetry }) {
  const narrow = useMedia(NARROW);
  const counts = useCalendarCounts(filters, where, month);
  const today = istDay();
  const byDay = eventsByDay(items, month);
  const empty = status === "ready" && !byDay.size && !Object.keys(counts || {}).some((d) => monthOf(d) === month);

  let body;
  if (status === "loading") body = <GridSkeleton />;
  else if (status === "error") body = <ErrorState message="We couldn't load this month right now. Check your connection and try again." onRetry={onRetry} />;
  else if (empty)
    body = (
      <EmptyState title={`Nothing on in ${monthWord(month)}`} message="Try the next month, or fewer filters.">
        <button type="button" className="dc-btn dc-btn--ghost" onClick={() => onMonth(addMonths(month, 1))}>
          {monthWord(addMonths(month, 1))} <Icon name="arrowRight" size={16} />
        </button>
      </EmptyState>
    );
  else if (narrow) body = <MonthAgenda month={month} byDay={byDay} counts={counts} onDay={onDay} today={today} />;
  else body = <MonthGrid month={month} byDay={byDay} counts={counts} onDay={onDay} today={today} />;

  return (
    <section className={`dc-calview${narrow ? " is-narrow" : ""}`} aria-labelledby="dc-calview-month">
      <MonthNav month={month} onMonth={onMonth} headingId="dc-calview-month" />
      {body}
    </section>
  );
}
