import { useId, useState } from "react";
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
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
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

/** "Load more", with how far along the list is, and a retry when a page fails. */
export function LoadMore({ shown, total, busy, error, onMore, noun }) {
  if (!shown) return null;
  if (shown >= total && !error) {
    return <p className="dc-more">{shown > 6 ? `That's all ${shown} ${noun}.` : null}</p>;
  }
  return (
    <div className="dc-more">
      {error ? <p role="alert">Couldn't load more just now.</p> : null}
      <button type="button" className="dc-btn dc-btn--ghost" onClick={onMore} disabled={busy}>
        {busy ? "Loading…" : error ? "Try again" : "Load more"}
      </button>
      <span>
        Showing {shown} of {total}
      </span>
    </div>
  );
}
