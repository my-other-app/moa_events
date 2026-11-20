"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { QuestIcon } from "./icons";

const NONE = new Set();

/** The one way to go and do a task: a page of the site, the live room, or the app's intent link. */
function ActionLink({ action }) {
  if (!action?.href) return null;
  const inner = (
    <>
      <span>{action.label}</span>
      <QuestIcon name="go" size={14} />
    </>
  );
  // An intent link, or an address the API gave on another host: a plain link.
  if (action.external || action.href.startsWith("intent:")) {
    return (
      <a className="qs-act" href={action.href}>
        {inner}
      </a>
    );
  }
  return (
    <Link className="qs-act" href={action.href}>
      {inner}
    </Link>
  );
}

/**
 * One task: its tick, what it is, how far along (3 of 5 people), what to
 * do, its own time, its points, and the button to go and do it. A task is
 * never ticked here: the server says when it's done.
 */
function TaskRow({ task, mode, isNew }) {
  const { done } = task;
  const pts = mode === "points" && task.points > 0 ? task.points : null;
  return (
    <li className={`qs-task${done ? " is-done" : ""}${task.locked ? " is-later" : ""}`}>
      <span className={`qs-tick${done ? " is-done" : ""}${isNew ? " is-new" : ""}`} aria-hidden="true">
        {done ? <QuestIcon name="done" size={14} /> : null}
      </span>
      <div className="qs-task-body">
        <p className="qs-task-title">
          <span className="dc-sr">{done ? "Done: " : "To do: "}</span>
          {task.title}
          {task.required ? <span className="qs-req">Required</span> : null}
        </p>
        {task.count ? (
          <p className="qs-task-count">
            {task.count.have} of {task.count.need}
            {task.count.unit ? ` ${task.count.unit}` : ""}
          </p>
        ) : null}
        {task.how ? <p className="qs-task-how">{task.how}</p> : null}
        {task.when ? (
          <p className="qs-task-when">
            <QuestIcon name="clock" size={13} />
            {task.when}
          </p>
        ) : null}
        {task.action ? <ActionLink action={task.action} /> : null}
        {task.doneLine ? <p className="qs-task-how">{task.doneLine}</p> : null}
      </div>
      {pts !== null ? (
        <span className="qs-pts">
          +{pts}
          <span className="dc-sr"> {pts === 1 ? "point" : "points"}</span>
        </span>
      ) : null}
    </li>
  );
}

export function TaskList({ tasks, mode, fresh = NONE }) {
  if (!tasks.length) return <p className="qs-task-how">The organisers haven&rsquo;t added the tasks yet.</p>;
  return (
    <ul className="qs-tasks" aria-label="Tasks">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} mode={mode} isNew={fresh.has(t.id)} />
      ))}
    </ul>
  );
}

/** A reward's picture (the swag's own photo), or a gift drawn in its place. */
function RewardPhoto({ reward }) {
  return reward.photo ? (
    <img className="qs-reward-photo" src={reward.photo} alt="" loading="lazy" decoding="async" width="48" height="48" />
  ) : (
    <span className="qs-reward-photo qs-reward-photo--empty" aria-hidden="true">
      <QuestIcon name="gift" size={22} />
    </span>
  );
}

/**
 * The sizes of a reserved reward: the guest's (filled) and every size with
 * a unit free. `onPick(reward, label)` resolves to `{tone, line}` to say, or
 * null.
 */
function SizePicker({ reward, onPick }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);
  const pick = async (label) => {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    try {
      setSaid(await onPick(reward, label));
    } finally {
      setBusy(false);
    }
  };
  const mine = reward.size ? reward.size.toLowerCase() : null;
  return (
    <fieldset className="qs-sizes" disabled={busy} aria-describedby={`${id}-said`}>
      <legend className="qs-sizes-label">{reward.needsSize ? `Pick your size for the ${reward.name}` : "Your size (you can change it until you collect it)"}</legend>
      <div className="qs-sizes-row">
        {reward.sizes.map((s) => {
          const chosen = mine !== null && s.id.toLowerCase() === mine;
          const out = !chosen && s.left === 0;
          return (
            <button key={s.id} type="button" className={`qs-size${chosen ? " is-on" : ""}`} aria-pressed={chosen} disabled={out} onClick={() => (chosen ? undefined : pick(s.id))}>
              {s.label}
              {out ? <span className="dc-sr">, none left</span> : null}
            </button>
          );
        })}
      </div>
      <p id={`${id}-said`} className={`qs-sizes-said${said?.tone ? ` is-${said.tone}` : ""}`} role="status" aria-live="polite">
        {said?.line || ""}
      </p>
    </fieldset>
  );
}

/** What a reward's state is called, beside its name, and its tone. */
const PILL = {
  locked: ["Locked", "locked"],
  unlocked: ["Unlocked", "good"],
  collected: ["Collected", "done"],
  sold_out: ["Sold out", "off"],
  waitlist: ["Unlocked · on the waiting list", "wait"],
};

/**
 * The milestones and what each unlocks: the reward, whether it's yours,
 * collected or gone, and where to collect it. `onPickSize` only while the
 * guest may choose a size (the quest is on and they have a ticket).
 */
export function Rewards({ milestones, onPickSize = null, fresh = NONE }) {
  if (!milestones.length) return null;
  return (
    <ul className="qs-rewards" aria-label="Rewards">
      {milestones.map((m) => (
        <li key={m.id} className={`qs-milestone${m.unlocked ? " is-unlocked" : ""}`}>
          <p className="qs-milestone-head">
            <span className="qs-milestone-name">{m.title}</span>
            <span className="qs-milestone-at">{m.unlocked ? "Reached" : m.atLine}</span>
          </p>
          <ul className="qs-milestone-rewards">
            {m.rewards.map((r) => {
              const [word, tone] = PILL[r.state] || PILL.locked;
              return (
                <li key={r.id} className={`qs-reward is-${r.state}`}>
                  <RewardPhoto reward={r} />
                  <div className="qs-reward-body">
                    <p className="qs-reward-name">
                      {r.name}
                      {r.size && (r.state === "unlocked" || r.state === "collected") ? <span className="qs-reward-size"> · size {r.size}</span> : null}
                    </p>
                    <p className="qs-reward-state">
                      <span className={`qs-pill qs-pill--${tone}${fresh.has(m.id) ? " is-new" : ""}`}>
                        {r.state === "locked" ? <QuestIcon name="lock" size={12} /> : null}
                        {word}
                      </span>
                    </p>
                    {r.line ? <p className="qs-reward-line">{r.line}</p> : null}
                    {onPickSize && r.canPickSize ? <SizePicker reward={r} onPick={onPickSize} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {m.needLine ? <p className="qs-milestone-need">{m.needLine}</p> : null}
        </li>
      ))}
    </ul>
  );
}
