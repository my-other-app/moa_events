"use client";

/**
 * A poll's results, drawn the way the organiser chose (CONTRACT 7.1
 * `chart`, `show`): columns, a donut, or a word cloud. The bars behind a
 * choice poll's own buttons are today's look and stay in the poll card;
 * these are the other kinds. Every chart is backed by text (each row's label
 * and number, in a list), so the numbers are there to read without the
 * picture and a screen reader reads the list.
 */
const PALETTE = ["#DC2626", "#2563EB", "#D97706", "#16A34A", "#7C3AED", "#0891B2"];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "40%", "38 votes" or both, as the poll's `show` says. */
export function amount(row, show = "both", unit = ["vote", "votes"]) {
  const pct = `${Math.round(row.pct || 0)}%`;
  const count = plural(row.count || 0, unit[0], unit[1]);
  if (show === "percent") return pct;
  if (show === "count") return count;
  return `${pct} · ${count}`;
}

const colourOf = (theme, i) => (theme ? `var(--lt-a${i % 6})` : PALETTE[i % PALETTE.length]);

/** Word sizes from counts: the most said word is twice the size of the least. */
export const sizes = (words) => {
  if (!words.length) return [];
  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));
  return words.map((w) => ({ ...w, px: 14 + (max === min ? 8 : (18 * (w.count - min)) / (max - min)) }));
};

export function Cloud({ words }) {
  if (!words.length) return null;
  return (
    <div className="live-words" aria-label="What the room said">
      {sizes(words).map((w) => (
        <span key={w.word} style={{ fontSize: w.px }}>
          {w.word}
        </span>
      ))}
    </div>
  );
}

/** Columns standing side by side, tallest the most picked. */
export function Columns({ rows, show, theme, unit }) {
  const top = Math.max(1, ...rows.map((r) => r.pct || 0));
  return (
    <ol className="lt-columns" aria-label="Results">
      {rows.map((r, i) => (
        <li key={r.label}>
          <span className="lt-col-num">{amount(r, show, unit)}</span>
          <span className="lt-col-track" aria-hidden="true">
            <span className="lt-col-bar" style={{ transform: `scaleY(${(r.pct || 0) / top})`, background: colourOf(theme, i) }} />
          </span>
          <span className="lt-col-label">{r.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** A ring cut into each answer's share, with the list beside it saying what each colour is. */
export function Donut({ rows, show, theme, unit }) {
  const total = rows.reduce((s, r) => s + (r.count || 0), 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  let at = 0;
  return (
    <div className="lt-donut">
      <svg viewBox="0 0 100 100" width="120" height="120" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r={R} className="lt-donut-track" />
        {total > 0 &&
          rows.map((r, i) => {
            const part = (r.count || 0) / total;
            const seg = (
              <circle
                key={r.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={colourOf(theme, i)}
                strokeWidth="18"
                strokeDasharray={`${part * C} ${C}`}
                strokeDashoffset={-at * C}
                transform="rotate(-90 50 50)"
              />
            );
            at += part;
            return seg;
          })}
      </svg>
      <ul className="lt-legend" aria-label="Results">
        {rows.map((r, i) => (
          <li key={r.label}>
            <span className="lt-swatch" style={{ background: colourOf(theme, i) }} aria-hidden="true" />
            <span className="lt-legend-label">{r.label}</span>
            <span className="lt-legend-num">{amount(r, show, unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Plain bars, one row each (for words drawn as bars, and the tally of a poll question). */
export function Bars({ rows, show, unit, label = "Results" }) {
  return (
    <ol className="lt-bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label} className={r.mark ? "is-mine" : ""}>
          <span className="lt-bar-fill" style={{ transform: `scaleX(${Math.min(100, Math.max(0, r.pct || 0)) / 100})` }} aria-hidden="true" />
          <span className="lt-bar-label">{r.label}</span>
          <span className="lt-bar-num">{amount(r, show, unit)}</span>
        </li>
      ))}
    </ol>
  );
}

/** The chart a poll asked for, with the fallback the contract names (bars) for anything else. */
export default function Chart({ chart, rows, show, theme, unit }) {
  if (chart === "column") return <Columns rows={rows} show={show} theme={theme} unit={unit} />;
  if (chart === "donut") return <Donut rows={rows} show={show} theme={theme} unit={unit} />;
  return <Bars rows={rows} show={show} unit={unit} />;
}
