"use client";

import { useId } from "react";
import { CodeEntry } from "./codeentry";
import { QuestBoard } from "./board";
import { QuestIcon } from "./icons";
import { QuestMeter } from "./meter";
import { Rewards, TaskList } from "./parts";

const NO_FRESH = { ids: new Set(), line: "" };

/**
 * A guest's quest, laid out (utils/quests.js questView says what it says):
 * the head with their score, where the quest stands (not started, on,
 * ended; no ticket), the progress to the next milestone, what they've
 * unlocked and where to collect it, the tasks with the way to do each,
 * "Enter a code" while the quest has codes left, the rewards, and the
 * leaderboard where the organisers turned it on. No fetching here:
 * ./questcard.jsx does that.
 *
 * Without a ticket (`signedUp` false) it is the overview: what the quest
 * is, how to take part, and the tasks and rewards folded under one line.
 *
 * `where`: "ticket" (under the ticket, on teal) or "event" (a section of
 * the event's page). `fresh`: what a read just ticked ({ids, line}), which
 * pops once and is read out.
 */
export function QuestView({ quest, where = "ticket", onCode = null, onPickSize = null, loadBoard = null, fresh = NO_FRESH }) {
  const id = useId();
  const titleId = `${id}-title`;
  const { score, meter, next } = quest;
  const lists = (
    <>
      <div className="qs-block">
        <h3 className="qs-h3">{quest.signedUp ? "Your tasks" : "Tasks"}</h3>
        <TaskList tasks={quest.tasks} mode={quest.mode} fresh={fresh.ids} />
      </div>
      {quest.hasCodes && onCode ? (
        <div id="quest-code">
          <CodeEntry onSubmit={onCode} lockedLine={quest.codeLock} hint={quest.codeHint} />
        </div>
      ) : null}
      {quest.milestones.length ? (
        <div className="qs-block">
          <h3 className="qs-h3">Rewards</h3>
          <Rewards milestones={quest.milestones} onPickSize={quest.signedUp && quest.status === "open" ? onPickSize : null} fresh={fresh.ids} />
        </div>
      ) : null}
    </>
  );
  return (
    <section className={`qs dc-scope qs--${where}`} aria-labelledby={titleId} id="quests">
      <header className="qs-head">
        <div>
          <p className="qs-eyebrow">
            <QuestIcon name="quest" size={14} />
            Quest
          </p>
          <h2 className="qs-title" id={titleId}>
            {quest.title}
          </h2>
          {quest.intro ? <p className="qs-intro">{quest.intro}</p> : null}
        </div>
        {score ? (
          <p className="qs-score">
            <strong>{score.value}</strong>
            <span>{score.unit}</span>
            {quest.rank ? <span className="qs-rank">#{quest.rank}</span> : null}
          </p>
        ) : null}
      </header>

      {quest.notes.map((n) => (
        <p key={n.key} className={`qs-note${n.tone === "good" ? " qs-note--good" : ""}`}>
          <QuestIcon name={n.icon} size={18} />
          <span>{n.line}</span>
        </p>
      ))}

      {meter ? (
        <div className="qs-progress">
          <QuestMeter value={meter.value} max={meter.max} marks={meter.marks} label={meter.label} />
          {next ? <p className="qs-next">{next}</p> : null}
        </div>
      ) : null}

      {/* What a read of the card just ticked, said once for screen readers. */}
      <p className="dc-sr" role="status" aria-live="polite">
        {fresh.line}
      </p>

      {quest.signedUp ? (
        lists
      ) : (
        <details className="qs-more">
          <summary className="qs-more-toggle">
            <span>
              See the {quest.tasks.length === 1 ? "task" : `${quest.tasks.length} tasks`}
              {quest.milestones.length ? " and the rewards" : ""}
            </span>
            <QuestIcon name="go" size={16} className="qs-more-chev" />
          </summary>
          <div className="qs-more-body">{lists}</div>
        </details>
      )}

      {quest.leaderboard && loadBoard ? <QuestBoard load={loadBoard} mode={quest.mode} /> : null}
    </section>
  );
}
