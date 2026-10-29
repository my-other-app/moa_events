"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { errorLine, liveApi } from "@/api/live";
import { subscribe } from "@/api/liveStream";
import { currentPlayer, forgetPlayer } from "@/utils/live";

/** A, B, C … beside each answer: what the screen at the front calls them. */
const LETTERS = ["A", "B", "C", "D", "E", "F"];

export const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) > 3 ? 0 : n % 10] || "th"}`;

/**
 * The board with the ranks a tie shares. The API numbers the top ten by
 * their place in the list (1, 2, 3 …), while a player's own rank counts the
 * players who scored *more* — so two players on 2210 are both first, and the
 * next is third. The board is drawn the same way, or the two would disagree
 * on the same screen.
 */
export const ranked = (board) => {
  const rows = board || [];
  return rows.map((p) => ({ ...p, place: 1 + rows.filter((o) => o.score > p.score).length }));
};

/** Whether this player's own row is among the rows shown. */
const meInBoard = (rows, me, score) => rows.some((p) => p.name === me && p.score === score);

/**
 * The leaderboard: a podium for the first three, the rest as a list, and the
 * player's own row kept in sight however far down they are. One ordered
 * list, so a screen reader reads a board, not a picture of one.
 */
export const Board = ({ board, me, myRank = null, myScore = null, plain = false, top = 0 }) => {
  const all = ranked(board);
  const rows = top > 0 ? all.slice(0, top) : all;
  if (rows.length === 0) return null;
  const apart = myRank != null && !meInBoard(rows, me, myScore);
  const podium = !plain && rows.length >= 3;
  return (
    <ol className={`play-board${podium ? " has-podium" : ""}`} aria-label="Leaderboard">
      {rows.map((p, i) => (
        <li key={`${p.rank}-${p.name}`} className={`${podium && i < 3 ? `is-podium is-p${i + 1}` : ""}${p.name === me && p.score === myScore ? " is-me" : ""}`}>
          <span className="play-rank">{p.place}</span>
          <span className="play-who">{p.name}</span>
          <span className="play-pts">{p.score}</span>
        </li>
      ))}
      {apart && (
        <li className="is-me is-apart">
          <span className="play-rank">{myRank}</span>
          <span className="play-who">{me} (you)</span>
          <span className="play-pts">{myScore}</span>
        </li>
      )}
    </ol>
  );
};

/**
 * The quiz, played: the lobby while the host waits, each question with its
 * clock, the right answer once answers close, the board at the end. Its
 * server half (src/app/play/[eventId]/page.jsx) hands over the event's id;
 * who is playing is in this browser's storage, read once the page is up.
 * The player's state is pushed (src/api/liveStream.js), or asked for every
 * 2 seconds where it cannot be.
 *
 * The API keeps the answer to itself while answers are open: an answer is
 * "locked in" (its response says `correct: null`), and whether it was right,
 * its points and the right answer come with the state once the clock and a
 * short grace are out (`correct_key`, `my_correct`, `my_points`). An API from
 * before says it at once (`correct` true or false); both are shown.
 */
const Play = ({ eventId }) => {
  const [player, setPlayer] = useState(null);
  const [looked, setLooked] = useState(false);
  const [state, setState] = useState(null);
  const [left, setLeft] = useState(0);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    setPlayer(currentPlayer(eventId));
    setLooked(true);
  }, [eventId]);

  const playerKey = player?.player_key;
  useEffect(() => {
    if (!playerKey) return undefined;
    return subscribe(
      "quiz",
      { eventId, player: playerKey },
      {
        snapshot: (s) => {
          setState(s);
          setLeft(s.question ? s.question.time_left : 0);
          setError(null);
        },
        error: (e) => {
          if (e?.response?.status === 401 || e?.response?.status === 404) {
            forgetPlayer(eventId);
            setPlayer(null);
            setGone(true);
          } else setError(errorLine(e, "Lost the room for a moment…"));
        },
      }
    );
  }, [eventId, playerKey]);

  // The clock runs locally between snapshots, from the time_left each one brings.
  useEffect(() => {
    if (!state?.question || left <= 0) return undefined;
    const t = setTimeout(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, state]);

  // A new question clears the last answer's verdict.
  const qid = state?.question?.id;
  useEffect(() => {
    setFlash(null);
  }, [qid]);

  const answer = async (key) => {
    try {
      const r = await liveApi.answer(eventId, player.player_key, key);
      setFlash(r);
      setState((s) => ({
        ...s,
        score: r.score,
        question: { ...s.question, my_answer: key, my_points: r.points ?? null, correct_key: r.correct_key ?? s.question.correct_key ?? null },
      }));
    } catch (e) {
      setError(errorLine(e, "That did not land."));
    }
  };

  if (!looked) return <div className="live-page dc-scope" role="status" aria-label="Opening the quiz" />;
  if (!player) {
    return (
      <div className="live-page dc-scope">
        <header className="live-top">
          <Link className="live-back" href={`/${eventId}/live`}>
            ← Live room
          </Link>
        </header>
        <section className="live-card">
          <h2>{gone ? "That quiz has moved on" : "You are not in a quiz"}</h2>
          <p className="live-sub">Join with the code on the screen from the live room.</p>
          <Link className="live-btn live-btn--block" href={`/${eventId}/live`}>
            Open the live room
          </Link>
        </section>
      </div>
    );
  }
  if (!state) return <p></p>;

  const q = state.question;
  // Shown once the API says which it was: not at the local clock's 0, while answers still count.
  const reveal = Boolean(q?.correct_key);
  const verdict = !q?.my_answer ? null : q.my_correct != null ? q.my_correct : flash && flash.correct != null ? flash.correct : null;
  const points = q?.my_points ?? flash?.points ?? 0;
  const seconds = q?.seconds || 0;
  const share = seconds > 0 ? Math.min(1, Math.max(0, left / seconds)) : 0;
  const rightLabel = reveal ? (q.options.find((o) => o.key === q.correct_key) || {}).label : null;
  return (
    <div className="live-page dc-scope">
      <header className="live-top">
        <Link className="live-back" href={`/${eventId}/live`}>
          ← Live room
        </Link>
        <h1>{state.title}</h1>
        <span className="live-dot">{state.name}</span>
      </header>

      {state.status === "ended" || (state.status === "draft" && !q) ? (
        <section className="live-card">
          <h2>{state.status === "ended" ? "That is the quiz" : "The host has not started yet"}</h2>
          <p className="live-sub">
            {state.status === "ended"
              ? `Thanks for playing, ${state.name}.`
              : `You are in as ${state.name}. Keep this page open — the first question comes up on its own.`}
          </p>
          {state.rank && (
            <p className="play-final">
              You came {ordinal(state.rank)} with {state.score} points.
            </p>
          )}
          <Board board={state.leaderboard} me={state.name} myRank={state.rank} myScore={state.score} />
        </section>
      ) : !q ? (
        <section className="live-card is-live">
          <h2>You are in, {state.name}</h2>
          <p className="live-sub">Watch the screen — the first question is coming.</p>
          <p className="live-note">
            {state.total} {state.total === 1 ? "question" : "questions"} tonight
          </p>
        </section>
      ) : (
        <section className="live-card is-live">
          <div className="play-band">
            <div className="play-head">
              <span className="play-step">
                Question {state.current_index + 1} of {state.total}
              </span>
              <span className={`play-clock${left <= 5 ? " is-urgent" : ""}${left === 0 ? " is-out" : ""}`} aria-label={`${left} seconds left`}>
                {left === 0 ? "Time" : `${left}s`}
              </span>
            </div>
            <span className="play-timebar" aria-hidden="true">
              <span className={left <= 5 ? "is-urgent" : ""} style={{ transform: `scaleX(${share})` }} />
            </span>
          </div>
          <p className="play-prompt">{q.prompt}</p>
          <div className="play-answers">
            {q.options.map((o, i) => {
              const mine = q.my_answer === o.key;
              const right = reveal && q.correct_key === o.key;
              const wrong = reveal && mine && q.correct_key !== o.key;
              return (
                <button key={o.key} type="button" className={`play-answer${mine ? " is-mine" : ""}${right ? " is-right" : ""}${wrong ? " is-wrong" : ""}`} disabled={Boolean(q.my_answer) || left === 0} onClick={() => answer(o.key)}>
                  <span className="play-mark" aria-hidden="true">
                    {LETTERS[i] || i + 1}
                  </span>
                  <span className="play-label">{o.label}</span>
                  {(right || wrong) && (
                    <span className="play-verdict-mark" aria-hidden="true">
                      {right ? "✓" : "✕"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="play-after" aria-live="polite">
            {q.my_answer && verdict === null && (
              <p className="play-flash is-locked">Answer locked in{left === 0 ? " — the answer is coming" : ""}</p>
            )}
            {verdict !== null && (
              <>
                <p className={`play-flash ${verdict ? "is-right" : "is-wrong"}`}>{verdict ? `Right — +${points}` : "Not that one"}</p>
                {!verdict && rightLabel && <p className="play-answerline">The answer was {rightLabel}.</p>}
              </>
            )}
            {!q.my_answer && left === 0 && (
              <>
                <p className="play-flash is-wrong">Time is up</p>
                {rightLabel && <p className="play-answerline">The answer was {rightLabel}.</p>}
              </>
            )}
          </div>
          <div className="play-score">
            <span>{state.score} points</span>
            {state.rank && <span>{ordinal(state.rank)} right now</span>}
          </div>
          {reveal && (state.leaderboard || []).length > 0 && (
            <div className="play-standing">
              <h3>Where you stand</h3>
              <Board board={state.leaderboard} me={state.name} myRank={state.rank} myScore={state.score} plain top={5} />
            </div>
          )}
        </section>
      )}
      {error && <p className="live-error">{error}</p>}
    </div>
  );
};

export default Play;
