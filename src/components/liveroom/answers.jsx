"use client";

import { useState } from "react";

import { markFor, mediaUrl, tileStyle } from "@/utils/liveTheme";
import OrderList from "./order";

/**
 * How a player answers each kind of question (CONTRACT 3.2, 5.3), on a
 * phone: big targets, one clear way to send, and the answer locked once
 * sent. The right answer, and how this player did, show once the API says
 * so (`revealed`); never earlier, whatever the local clock says.
 *
 *   single, true_false, poll   one tap
 *   multi                      tap every right one, then lock them in
 *   type                       type it, send
 *   order                      move the rows up and down, lock the order in
 *
 * A kind this page does not know (a later one) asks for a reload rather
 * than showing a question nobody can answer.
 */
export const KINDS = ["single", "true_false", "poll", "multi", "type", "order"];

export const kindOf = (q) => (q && typeof q.kind === "string" ? q.kind : "single");

/** Whether the player has answered the question (any kind). */
export const hasAnswered = (q) => Boolean(q && (q.my_answer != null || q.my_response != null));

/**
 * The six shapes the big screen draws beside answers A–F (▲◆●■★✚), as
 * paths: the same on every phone, where a font may lack the characters or
 * draw them as emoji.
 */
const SHAPE_PATHS = [
  "M12 3 22 20H2Z",
  "M12 2 22 12 12 22 2 12Z",
  "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  "M3 3h18v18H3Z",
  "m12 2 2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6Z",
  "M9 2h6v7h7v6h-7v7H9v-7H2V9h7Z",
];

export function Shape({ i }) {
  return (
    <svg className="lt-shape" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d={SHAPE_PATHS[i % SHAPE_PATHS.length]} fill="currentColor" />
    </svg>
  );
}

/** The picture on an option, when the question or poll carries one. */
const imageOf = (option) => mediaUrl(option?.image) || null;

/**
 * One answer to tap. With no theme (or the plain style) it is the tile the
 * page always had; with one, it is drawn in its answer colour with its
 * shape or letter, the text in the server's colour for that fill.
 */
function Tile({ i, option, theme, mine = false, right = false, wrong = false, missed = false, dim = false, pressed, disabled, onClick, label = null }) {
  const m = markFor(theme, i);
  const cls = `play-answer${mine ? " is-mine" : ""}${right ? " is-right" : ""}${wrong ? " is-wrong" : ""}${m.tinted ? " is-tinted" : ""}${missed ? " is-missed" : ""}${dim ? " is-dim" : ""}`;
  const image = imageOf(option);
  return (
    <button type="button" className={cls} style={m.tinted ? tileStyle(theme, i) : undefined} disabled={disabled} aria-pressed={pressed} onClick={onClick}>
      <span className="play-mark" aria-hidden="true">
        {m.shape != null ? <Shape i={m.shape} /> : m.glyph}
      </span>
      {image && <img className="lt-option-img" src={image} alt="" loading="lazy" decoding="async" />}
      <span className="play-label">
        {label ?? option.label}
        {right && <span className="live-sr"> (the right answer)</span>}
        {wrong && <span className="live-sr"> (your answer)</span>}
        {missed && <span className="live-sr"> (a right answer you missed)</span>}
      </span>
      {(right || wrong) && (
        <span className="play-verdict-mark" aria-hidden="true">
          {right ? "✓" : "✕"}
        </span>
      )}
    </button>
  );
}

const answersClass = (q, theme) => `play-answers${kindOf(q) === "true_false" ? " is-pair" : ""}${theme && theme.guest.answer_layout === "grid" ? " is-grid" : ""}`;

/** Single answer, true or false, and a poll question: one tap sends it. */
export function ChoiceAnswers({ q, theme, revealed, disabled, onAnswer }) {
  const kind = kindOf(q);
  const scored = kind !== "poll";
  const mine = q.my_answer ?? q.my_response?.option_key ?? null;
  return (
    <div className={answersClass(q, theme)}>
      {q.options.map((o, i) => {
        const isMine = mine === o.key;
        const right = Boolean(revealed && scored && q.correct_key && q.correct_key === o.key);
        const wrong = Boolean(revealed && scored && isMine && q.correct_key && q.correct_key !== o.key);
        const dim = Boolean(theme && ((revealed && scored && q.correct_key && !right && !wrong) || (!revealed && mine && !isMine)));
        return <Tile key={o.key} i={i} option={o} theme={theme} mine={isMine} right={right} wrong={wrong} dim={dim} disabled={disabled || mine != null} onClick={() => onAnswer(o.key)} />;
      })}
    </div>
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Several right answers: pick them all (partial credit per the round's rule), then lock them in. */
export function MultiAnswers({ q, theme, revealed, disabled, onAnswer }) {
  const sent = Array.isArray(q.my_response?.option_keys) ? q.my_response.option_keys : null;
  const [picked, setPicked] = useState([]);
  const chosen = sent || picked;
  const right = revealed && Array.isArray(q.correct_keys) ? new Set(q.correct_keys) : null;
  const toggle = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  return (
    <>
      {!sent && !disabled && <p className="play-hint">Pick every answer you think is right, then lock them in.</p>}
      <div className={answersClass(q, theme)} role="group" aria-label="Answers: pick one or more">
        {q.options.map((o, i) => {
          const isMine = chosen.includes(o.key);
          const isRight = Boolean(right && right.has(o.key));
          const isWrong = Boolean(right && isMine && !right.has(o.key));
          const missed = Boolean(right && !isMine && right.has(o.key));
          return (
            <Tile
              key={o.key}
              i={i}
              option={o}
              theme={theme}
              mine={isMine}
              right={isRight}
              wrong={isWrong}
              missed={missed}
              dim={Boolean(theme && right && !isRight && !isWrong)}
              pressed={isMine}
              disabled={disabled || Boolean(sent)}
              onClick={() => toggle(o.key)}
            />
          );
        })}
      </div>
      {!sent && (
        <button type="button" className="live-btn live-btn--block play-send" disabled={disabled || picked.length === 0} onClick={() => onAnswer({ option_keys: picked })}>
          {picked.length === 0 ? "Pick your answers" : `Lock in ${plural(picked.length, "answer", "answers")}`}
        </button>
      )}
    </>
  );
}

/** Type the answer: exact or close match is the server's business; the phone sends what was typed. */
export function TypeAnswer({ q, revealed, disabled, onAnswer }) {
  const sent = typeof q.my_response?.text === "string" ? q.my_response.text : null;
  const [text, setText] = useState("");
  const accepted = revealed && Array.isArray(q.accepted) ? q.accepted : null;
  if (sent != null || (disabled && revealed)) {
    return (
      <div className="lt-typed">
        <p className="lt-typed-mine">
          <span className="lt-typed-k">Your answer</span>
          <span className="lt-typed-v">{sent != null ? sent : "No answer"}</span>
        </p>
        {accepted && accepted.length > 0 && (
          <p className="lt-typed-right">
            <span className="lt-typed-k">{accepted.length === 1 ? "The answer" : "Answers taken"}</span>
            <span className="lt-typed-v">{accepted.join(" · ")}</span>
          </p>
        )}
      </div>
    );
  }
  const ready = text.trim().length > 0;
  return (
    <form
      className="live-form lt-type"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !disabled) onAnswer({ text: text.trim() });
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={120}
        placeholder="Type your answer"
        aria-label="Your answer"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        disabled={disabled}
      />
      <button type="submit" className="live-btn live-btn--block" disabled={disabled || !ready}>
        Send my answer
      </button>
    </form>
  );
}

/** Put in order: the options come shuffled (the same on every phone and the screen); the player sends the keys in their order. */
export function OrderAnswer({ q, theme, revealed, disabled, onAnswer }) {
  const sent = Array.isArray(q.my_response?.order) ? q.my_response.order : null;
  const [order, setOrder] = useState(() => q.options.map((o) => o.key));
  const byKey = Object.fromEntries(q.options.map((o, i) => [o.key, { ...o, i }]));
  const shown = (sent || order).map((k) => byKey[k]).filter(Boolean);
  const correct = revealed && Array.isArray(q.correct_order) ? q.correct_order : null;
  const mark = (key) => {
    const i = byKey[key]?.i ?? 0;
    const m = markFor(theme, i);
    return m.tinted ? { tinted: true, style: tileStyle(theme, i) } : null;
  };
  const items = shown.map((o) => ({ key: o.key, label: o.label, image: imageOf(o) }));
  return (
    <>
      {!sent && !disabled && <p className="play-hint">Move them into the right order, first at the top, then lock it in.</p>}
      <OrderList
        items={items}
        onChange={setOrder}
        disabled={disabled || Boolean(sent)}
        label={sent ? "Your order" : "Put these in order"}
        mark={theme && theme.answers.style !== "plain" ? mark : null}
        verdicts={correct && sent ? sent.map((k, i) => correct[i] === k) : null}
      />
      {!sent && (
        <button type="button" className="live-btn live-btn--block play-send" disabled={disabled} onClick={() => onAnswer({ order })}>
          Lock in this order
        </button>
      )}
      {correct && (
        <div className="lt-right-order">
          <h3>The right order</h3>
          <ol>
            {correct.map((k) => (
              <li key={k}>{byKey[k]?.label ?? k}</li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

/** A kind this page was built before: say so, and offer the reload that brings the page that knows it. */
export function NeedsUpdate() {
  return (
    <div className="lt-update" role="status">
      <p>This kind of question needs a newer version of this page.</p>
      <button type="button" className="live-btn live-btn--block" onClick={() => window.location.reload()}>
        Reload the page
      </button>
    </div>
  );
}

/** The question's answers, by kind. */
export default function Answers(props) {
  const kind = kindOf(props.q);
  if (kind === "single" || kind === "true_false" || kind === "poll") return <ChoiceAnswers {...props} />;
  if (kind === "multi") return <MultiAnswers {...props} />;
  if (kind === "type") return <TypeAnswer {...props} />;
  if (kind === "order") return <OrderAnswer {...props} />;
  return <NeedsUpdate />;
}
