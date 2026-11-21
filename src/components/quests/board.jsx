"use client";

import { useEffect, useId, useState } from "react";
import { QuestIcon } from "./icons";

/**
 * The leaderboard, folded until asked for (only where the organisers turned
 * it on): read when first opened, then again each time it is opened. `load()`
 * resolves to `{rows: [{rank, name, points, me}], me: {rank, points} | null}`
 * or throws. Names are as the API gives them (a first name and an initial
 * unless the organisers allow full names).
 */
export function QuestBoard({ load, mode = "points" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [board, setBoard] = useState({ state: "idle", rows: [], me: null });

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setBoard((b) => ({ ...b, state: "loading" }));
    Promise.resolve()
      .then(load)
      .then(
        (b) => alive && setBoard({ state: "ready", rows: b?.rows || [], me: b?.me || null }),
        () => alive && setBoard((b) => ({ ...b, state: "error" })),
      );
    return () => {
      alive = false;
    };
  }, [open, load]);

  const unit = mode === "points" ? "points" : "tasks";
  const meShown = board.rows.some((r) => r.me);
  return (
    <div className="qs-board">
      <button type="button" className="qs-board-toggle" aria-expanded={open} aria-controls={`${id}-board`} onClick={() => setOpen((o) => !o)}>
        <QuestIcon name="trophy" size={16} />
        <span>Leaderboard</span>
        <QuestIcon name="go" size={16} className={`qs-board-chev${open ? " is-open" : ""}`} />
      </button>
      <div id={`${id}-board`} className="qs-board-body" hidden={!open}>
        {open && board.state === "loading" && board.rows.length === 0 ? <p className="qs-board-note">Loading the leaderboard…</p> : null}
        {open && board.state === "error" ? <p className="qs-board-note">The leaderboard didn&rsquo;t load. Try again in a moment.</p> : null}
        {open && board.state === "ready" && board.rows.length === 0 ? <p className="qs-board-note">Nobody is on the board yet.</p> : null}
        {board.rows.length > 0 ? (
          <ol className="qs-board-list" aria-label={`Leaderboard, by ${unit}`}>
            {board.rows.map((r) => (
              <li key={`${r.rank}-${r.name}`} className={`qs-board-row${r.me ? " is-me" : ""}`}>
                <span className="qs-board-rank">{r.rank}</span>
                <span className="qs-board-name">
                  {r.name}
                  {r.me ? <span className="qs-board-you"> (you)</span> : null}
                </span>
                <span className="qs-board-points">
                  {r.points}
                  <span className="dc-sr"> {unit}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {board.me && !meShown ? (
          <p className="qs-board-mine">
            You&rsquo;re <strong>#{board.me.rank}</strong> with {board.me.points} {unit}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
