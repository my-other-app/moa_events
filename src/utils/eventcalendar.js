import { useEffect, useState } from "react";
import { calendarQuery, discoverApi } from "@/api/discover";
import { addDays, eventDays, firstOfMonth, lastOfMonth } from "./days";

/* ---------- how many events each day has ---------- */

const COUNTS_TTL = 2 * 60 * 1000;
const counts = new Map();

/** Forgets every month asked for so far (for tests). */
export function forgetCalendarCounts() {
  counts.clear();
}

/** A month's counts, shared by every calendar on the page and kept a couple of minutes; null when the API has none. */
function loadCounts(filters, where, month) {
  const key = JSON.stringify(calendarQuery(filters, where, month));
  const hit = counts.get(key);
  if (hit && Date.now() - hit.at < COUNTS_TTL) return hit.promise;
  const promise = discoverApi.calendar(filters, where, month).then(
    (c) => c.days,
    () => null
  );
  counts.set(key, { at: Date.now(), promise });
  return promise;
}

/**
 * {"YYYY-MM-DD": n} for the days of `month` that have events, with the
 * page's filters; null while it loads, or for good when the API can't say
 * (the calendar still works, just without the dots).
 */
export function useCalendarCounts(filters, where, month) {
  const key = JSON.stringify(calendarQuery(filters, where, month));
  const [state, setState] = useState({ key: null, days: null });
  useEffect(() => {
    let alive = true;
    loadCounts(filters, where, month).then((days) => {
      if (alive) setState({ key, days });
    });
    return () => {
      alive = false;
    };
  }, [filters, where, month, key]);
  return state.key === key ? state.days : null;
}

/* ---------- a month's events, by day ---------- */

/** Names shown in a day's square on a wide screen; the rest are "+N more". */
export const NAMES_PER_DAY = 3;

/**
 * The events of a month, by India day: an event on for several days is on
 * each of them, cut to the month. Each day's list is in starting order.
 */
export function eventsByDay(items, month) {
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  const days = new Map();
  for (const e of items || []) {
    const span = eventDays(e);
    if (!span || span[1] < first || span[0] > last) continue;
    const stop = span[1] > last ? last : span[1];
    for (let d = span[0] < first ? first : span[0], guard = 0; d <= stop && guard < 31; d = addDays(d, 1), guard += 1) {
      if (!days.has(d)) days.set(d, []);
      days.get(d).push({ event: e, first: d === span[0] });
    }
  }
  for (const list of days.values()) list.sort((a, b) => String(a.event.starts_at).localeCompare(String(b.event.starts_at)));
  return days;
}

/** How many events a month's page holds, whether or not the API kept to the month. */
export function monthCount(items, total, month) {
  const inMonth = new Set();
  let outside = false;
  for (const e of items || []) {
    const span = eventDays(e);
    if (span && span[1] >= firstOfMonth(month) && span[0] <= lastOfMonth(month)) inMonth.add(e.id);
    else outside = true;
  }
  return outside || items.length >= total ? inMonth.size : total;
}

