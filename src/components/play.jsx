"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { errorLine, liveApi } from "@/api/live";
import { subscribe } from "@/api/liveStream";
import Answers, { hasAnswered, kindOf } from "@/components/liveroom/answers";
import { Bars } from "@/components/liveroom/charts";
import Clock, { TimeBar } from "@/components/liveroom/clock";
import { LiveFrame, ThemeLogo, useQuizTheme } from "@/components/liveroom/frame";
import { currentPlayer, forgetPlayer, refusalCode, rememberPlayer } from "@/utils/live";

export const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) > 3 ? 0 : n % 10] || "th"}`;

/**
 * The board with the ranks a tie shares. The API numbers the top ten by
 * their place in the list (1, 2, 3 …), while a player's own rank counts the
 * players who scored *more* — so two players on 2210 are both first, and the
 * next is third. The board is drawn the same way, or the two would disagree
 * on the same screen. A round that breaks ties by answer time (`ties:
 * "time"`) gives every player their own rank: the API's numbers then.
 */
export const ranked = (board, byTime = false) => {
  const rows = board || [];
  return rows.map((p) => ({ ...p, place: byTime ? p.rank : 1 + rows.filter((o) => o.score > p.score).length }));
};

/** Whether this player's own row is among the rows shown. */
const meInBoard = (rows, me, score) => rows.some((p) => p.name === me && p.score === score);

/** "−250" / "+930": a question's points, signed. */
const signed = (n) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/**
 * The leaderboard: a podium for the first three, the rest as a list, and the
 * player's own row kept in sight however far down they are. One ordered
 * list, so a screen reader reads a board, not a picture of one. In a round
 * played in teams each row carries its team's colour and name.
 */
export const Board = ({ board, me, myRank = null, myScore = null, plain = false, top = 0, teams = null, byTime = false, label = "Leaderboard" }) => {
  const all = ranked(board, byTime);
  const rows = top > 0 ? all.slice(0, top) : all;
  if (rows.length === 0) return null;
  const apart = myRank != null && !meInBoard(rows, me, myScore);
  const podium = !plain && rows.length >= 3;
  const teamOf = (key) => (key && Array.isArray(teams) ? teams.find((t) => t.key === key) : null);
  return (
    <ol className={`play-board${podium ? " has-podium" : ""}`} aria-label={label}>
      {rows.map((p, i) => {
        const team = teamOf(p.team);
        return (
          <li key={`${p.rank}-${p.name}`} className={`${podium && i < 3 ? `is-podium is-p${i + 1}` : ""}${p.name === me && p.score === myScore ? " is-me" : ""}`}>
            <span className="play-rank">{p.place}</span>
            <span className="play-who">
              {team && <span className="lt-swatch" style={{ background: team.color }} aria-hidden="true" />}
              {p.name}
              {team && <span className="live-sr">, {team.name}</span>}
            </span>
            <span className="play-pts">{p.score}</span>
          </li>
        );
      })}
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

/** The teams' board (a round played in teams): rank, colour, name, score, and how many play for each. */
export const TeamBoard = ({ teams, mine = null }) => {
  const rows = [...(teams || [])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  if (rows.length === 0) return null;
  return (
    <ol className="lt-team-board" aria-label="Teams">
      {rows.map((t) => (
        <li key={t.key} className={t.key === mine ? "is-me" : ""}>
          <span className="play-rank">{t.rank}</span>
          <span className="lt-swatch" style={{ background: t.color }} aria-hidden="true" />
          <span className="play-who">
            {t.name}
            {t.key === mine && <span className="lt-yours"> (your team)</span>}
            {typeof t.players === "number" && <small>{t.players === 1 ? "1 player" : `${t.players} players`}</small>}
          </span>
          <span className="play-pts">{t.score}</span>
        </li>
      ))}
    </ol>
  );
};

/**
 * A team's name as the chip says it: "Team Red Rockets", but a name that
 * already says it ("Team Flutter", "team-a") as it is, never "Team Team Flutter".
 */
export const teamLabel = (name) => {
  const n = String(name ?? "").trim();
  return /^team(?![a-z])/i.test(n) ? n : `Team ${n}`;
};

/** The player's team, beside their name. */
const TeamChip = ({ team }) =>
  team ? (
    <span className="lt-team-chip">
      <span className="lt-swatch" style={{ background: team.color }} aria-hidden="true" />
      {teamLabel(team.name)}
    </span>
  ) : null;

/**
 * Where the round stands (CONTRACT 5.4 `phase`). An API from before rounds
 * and question kinds sends no phase: it is read from the state as it
 * always was (the right answer arriving is the reveal).
 */
export function phaseOf(state) {
  if (!state) return null;
  if (typeof state.phase === "string") return state.phase;
  const q = state.question;
  if (state.status === "ended") return "ended";
  if (state.status === "draft" && !q) return "draft";
  if (!q) return "lobby";
  return q.correct_key ? "revealed" : "question";
}

/** What the page says of a revealed answer: right, partly, wrong (with negative points), or a poll's thanks; null before. */
function verdictOf(q, phase, flash, v2) {
  const answered = hasAnswered(q);
  if (!v2) {
    // As it always was: an API from before tells right or wrong with the state, or at once in the answer's response.
    if (!q.my_answer) return null;
    const right = q.my_correct != null ? q.my_correct : flash && flash.correct != null ? flash.correct : null;
    return right === null ? null : right ? "right" : "wrong";
  }
  if (phase !== "revealed" && phase !== "ended") return null;
  if (kindOf(q) === "poll") return answered ? "poll" : null;
  if (!answered) return null;
  const credit = typeof q.my_credit === "number" ? q.my_credit : q.my_correct ? 1 : 0;
  if (q.my_correct === true || credit >= 1) return "right";
  if (credit > 0) return "partly";
  return "wrong";
}

/** The right answer in words, for a player who did not have it. */
function rightLine(q) {
  const kind = kindOf(q);
  const label = (key) => (q.options.find((o) => o.key === key) || {}).label;
  if ((kind === "single" || kind === "true_false") && q.correct_key) {
    const l = label(q.correct_key);
    return l ? `The answer was ${l}.` : null;
  }
  if (kind === "multi" && Array.isArray(q.correct_keys) && q.correct_keys.length) {
    const ls = q.correct_keys.map(label).filter(Boolean);
    if (ls.length === 1) return `The answer was ${ls[0]}.`;
    return `The answers were ${ls.slice(0, -1).join(", ")} and ${ls.at(-1)}.`;
  }
  return null;
}

/** "Round 2 of 3", when the event has rounds. */
const roundLine = (state) => (state.round && state.round.count > 1 ? `Round ${state.round.index + 1} of ${state.round.count}` : null);

/** Seconds until `at` (ISO), counted from this phone's clock. */
const secondsUntil = (at) => {
  const t = at ? Date.parse(at) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - Date.now()) / 1000)) : null;
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
 *
 * With this release's API (X-Live-Version: 2) the state also says where the
 * round stands (`phase`: lobby, question, paused, closed, revealed, ended),
 * the question's kind and points, the player's team, the round among the
 * event's rounds and the theme's version. When the next round starts, the
 * API answers this player's key with QUIZ_NEW_ROUND and the new round's
 * code: the page joins it again, with the same name, on its own.
 */
const Play = ({ eventId }) => {
  const [player, setPlayer] = useState(null);
  const [looked, setLooked] = useState(false);
  const [state, setState] = useState(null);
  const [left, setLeft] = useState(0);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const me = useRef(null);
  const rejoined = useRef(null);
  const theme = useQuizTheme(eventId, state?.theme_version || null);

  useEffect(() => {
    const p = currentPlayer(eventId);
    me.current = p;
    setPlayer(p);
    setLooked(true);
  }, [eventId]);

  /** The next round has started: into it with the same name (and team), quietly. Once per round's code. */
  const nextRound = async (info) => {
    const code = info?.join_code;
    const was = me.current;
    if (!code || !was || rejoined.current === code) return;
    rejoined.current = code;
    const into = async (team) => (team ? liveApi.joinQuiz(code, was.name, team) : liveApi.joinQuiz(code, was.name));
    try {
      let p;
      try {
        p = await into(was.team?.key || null);
      } catch (e) {
        if (refusalCode(e) !== "QUIZ_TEAM_UNKNOWN" || !was.team) throw e;
        p = await into(null);
      }
      rememberPlayer(eventId, p);
      me.current = p;
      setState(null);
      setFlash(null);
      setError(null);
      setPlayer(p);
    } catch (e) {
      forgetPlayer(eventId);
      me.current = null;
      setPlayer(null);
      setGone(errorLine(e, true));
    }
  };

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
          const status = e?.response?.status;
          if (status === 401 && refusalCode(e) === "QUIZ_NEW_ROUND") nextRound(e.response.data?.errors);
          else if (status === 401 || status === 404) {
            forgetPlayer(eventId);
            setPlayer(null);
            setGone(true);
          } else setError(errorLine(e, "Lost the room for a moment…"));
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, playerKey]);

  const phase = phaseOf(state);
  const v2 = typeof state?.phase === "string";

  // The clock runs locally between snapshots, from the time_left each one brings; it stands still while paused.
  useEffect(() => {
    if (!state?.question || left <= 0 || phase === "paused") return undefined;
    const t = setTimeout(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, state, phase]);

  // An auto-advancing round: the seconds to the next question tick on the page.
  const nextAt = state?.next_at || null;
  useEffect(() => {
    if (!nextAt) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [nextAt]);

  // A new question clears the last answer's verdict.
  const qid = state?.question?.id;
  useEffect(() => {
    setFlash(null);
  }, [qid]);

  /** Sends the answer: a key (one-tap kinds) or the kind's own body; locked in at once on the page. */
  const answer = async (response) => {
    setBusy(true);
    try {
      const r = await liveApi.answer(eventId, player.player_key, response);
      setFlash(r);
      const mine = typeof response === "string" ? { my_answer: response, my_response: { option_key: response } } : { my_response: response };
      setState((s) => ({
        ...s,
        score: r.score,
        question: { ...s.question, ...mine, my_points: r.points ?? null, correct_key: r.correct_key ?? s.question.correct_key ?? null },
      }));
    } catch (e) {
      setError(errorLine(e, "That did not land."));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link className="live-back" href={`/${eventId}/live`}>
      ← Live room
    </Link>
  );

  if (!looked) return <div className="live-page dc-scope" role="status" aria-label="Opening the quiz" />;
  if (!player) {
    return (
      <LiveFrame theme={theme}>
        <header className="live-top">{back}</header>
        <section className="live-card">
          <h2>{gone ? "That quiz has moved on" : "You are not in a quiz"}</h2>
          <p className="live-sub">{typeof gone === "string" ? gone : "Join with the code on the screen from the live room."}</p>
          <Link className="live-btn live-btn--block" href={`/${eventId}/live`}>
            Open the live room
          </Link>
        </section>
      </LiveFrame>
    );
  }
  if (!state) return <p></p>;

  const q = state.question;
  const kind = kindOf(q);
  const revealed = v2 ? phase === "revealed" || phase === "ended" : Boolean(q?.correct_key);
  const verdict = q ? verdictOf(q, phase, flash, v2) : null;
  const points = q?.my_points ?? flash?.points ?? 0;
  const seconds = q?.seconds || 0;
  const timer = theme ? theme.timer : "bar";
  const paused = phase === "paused";
  const closed = phase === "closed";
  const answered = hasAnswered(q);
  const right = q && revealed ? rightLine(q) : null;
  const team = state.team || null;
  const byTime = state.ties === "time";
  const round = roundLine(state);
  const nextIn = secondsUntil(state.next_at);
  const podium = theme ? theme.leaderboard.podium : true;
  const moreRounds = Boolean(state.round && state.round.count > 1 && state.round.index + 1 < state.round.count);
  const anonymous = state.anonymous_screen === true && state.tag ? `You are Player ${state.tag} on the screen.` : null;
  // Points above the question's own: a streak bonus paid out.
  const bonus = verdict === "right" && typeof q?.effective_points === "number" && points > q.effective_points && state.streak >= 2;
  const worth = q && v2 && kind !== "poll" && typeof q.effective_points === "number" && (q.double || q.effective_points !== 1000) ? q.effective_points : null;

  return (
    <LiveFrame theme={theme}>
      <header className="live-top">
        {back}
        <ThemeLogo theme={theme} />
        <h1>{state.title}</h1>
        <span className="live-dot">{state.name}</span>
      </header>

      {phase === "ended" || phase === "draft" ? (
        <section className="live-card">
          <h2>{phase === "ended" ? (moreRounds ? `That is round ${state.round.index + 1} of ${state.round.count}` : "That is the quiz") : "The host has not started yet"}</h2>
          <p className="live-sub">
            {phase === "ended"
              ? moreRounds
                ? `Thanks for playing, ${state.name}. Keep this page open — the next round starts here.`
                : `Thanks for playing, ${state.name}.`
              : `You are in as ${state.name}. Keep this page open — the first question comes up on its own.`}
          </p>
          {team && (
            <p className="lt-team-line">
              <TeamChip team={team} />
            </p>
          )}
          {state.rank && (
            <p className="play-final">
              You came {ordinal(state.rank)} with {state.score} points.
            </p>
          )}
          {Array.isArray(state.teams) && state.teams.length > 0 && (
            <div className="play-standing">
              <h3>Teams</h3>
              <TeamBoard teams={state.teams} mine={team?.key} />
            </div>
          )}
          <Board board={state.leaderboard} me={state.name} myRank={state.rank} myScore={state.score} plain={!podium} teams={state.teams || null} byTime={byTime} />
          {Array.isArray(state.overall) && state.overall.length > 0 && (
            <div className="play-standing">
              <h3>Across the rounds</h3>
              <Board board={state.overall} me={state.name} plain byTime label="Across the rounds" />
            </div>
          )}
          {anonymous && <p className="live-note">{anonymous}</p>}
        </section>
      ) : !q ? (
        <section className="live-card is-live">
          <h2>You are in, {state.name}</h2>
          <p className="live-sub">Watch the screen — the first question is coming.</p>
          {team && (
            <p className="lt-team-line">
              <TeamChip team={team} />
            </p>
          )}
          {anonymous && <p className="live-note">{anonymous}</p>}
          <p className="live-note">
            {round ? `${round} · ` : ""}
            {state.total} {state.total === 1 ? "question" : "questions"} tonight
          </p>
        </section>
      ) : (
        <section className={`live-card is-live${paused ? " is-paused" : ""}`}>
          <div className="play-band">
            <div className="play-head">
              <span className="play-step">
                Question {state.current_index + 1} of {state.total}
              </span>
              <Clock timer={timer} left={left} seconds={seconds} paused={paused} />
            </div>
            <TimeBar timer={paused ? "hidden" : timer} left={left} seconds={seconds} />
            {(worth != null || kind === "poll" || round) && (
              <p className="play-tags">
                {round && <span className="play-tag">{round}</span>}
                {q.double && <span className="play-tag is-strong">Double points</span>}
                {worth != null && <span className="play-tag">{worth} points</span>}
                {kind === "poll" && <span className="play-tag">Poll — no right answer</span>}
              </p>
            )}
          </div>
          <p className="play-prompt">{q.prompt}</p>
          {paused && (
            <p className="lt-paused" role="status">
              Paused — the host will carry on in a moment.
            </p>
          )}
          <Answers key={q.id} q={q} theme={theme} revealed={revealed} disabled={left === 0 || paused || closed || (v2 && revealed) || busy} onAnswer={answer} />
          <div className="play-after" aria-live="polite">
            {answered && verdict === null && !closed && !paused && (
              <p className="play-flash is-locked">Answer locked in{left === 0 ? " — the answer is coming" : ""}</p>
            )}
            {closed && <p className="play-flash is-locked">Answers are in — the host reveals the answer.</p>}
            {verdict === "right" && <p className="play-flash is-right">{`Right — ${signed(points)}`}</p>}
            {verdict === "partly" && <p className="play-flash is-partly">{`Partly right — ${signed(points)}`}</p>}
            {verdict === "wrong" && (
              <>
                <p className="play-flash is-wrong">{points < 0 ? `Not that one — ${signed(points)}` : "Not that one"}</p>
                {right && <p className="play-answerline">{right}</p>}
              </>
            )}
            {verdict === "partly" && right && <p className="play-answerline">{right}</p>}
            {verdict === "poll" && <p className="play-flash is-locked">Thanks — that one was a poll.</p>}
            {bonus && <p className="play-answerline">Includes a streak bonus: {state.streak} right in a row.</p>}
            {!answered && left === 0 && (
              <>
                <p className="play-flash is-wrong">Time is up</p>
                {right && <p className="play-answerline">{right}</p>}
              </>
            )}
            {nextIn != null && nextIn > 0 && revealed && <p className="play-answerline">Next question in {nextIn}s</p>}
          </div>
          {kind === "poll" && revealed && Array.isArray(q.counts) && q.counts.length > 0 && <PollTally q={q} />}
          <div className="play-score">
            <span>{state.score} points</span>
            {team && <TeamChip team={team} />}
            {state.rank && <span>{ordinal(state.rank)} right now</span>}
          </div>
          {revealed && Array.isArray(state.teams) && state.teams.length > 0 && (
            <div className="play-standing">
              <h3>Teams</h3>
              <TeamBoard teams={state.teams} mine={team?.key} />
            </div>
          )}
          {revealed && (state.leaderboard || []).length > 0 && (
            <div className="play-standing">
              <h3>Where you stand</h3>
              <Board board={state.leaderboard} me={state.name} myRank={state.rank} myScore={state.score} plain top={5} teams={state.teams || null} byTime={byTime} />
            </div>
          )}
        </section>
      )}
      {error && <p className="live-error">{error}</p>}
    </LiveFrame>
  );
};

/** A poll question's tally, once revealed: how the room answered. */
function PollTally({ q }) {
  const total = q.counts.reduce((s, c) => s + (c.count || 0), 0);
  const mine = q.my_answer ?? q.my_response?.option_key ?? null;
  const rows = q.counts.map((c) => ({ label: c.label, count: c.count || 0, pct: total ? (100 * (c.count || 0)) / total : 0, mark: c.key === mine }));
  return (
    <div className="play-standing">
      <h3>How the room answered</h3>
      <Bars rows={rows} show="both" unit={["answer", "answers"]} label="How the room answered" />
    </div>
  );
}

export default Play;
