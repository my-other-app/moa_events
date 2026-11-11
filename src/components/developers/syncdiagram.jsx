/*
 * "Syncing both ways" as a sequence diagram: your system, MyOtherApp and
 * the club's team, and the messages between them, as an inline SVG drawn
 * with the site's colours (classes in styles/developers.css). The same
 * steps follow as a numbered list, which is what screen readers are
 * pointed to and what a phone shows best.
 */

const LANES = [
  { key: "you", name: "Your system", x: 130 },
  { key: "moa", name: "MyOtherApp", x: 440 },
  { key: "club", name: "Club's team", x: 680 },
];
const X = Object.fromEntries(LANES.map((l) => [l.key, l.x]));

/** [from, to, first line, second line, answer?] — and one note, after the second. */
export const SYNC_STEPS = [
  ["you", "moa", "POST /events", "external_id: erp-ev-2026-114", false],
  ["moa", "you", "201 Created", "id 8812 and its ETag: keep both", true],
  ["club", "moa", "Edits the venue", "in the dashboard", false],
  ["moa", "you", "Webhook: event.updated", "origin: dashboard", false],
  ["you", "moa", "200, within 10 seconds", "", true],
  ["you", "moa", "PATCH /events/8812", "If-Match: the ETag you have", false],
  ["moa", "you", "200, or 412 if it changed", "since: read it again", true],
  ["you", "moa", "GET /events?updated_since=…", "every 15 minutes", false],
  ["moa", "you", "What changed since then", "including anything a webhook missed", true],
];

/** The steps in words, for the list under the picture. */
export const SYNC_STEP_WORDS = [
  "Your system creates the event on MyOtherApp, with its own id as external_id.",
  "MyOtherApp answers 201 with the event's id and ETag. Your system keeps both. No webhook comes back to your own endpoints for this change.",
  "Someone in the club's team edits the venue in the dashboard.",
  "MyOtherApp sends your endpoint event.updated, with origin dashboard and the old venue in data.previous.",
  "Your endpoint answers 200 within 10 seconds, and updates your copy afterwards.",
  "Later, your system changes the event with PATCH, sending the ETag it has as If-Match.",
  "MyOtherApp answers 200, or 412 if the event changed since: then your system reads it again and decides.",
  "Every 15 minutes, your system asks for everything changed since its last catch-up (updated_since).",
  "MyOtherApp answers with what changed, including anything a webhook didn't bring.",
];

const TOP = 16;
const HEAD = 40;
const FIRST = 126;
const STEP = 62;
const NOTE_H = 36;
const WIDTH = 790;

function rowY(i) {
  // The note sits between steps 2 and 3.
  return FIRST + i * STEP + (i >= 2 ? NOTE_H + 16 : 0);
}

export function SyncDiagram() {
  const bottom = rowY(SYNC_STEPS.length - 1) + 40;
  const noteY = rowY(1) + 24;
  return (
    <figure className="dv-diagram" aria-labelledby="dv-sync-caption">
      <div className="dv-diagram-scroll">
        <svg viewBox={`0 0 ${WIDTH} ${bottom}`} width={WIDTH} height={bottom} role="img" aria-labelledby="dv-sync-title dv-sync-desc" className="dv-sd">
          <title id="dv-sync-title">Syncing both ways, step by step</title>
          <desc id="dv-sync-desc">A sequence diagram between your system, MyOtherApp and the club&apos;s team. The same steps are listed below it.</desc>
          <defs>
            <marker id="dv-sd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="dv-sd-head" />
            </marker>
            <marker id="dv-sd-arrow-soft" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" className="dv-sd-head dv-sd-head--soft" />
            </marker>
          </defs>
          {LANES.map((l) => (
            <g key={l.key}>
              <rect x={l.x - 80} y={TOP} width="160" height={HEAD} rx="8" className={`dv-sd-lane${l.key === "moa" ? " dv-sd-lane--moa" : ""}`} />
              <text x={l.x} y={TOP + HEAD / 2 + 5} textAnchor="middle" className="dv-sd-lanename">
                {l.name}
              </text>
              <line x1={l.x} y1={TOP + HEAD} x2={l.x} y2={bottom - 8} className="dv-sd-life" />
            </g>
          ))}
          <rect x={X.you - 70} y={noteY} width={X.moa - X.you + 140} height={NOTE_H} rx="6" className="dv-sd-note" />
          <text x={(X.you + X.moa) / 2} y={noteY + NOTE_H / 2 + 5} textAnchor="middle" className="dv-sd-notetext">
            No echo: nothing comes back to you for 1
          </text>
          {SYNC_STEPS.map(([from, to, line1, line2, answer], i) => {
            const y = rowY(i);
            const x1 = X[from];
            const x2 = X[to];
            const dir = x2 > x1 ? 1 : -1;
            const mid = (x1 + x2) / 2;
            return (
              <g key={i}>
                <circle cx="22" cy={y - 14} r="11" className="dv-sd-badge" />
                <text x="22" y={y - 10} textAnchor="middle" className="dv-sd-badgetext">
                  {i + 1}
                </text>
                <text x={mid} y={line2 ? y - 24 : y - 10} textAnchor="middle" className="dv-sd-label">
                  {line1}
                </text>
                {line2 ? (
                  <text x={mid} y={y - 9} textAnchor="middle" className="dv-sd-sub">
                    {line2}
                  </text>
                ) : null}
                <line
                  x1={x1 + dir * 4}
                  y1={y}
                  x2={x2 - dir * 6}
                  y2={y}
                  className={answer ? "dv-sd-msg dv-sd-msg--answer" : "dv-sd-msg"}
                  markerEnd={`url(#${answer ? "dv-sd-arrow-soft" : "dv-sd-arrow"})`}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption id="dv-sync-caption" className="dv-diagram-caption">
        <strong>The steps</strong>
        <ol>
          {SYNC_STEP_WORDS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
