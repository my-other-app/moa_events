import { useEffect, useId, useRef, useState } from "react";
import { useCalendarCounts } from "@/utils/eventcalendar";
import {
  WEEKDAYS,
  addDays,
  addMonths,
  dayName,
  daysBetween,
  firstOfMonth,
  istDay,
  monthLabel,
  monthOf,
  monthWeeks,
  rangeLabel,
  shiftMonths,
  weekdayIndex,
} from "@/utils/days";
import { Dialog } from "./bits";
import Icon from "./icons";

/* ---------- the month grid ---------- */

const plural = (n) => `${n} ${n === 1 ? "event" : "events"}`;

/**
 * Pick one day, or a first and a last: a Monday-first month in India
 * time, with a dot on the days that have something on. It is a grid in
 * the ARIA sense: one day is in the tab order, the arrow keys move a day
 * or a week, Home and End go to the week's ends, Page Up and Page Down
 * turn the month (with Shift, the year), Enter or Space picks.
 */
export function DatePicker({ filters, where, from = "", to = "", onApply }) {
  const today = istDay();
  const [start, setStart] = useState(from || null);
  const [end, setEnd] = useState(from ? to || from : null);
  const [focus, setFocus] = useState(from || today);
  const [month, setMonth] = useState(monthOf(from || today));
  const [hover, setHover] = useState(null);
  const days = useCalendarCounts(filters, where, month);
  const grid = useRef(null);
  const moved = useRef(false);
  const headingId = useId();
  const statusId = useId();

  const tabbable = monthOf(focus) === month ? focus : firstOfMonth(month);

  // Focus follows the keyboard (and only the keyboard: a click already put it there).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector(`[data-day="${tabbable}"]`)?.focus();
  }, [tabbable]);

  const go = (day) => {
    moved.current = true;
    setFocus(day);
    if (monthOf(day) !== month) setMonth(monthOf(day));
  };

  const turn = (n) => {
    setMonth(addMonths(month, n));
    setFocus(shiftMonths(tabbable, n));
  };

  const choose = (day) => {
    setFocus(day);
    if (!start || end || Math.abs(daysBetween(start, day)) > 365) {
      setStart(day);
      setEnd(null);
    } else if (day < start) {
      setEnd(start);
      setStart(day);
    } else {
      setEnd(day);
    }
  };

  const onKeyDown = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    let next = null;
    if (step) next = addDays(tabbable, step);
    else if (e.key === "Home") next = addDays(tabbable, -weekdayIndex(tabbable));
    else if (e.key === "End") next = addDays(tabbable, 6 - weekdayIndex(tabbable));
    else if (e.key === "PageUp") next = shiftMonths(tabbable, e.shiftKey ? -12 : -1);
    else if (e.key === "PageDown") next = shiftMonths(tabbable, e.shiftKey ? 12 : 1);
    if (!next) return;
    e.preventDefault();
    go(next);
  };

  // While the last day is still to pick, the span follows the pointer (or the keyboard focus).
  const reach = start && !end ? hover || start : end || start;
  const lo = start && reach < start ? reach : start;
  const hi = start && reach < start ? start : reach;

  let status;
  if (!start) status = "Pick a day, or a first and a last day.";
  else if (!end) status = `${rangeLabel(start, start, today)} — now pick the last day, or apply for just this one.`;
  else {
    const span = daysBetween(start, end) + 1;
    status = span > 1 ? `${rangeLabel(start, end, today)} · ${span} days` : rangeLabel(start, end, today);
  }

  return (
    <div className="dc-dp">
      <div className="dc-dp-head">
        <button type="button" className="dc-iconbtn" aria-label="Previous month" onClick={() => turn(-1)}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <h3 id={headingId} className="dc-dp-month" aria-live="polite">
          {monthLabel(month)}
        </h3>
        <button type="button" className="dc-iconbtn" aria-label="Next month" onClick={() => turn(1)}>
          <Icon name="chevronRight" size={20} />
        </button>
      </div>

      <table ref={grid} className="dc-dp-grid" role="grid" aria-labelledby={headingId} aria-describedby={statusId} onKeyDown={onKeyDown} onMouseLeave={() => setHover(null)}>
        <thead>
          <tr>
            {WEEKDAYS.map(([short, full]) => (
              <th key={short} scope="col" aria-label={full}>
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(month).map((week) => (
            <tr key={week.find(Boolean)}>
              {week.map((day, i) => {
                if (!day) return <td key={`blank-${i}`} role="gridcell" className="dc-dp-blank" />;
                const n = days?.[day] || 0;
                const edge = start && (day === lo || day === hi);
                const inside = start && day > lo && day < hi;
                const classes = [
                  "dc-dp-day",
                  edge ? "is-edge" : "",
                  day === lo && start ? "is-start" : "",
                  day === hi && start ? "is-end" : "",
                  inside ? "is-in" : "",
                  day === today ? "is-today" : "",
                  day < today ? "is-past" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const label = `${dayName(day)}${day === today ? ", today" : ""}${n ? `, ${plural(n)}` : ""}`;
                return (
                  <td key={day} role="gridcell" className={classes} aria-selected={Boolean(start && day >= lo && day <= hi && (end || day === start))}>
                    <button
                      type="button"
                      data-day={day}
                      data-autofocus={day === tabbable ? "" : undefined}
                      tabIndex={day === tabbable ? 0 : -1}
                      aria-label={label}
                      onClick={() => choose(day)}
                      onMouseEnter={() => setHover(day)}
                      onFocus={() => setHover(day)}
                    >
                      <span>{+day.slice(8, 10)}</span>
                      {n ? <span className="dc-dp-dot" aria-hidden="true" /> : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p id={statusId} className="dc-dp-status" aria-live="polite">
        {status}
      </p>
      <div className="dc-dp-foot">
        <button
          type="button"
          className="dc-btn dc-btn--ghost dc-btn--sm"
          disabled={!start}
          onClick={() => {
            setStart(null);
            setEnd(null);
          }}
        >
          Clear
        </button>
        <button type="button" className="dc-btn dc-btn--sm" disabled={!start} onClick={() => onApply(start, end || start)}>
          Apply
        </button>
      </div>
    </div>
  );
}

/* ---------- where the picker opens ---------- */

/**
 * Under the "When" filter on a wide screen: a panel that Escape, a click
 * outside or tabbing away closes, and that hands focus back to the filter.
 */
export function DatePopover({ open, onClose, children }) {
  const box = useRef(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    // Focus goes back where it was, or to the filter the panel hangs from.
    const was = document.activeElement;
    const before = was && was !== document.body ? was : box.current?.parentElement?.querySelector("select");
    box.current?.querySelector("[data-autofocus]")?.focus();
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) close.current?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current?.();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      // Back to the filter, unless the click that closed it went somewhere else.
      const now = document.activeElement;
      if ((!now || now === document.body) && before && typeof before.focus === "function") before.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={box}
      className="dc-datepop"
      role="dialog"
      aria-modal="false"
      aria-label="Pick dates"
      onBlur={(e) => {
        if (e.relatedTarget && box.current && !box.current.contains(e.relatedTarget)) close.current?.();
      }}
    >
      {children}
    </div>
  );
}

/** The same picker as a bottom sheet, on a phone. */
export function DateSheet({ open, onClose, children }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={id} className="dc-sheet dc-datesheet" backdropClassName="dc-sheet-backdrop">
      <div className="dc-sheet-grip" aria-hidden="true" />
      <div className="dc-sheet-head">
        <h2 id={id}>Pick dates</h2>
        <button type="button" className="dc-iconbtn" aria-label="Close dates" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
      {children}
    </Dialog>
  );
}
