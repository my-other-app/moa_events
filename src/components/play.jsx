"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { errorLine, liveApi } from "@/api/live";
import { currentPlayer, forgetPlayer } from "@/utils/live";

const MARK = ["▲", "◆", "●", "■", "★", "✚"];

/**
 * The quiz, played: the lobby while the host waits, each question with its
 * clock, the right answer once the clock is out, the board at the end. Its
 * server half (src/app/play/[eventId]/page.jsx) hands over the event's id;
 * who is playing is in this browser's storage, read once the page is up.
 */
const Play = ({ eventId }) => {
  const [player, setPlayer] = useState(null);
  const [looked, setLooked] = useState(false);
  const [state, setState] = useState(null);
  const [left, setLeft] = useState(0);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);
  const [gone, setGone] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setPlayer(currentPlayer(eventId));
    setLooked(true);
  }, [eventId]);

  const load = useCallback(async () => {
    if (!player) return;
    try {
      const s = await liveApi.playState(eventId, player.player_key);
      setState(s);
      setLeft(s.question ? s.question.time_left : 0);
      setError(null);
    } catch (e) {
      if (e?.response?.status === 401 || e?.response?.status === 404) {
        forgetPlayer(eventId);
        setPlayer(null);
        setGone(true);
      } else setError(errorLine(e, "Lost the room for a moment…"));
    }
  }, [eventId, player]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 2000);
    return () => clearInterval(timer.current);
  }, [load]);

  // The clock runs locally between refreshes so it does not jump by twos.
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
      setState((s) => ({ ...s, score: r.score, question: { ...s.question, my_answer: key, my_points: r.points, correct_key: r.correct_key } }));
    } catch (e) {
      setError(errorLine(e, "That did not land."));
    }
  };

  if (!looked) return <div className="live-page" role="status" aria-label="Opening the quiz" />;
  if (!player) {
    return (
      <div className="live-page">
        <div className="live-top">
          <Link href={`/${eventId}/live`}>← Live room</Link>
        </div>
        <section className="live-card">
          <h2>{gone ? "That quiz has moved on" : "You are not in a quiz"}</h2>
          <p className="live-sub">Join with the code on the screen from the live room.</p>
          <Link className="live-btn" href={`/${eventId}/live`}>
            Open the live room
          </Link>
        </section>
      </div>
    );
  }
  if (!state) return <p></p>;

  const q = state.question;
  const reveal = q && (q.correct_key || left === 0);
  return (
    <div className="live-page">
      <div className="live-top">
        <Link href={`/${eventId}/live`}>← Live room</Link>
        <h1>{state.title}</h1>
        <span className="live-dot">{state.name}</span>
      </div>

      {state.status === "ended" || (state.status === "draft" && !q) ? (
        <section className="live-card">
          <h2>{state.status === "ended" ? "That is the quiz" : "The host has not started yet"}</h2>
          {state.rank && (
            <p className="live-sub">
              You came {ordinal(state.rank)} with {state.score} points.
            </p>
          )}
          <Board board={state.leaderboard} me={state.name} />
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
        <section className="live-card is-live" aria-live="polite">
          <div className="live-row" style={{ justifyContent: "space-between" }}>
            <span className="live-sub" style={{ margin: 0 }}>
              Question {state.current_index + 1} of {state.total}
            </span>
            <span className="play-clock" aria-label={`${left} seconds left`}>
              {left === 0 ? "Time" : `${left}s`}
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
                    {MARK[i]}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
          {flash && <p className={`play-flash ${flash.correct ? "is-right" : "is-wrong"}`}>{flash.correct ? `Right — +${flash.points}` : "Not that one"}</p>}
          {!flash && q.my_answer && q.my_points != null && <p className="play-flash is-right">{q.my_points > 0 ? `+${q.my_points}` : "Not that one"}</p>}
          {!q.my_answer && left === 0 && <p className="play-flash is-wrong">Time is up</p>}
          <div className="play-score">
            <span>{state.score} points</span>
            {state.rank && <span>{ordinal(state.rank)} right now</span>}
          </div>
        </section>
      )}
      {error && <p className="live-error">{error}</p>}
    </div>
  );
};

const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) > 3 ? 0 : n % 10] || "th"}`;

const Board = ({ board, me }) => {
  if (!board || board.length === 0) return null;
  return (
    <ol className="play-board" aria-label="Leaderboard">
      {board.map((p) => (
        <li key={p.rank} className={p.name === me ? "is-me" : ""}>
          <span className="play-rank">{p.rank}</span>
          <span>{p.name}</span>
          <span className="play-pts">{p.score}</span>
        </li>
      ))}
    </ol>
  );
};

export default Play;
