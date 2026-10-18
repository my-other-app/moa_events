"use client";

import { useId, useState } from "react";
import { formatTotal } from "@/utils/format";

const WHOLE = new Intl.NumberFormat("en-IN");
import { Dialog } from "./bits";
import Icon from "./icons";

/** A labelled dropdown filter; turns the highlight on when it is not at its default. */
export function FilterSelect({ label, value, options, onChange, defaultValue = "" }) {
  const id = useId();
  const on = value !== defaultValue;
  return (
    <div className={`dc-select${on ? " is-on" : ""}`}>
      <label className="dc-select-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text, disabled]) => (
          <option key={v} value={v} disabled={disabled || undefined}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

const SORT_WORDS = { date: "Date", distance: "Distance", popular: "Popular", relevance: "Relevance" };

/**
 * The order of a list, as a pill that plainly opens: "Sort: Date ▾". The
 * real control is the native select laid over it, so it opens the
 * phone's own picker and works with every keyboard and screen reader.
 * `hint` explains an option that is switched off.
 */
export function SortSelect({ value, options, onChange, hint = "" }) {
  const hintId = useId();
  const word = SORT_WORDS[value] || options.find(([v]) => v === value)?.[1] || "Date";
  return (
    <div className="dc-sort" title={hint || undefined}>
      <Icon name="sort" size={16} />
      <span className="dc-sort-text" aria-hidden="true">
        Sort: <strong>{word}</strong>
      </span>
      <Icon name="chevronDown" size={16} className="dc-sort-caret" />
      <select aria-label="Sort by" aria-describedby={hint ? hintId : undefined} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text, disabled]) => (
          <option key={v} value={v} disabled={disabled || undefined}>
            {text}
          </option>
        ))}
      </select>
      {hint ? (
        <span id={hintId} className="dc-sr">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** List or calendar: two buttons, the one showing pressed. */
export function ViewToggle({ view, onChange }) {
  return (
    <div className="dc-viewtoggle" role="group" aria-label="View">
      <button type="button" aria-pressed={view === "list"} onClick={() => onChange("list")}>
        <Icon name="list" size={16} /> List
      </button>
      <button type="button" aria-pressed={view === "calendar"} onClick={() => onChange("calendar")}>
        <Icon name="calendar" size={16} /> Calendar
      </button>
    </div>
  );
}

/** The search on a find page. Give it `key={q}` so a new query from elsewhere resets it. */
export function FinderSearch({ initial = "", label, placeholder, onSearch }) {
  const [q, setQ] = useState(initial);
  const id = useId();
  return (
    <form
      className="dc-field"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(q.trim());
      }}
    >
      <Icon name="search" size={18} />
      <label className="dc-sr" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
      <button type="submit" className="dc-field-go">
        Search
      </button>
    </form>
  );
}

/** The filters as a bottom sheet, for phones. */
export function FilterSheet({ open, onClose, onClear, doneLabel = "Show results", children }) {
  const id = useId();
  return (
    <Dialog open={open} onClose={onClose} labelledBy={id} className="dc-sheet" backdropClassName="dc-sheet-backdrop">
      <div className="dc-sheet-grip" aria-hidden="true" />
      <div className="dc-sheet-head">
        <h2 id={id}>Filters</h2>
        <button type="button" className="dc-iconbtn" aria-label="Close filters" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </div>
      {children}
      <div className="dc-sheet-foot">
        {onClear ? (
          <button type="button" className="dc-btn dc-btn--ghost" onClick={onClear}>
            Clear all
          </button>
        ) : null}
        <button type="button" className="dc-btn" onClick={onClose}>
          {doneLabel}
        </button>
      </div>
    </Dialog>
  );
}

/**
 * "Load more", with how far along the list is, and a retry when a page
 * fails. A `total` of null means "more, but we don't know how many";
 * `capped`, that the API stopped counting at `total` (1,000+): more may
 * come past it, so the list goes on until a page comes back short.
 * `stopped`: there are more, but no further page can be asked for (an API
 * without cursors serves offsets up to 1,000 only).
 */
export function LoadMore({ shown, total, capped = false, stopped = false, busy, error, onMore, noun, label = "Load more", className = "" }) {
  if (!shown) return null;
  if (stopped && !error) return <p className={`dc-more ${className}`}>{`Showing the first ${WHOLE.format(shown)} ${noun}. Narrow the search or the filters to see the rest.`}</p>;
  if (total !== null && !capped && shown >= total && !error) {
    return <p className={`dc-more ${className}`}>{shown > 6 ? `That's all ${shown} ${noun}.` : null}</p>;
  }
  const where = total === null ? null : capped && shown >= total ? `Showing ${formatTotal(shown, true).slice(0, -1)}` : `Showing ${shown} of ${capped ? formatTotal(total, true) : total}`;
  return (
    <div className={`dc-more ${className}`}>
      {error ? <p role="alert">Couldn't load more just now.</p> : null}
      <button type="button" className="dc-btn dc-btn--ghost" onClick={onMore} disabled={busy}>
        {busy ? "Loading…" : error ? "Try again" : label}
      </button>
      {where ? <span>{where}</span> : null}
    </div>
  );
}
