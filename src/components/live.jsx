"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { errorLine, liveApi } from "@/api/live";
import { subscribe } from "@/api/liveStream";
import { currentPlayer, rememberPlayer } from "@/utils/live";

const KIND = { schedule: "Schedule change", room: "Room change", general: "Update" };

/** Word sizes from counts: the most said word is twice the size of the least. */
const sizes = (words) => {
  if (!words.length) return [];
  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));
  return words.map((w) => ({ ...w, px: 14 + (max === min ? 8 : (18 * (w.count - min)) / (max - min)) }));
};

export const PollCard = ({ eventId, poll, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [word, setWord] = useState("");
  const r = poll.results || {};
  const send = async (value) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await liveApi.respond(eventId, poll.id, value));
      setWord("");
    } catch (e) {
      setError(errorLine(e, "That did not go through. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="live-card is-live" aria-labelledby="poll-heading">
      <span className="live-dot">Poll</span>
      <h2 id="poll-heading">{poll.prompt}</h2>
      <p className="live-sub">
        {r.responses || 0} {r.responses === 1 ? "answer" : "answers"} so far{poll.my_response ? " · you answered" : ""}
      </p>
      {poll.kind === "choice" && (
        <div className="live-options">
          {(r.choices || []).map((c) => (
            <button key={c.label} type="button" className={`live-option${poll.my_response === c.label ? " is-mine" : ""}`} disabled={busy} onClick={() => send(c.label)}>
              <span>
                {c.label}
                <span className="live-bar" style={{ width: 160 }}>
                  <span style={{ width: `${c.pct}%` }} />
                </span>
              </span>
              <span className="live-pct">{c.pct}%</span>
            </button>
          ))}
        </div>
      )}
      {poll.kind === "words" && (
        <>
          {(r.words || []).length > 0 && (
            <div className="live-words" aria-label="What the room said">
              {sizes(r.words).map((w) => (
                <span key={w.word} style={{ fontSize: w.px }}>
                  {w.word}
                </span>
              ))}
            </div>
          )}
          <form
            className="live-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (word.trim().length >= 2) send(word.trim());
            }}
          >
            <input value={word} onChange={(e) => setWord(e.target.value)} maxLength={40} placeholder={poll.my_response ? `You said “${poll.my_response}” — change it?` : "A word or two"} aria-label="Your word" />
            <button type="submit" className="live-btn" disabled={busy || word.trim().length < 2}>
              Send
            </button>
          </form>
        </>
      )}
      {poll.kind === "rating" && (
        <div className="live-stars" role="group" aria-label="Rate from 1 to 5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={Number(poll.my_response) >= n ? "is-on" : ""} aria-label={`${n} of 5`} disabled={busy} onClick={() => send(String(n))}>
              ★
            </button>
          ))}
        </div>
      )}
      {poll.kind === "rating" && r.rating?.average != null && <p className="live-note">Room average {r.rating.average} of 5</p>}
      {error && <p className="live-error">{error}</p>}
    </section>
  );
};

const JoinQuiz = ({ eventId, title }) => {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const player = currentPlayer(eventId);
  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const p = await liveApi.joinQuiz(code.trim(), name.trim());
      rememberPlayer(p.event_id, p);
      router.push(`/play/${p.event_id}`);
    } catch (err) {
      setError(errorLine(err, "Could not join. Check the code on the screen."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="live-card is-live" aria-labelledby="quiz-heading">
      <span className="live-dot">Quiz</span>
      <h2 id="quiz-heading">{title || "The quiz is on"}</h2>
      <p className="live-sub">Type the code on the screen and your name. Fast right answers score most.</p>
      {player ? (
        <button type="button" className="live-btn" onClick={() => router.push(`/play/${eventId}`)}>
          Back in as {player.name}
        </button>
      ) : (
        <form className="live-form" onSubmit={join}>
          <input inputMode="numeric" pattern="[0-9]*" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code on the screen" aria-label="Join code" />
          <input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name for the quiz" />
          <button type="submit" className="live-btn" disabled={busy || code.trim().length < 4 || !name.trim()}>
            Join the quiz
          </button>
          {error && <p className="live-error">{error}</p>}
        </form>
      )}
    </section>
  );
};

/** The server's answer when the room takes no questions (409 QA_CLOSED). */
const qaClosed = (error) => error?.response?.status === 409 && error?.response?.data?.error_code === "QA_CLOSED";

/**
 * The questions from the floor. The ask box shows only while the room takes
 * questions: the feed says so (`qa.open`), and so does a refused question
 * (409 QA_CLOSED), which closes the box for the rest of the visit. With the
 * box closed, the questions already asked stay, to read and vote on; with
 * none either, there is nothing to show.
 */
const Questions = ({ eventId, feed, onChange }) => {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const open = Boolean(feed.qa?.open) && !refused;
  const ask = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const q = await liveApi.ask(eventId, text.trim(), name.trim());
      setSent(q.status === "pending" ? "Sent — the organiser will put it up." : "Up on the board.");
      setText("");
      onChange();
    } catch (err) {
      if (qaClosed(err)) setRefused(true);
      else setError(errorLine(err, "That did not send. Try again."));
    } finally {
      setBusy(false);
    }
  };
  const vote = async (q) => {
    try {
      onChange(await liveApi.vote(eventId, q.id));
    } catch {
      /* the next refresh sets it straight */
    }
  };
  if (!open && feed.questions.length === 0) {
    return refused ? (
      <p className="live-note" role="status">
        Questions aren&rsquo;t open right now.
      </p>
    ) : null;
  }
  return (
    <section className="live-card" aria-labelledby="qa-heading">
      <h2 id="qa-heading">{open ? "Ask the room" : "Questions from the room"}</h2>
      <p className="live-sub">
        {!open
          ? "Questions aren\u2019t open right now. Vote up the ones you want answered."
          : feed.qa.approve_first
            ? "Questions show once the organiser lets them through. Vote up the ones you want answered."
            : "Questions go straight to the board. Vote up the ones you want answered."}
      </p>
      {open && (
        <form className="live-form" onSubmit={ask}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Your question" aria-label="Your question" />
          <div className="live-row">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Your name (optional)" aria-label="Your name" />
            <button type="submit" className="live-btn" disabled={busy || text.trim().length < 3}>
              Ask
            </button>
          </div>
          {sent && <p className="live-note">{sent}</p>}
          {error && <p className="live-error">{error}</p>}
        </form>
      )}
      {feed.questions.length > 0 && (
        <ul className="live-questions" style={{ marginTop: 12 }}>
          {feed.questions.map((q) => (
            <li key={q.id} className={`live-question${q.status === "answered" ? " is-answered" : ""}`}>
              <button type="button" className={`live-vote${q.voted ? " is-on" : ""}`} aria-pressed={q.voted} aria-label={`${q.votes} votes${q.voted ? ", yours among them" : ""}`} onClick={() => vote(q)} disabled={q.status === "answered"}>
                <span aria-hidden="true">▲</span>
                {q.votes}
              </button>
              <div>
                <p>
                  {q.text}
                  {q.status === "answered" && <span className="live-pill">Answered</span>}
                  {q.pinned && <span className="live-pill">On screen</span>}
                </p>
                <small>
                  {q.author_name || "Anonymous"}
                  {q.mine ? " · you" : ""}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * The room on a phone: the banner, the poll that is up, the quiz if it runs,
 * the questions. Its server half (src/app/events/[slug]/live/page.jsx) finds
 * the event and hands over its id, slug and name, so the top of the room is
 * in the first paint; the feed is pushed after (src/api/liveStream.js), or
 * asked for every 5 seconds where it cannot be.
 */
const Live = ({ eventId, eventSlug = null, eventName = null }) => {
  const eventPage = eventSlug ? `/events/${encodeURIComponent(eventSlug)}` : `/${eventId}`;
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(false);

  /** One read now: "Retry", and after a question is asked. */
  const load = useCallback(async () => {
    try {
      setFeed(await liveApi.fetchFeed(eventId));
      setError(false);
    } catch {
      setError(true);
    }
  }, [eventId]);

  useEffect(
    () =>
      subscribe(
        "room",
        { eventId },
        {
          snapshot: (f) => {
            setFeed(f);
            setError(false);
          },
          error: () => setError(true),
        }
      ),
    [eventId]
  );

  const name = feed?.event?.name || eventName;
  const top = (
    <div className="live-top">
      <Link href={eventPage}>← Event</Link>
      {name ? <h1>{name}</h1> : null}
      <span className="live-dot">Live</span>
    </div>
  );

  if (error && !feed) {
    return (
      <div className="live-page">
        {top}
        <div className="loader-container" role="alert">
          <p>The room could not load. Please check your connection and try again.</p>
          <button type="button" onClick={load}>
            RETRY
          </button>
        </div>
      </div>
    );
  }
  if (!feed) {
    return (
      <div className="live-page">
        {top}
        <p className="live-sub" role="status">
          Opening the room…
        </p>
      </div>
    );
  }

  return (
    <div className="live-page">
      {top}
      {feed.banner && (
        <div className="live-banner" role="status">
          <span className="live-kind">{KIND[feed.banner.kind] || "Update"}</span>
          {feed.banner.text}
        </div>
      )}
      {feed.quiz?.live && <JoinQuiz eventId={eventId} title={feed.quiz.title} />}
      {feed.poll && <PollCard eventId={eventId} poll={feed.poll} onChange={(p) => setFeed((f) => ({ ...f, poll: p }))} />}
      <Questions
        eventId={eventId}
        feed={feed}
        onChange={(v) => {
          if (v && v.id) setFeed((f) => ({ ...f, questions: f.questions.map((q) => (q.id === v.id ? { ...q, votes: v.votes, voted: v.voted } : q)) }));
          else load();
        }}
      />
      {feed.updates.length > 1 && (
        <section className="live-card">
          <h2>Earlier tonight</h2>
          <ul className="live-questions">
            {feed.updates.slice(1).map((u) => (
              <li key={u.id} className="live-question">
                <div>
                  <p>{u.text}</p>
                  <small>{KIND[u.kind] || "Update"}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default Live;
