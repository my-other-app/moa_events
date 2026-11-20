"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { errorLine, liveApi } from "@/api/live";
import { subscribe } from "@/api/liveStream";
import { useAuth } from "@/auth/context";
import { LiveFrame, ThemeLogo } from "@/components/liveroom/frame";
import PollCard from "@/components/liveroom/poll";
import { currentPlayer, refusalCode, rememberPlayer } from "@/utils/live";
import { guestTheme, rememberTheme, rememberedTheme } from "@/utils/liveTheme";

export { PollCard };

const KIND = { schedule: "Schedule change", room: "Room change", general: "Update" };

/**
 * What is on right now, as a row of chips under the room's title: the state
 * of the event, and a jump to each part that is running. Standing in a hall
 * with the phone at arm's length, this is the room at a glance.
 */
const Happening = ({ feed }) => {
  const chips = [];
  const status = feed.event?.status;
  if (status === "live") chips.push({ key: "live", label: "Event is live", tone: "live" });
  else if (status === "closed" || status === "archived") chips.push({ key: "live", label: "Event has ended", tone: "off" });
  else chips.push({ key: "live", label: "Event hasn’t started", tone: "off" });
  if (feed.quiz?.live) chips.push({ key: "quiz", label: "Quiz running", href: "#live-quiz", tone: "on" });
  if (feed.poll) chips.push({ key: "poll", label: feed.poll.status === "closed" ? "Poll results" : "Poll open", href: "#live-poll", tone: feed.poll.status === "closed" ? "off" : "on" });
  if (feed.qa?.open) chips.push({ key: "qa", label: "Q&A open", href: "#live-qa", tone: "on" });
  else if ((feed.questions || []).length) chips.push({ key: "qa", label: "Q&A closed", href: "#live-qa", tone: "off" });
  return (
    <ul className="live-states" aria-label="What is on right now">
      {chips.map((c) => (
        <li key={c.key}>
          {c.href ? (
            <a className={`live-state is-${c.tone}`} href={c.href}>
              {c.label}
            </a>
          ) : (
            <span className={`live-state is-${c.tone}`}>{c.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
};

/** How long the code box rests before the round behind the code is looked up. */
const LOOKUP_AFTER_MS = 400;

/**
 * The round behind a typed join code (CONTRACT 5.2, v1.3): looked up once
 * the box holds 4 to 8 digits and rests, the answer for the code as it now
 * stands. null while there is none (an unknown code, an API from before).
 */
function useRoundLookup(code) {
  const [found, setFound] = useState(null);
  const wanted = /^\d{4,8}$/.test(code) ? code : null;
  useEffect(() => {
    setFound(null);
    if (!wanted) return undefined;
    let gone = false;
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => liveApi.lookupQuiz(wanted))
        .then((round) => !gone && setFound(round ? { ...round, code: wanted } : null))
        .catch(() => !gone && setFound(null));
    }, LOOKUP_AFTER_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [wanted]);
  return found && found.code === wanted ? found : null;
}

/**
 * The door to the quiz: the code on the screen and a name. Once the code is
 * typed, what the round asks of a new player (CONTRACT 3.1 `players`,
 * `teams`): a team to pick, or the registered name instead of a nickname,
 * and a word when it has started and takes no one new. Every refusal is the
 * API's own sentence; one that needs the guest signed in offers the sign-in.
 */
const JoinQuiz = ({ eventId, quiz }) => {
  const router = useRouter();
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState(null);
  const [error, setError] = useState(null);
  const [signIn, setSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const player = currentPlayer(eventId);
  const round = useRoundLookup(code.trim());
  const list = round?.teams?.mode === "pick" && Array.isArray(round.teams.list) && round.teams.list.length >= 2 ? round.teams.list : null;
  const registered = round?.players?.names === "registered";
  const late = Boolean(round?.started && round?.players?.late_join === false);
  // A team picked for another code's round is not this one's.
  const picked = list && list.some((t) => t.key === team) ? team : null;
  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSignIn(false);
    const who = registered ? name.trim() || auth.user?.name || "Guest" : name.trim();
    try {
      const p = picked ? await liveApi.joinQuiz(code.trim(), who, picked) : await liveApi.joinQuiz(code.trim(), who);
      rememberPlayer(p.event_id, p);
      router.push(`/play/${p.event_id}`);
    } catch (err) {
      setError(errorLine(err, "Could not join. Check the code on the screen."));
      if (refusalCode(err) === "QUIZ_REGISTERED_ONLY" && auth.enabled && !auth.user) setSignIn(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="live-card is-live is-quiz" id="live-quiz" aria-labelledby="quiz-heading">
      <p className="live-eyebrow">
        <span className="live-dot">Quiz</span>
      </p>
      <h2 id="quiz-heading">{quiz?.title || "The quiz is on"}</h2>
      <p className="live-sub">
        {registered ? "Type the code on the screen. You play under the name you registered with." : "Type the code on the screen and your name. Fast right answers score most."}
      </p>
      {player ? (
        <button type="button" className="live-btn live-btn--block" onClick={() => router.push(`/play/${eventId}`)}>
          Back in as {player.name}
        </button>
      ) : (
        <form className="live-form" onSubmit={join}>
          <input className="live-code" inputMode="numeric" pattern="[0-9]*" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code on the screen" aria-label="Join code" />
          {!registered && <input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name for the quiz" />}
          {list && (
            <fieldset className="lt-teams-pick">
              <legend>Pick your team</legend>
              {list.map((t) => (
                <label key={t.key} className={`lt-team-choice${picked === t.key ? " is-on" : ""}`}>
                  <input type="radio" name="quiz-team" value={t.key} checked={picked === t.key} onChange={() => setTeam(t.key)} />
                  <span className="lt-swatch" style={{ background: t.color }} aria-hidden="true" />
                  <span>{t.name}</span>
                </label>
              ))}
            </fieldset>
          )}
          {late && (
            <p className="live-note" role="status">
              This round has started and takes no new players. If you were already playing, join again to carry on.
            </p>
          )}
          <button type="submit" className="live-btn live-btn--block" disabled={busy || code.trim().length < 4 || (!registered && !name.trim())}>
            Join the quiz
          </button>
          {error && <p className="live-error">{error}</p>}
          {signIn && (
            <button type="button" className="live-btn live-btn--block is-ghost" onClick={() => auth.openSignIn()}>
              Sign in
            </button>
          )}
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
  const questions = feed.questions || [];
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
  if (!open && questions.length === 0) {
    return refused ? (
      <p className="live-note" role="status">
        Questions aren&rsquo;t open right now.
      </p>
    ) : null;
  }
  return (
    <section className="live-card" id="live-qa" aria-labelledby="qa-heading">
      <h2 id="qa-heading">{open ? "Ask the room" : "Questions from the room"}</h2>
      <p className="live-sub">
        {!open
          ? "Questions aren’t open right now. Vote up the ones you want answered."
          : feed.qa.approve_first
            ? "Questions show once the organiser lets them through. Vote up the ones you want answered."
            : "Questions go straight to the board. Vote up the ones you want answered."}
      </p>
      {open && (
        <form className="live-form live-ask" onSubmit={ask}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Your question" aria-label="Your question" />
          <div className="live-row">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Your name (optional)" aria-label="Your name" />
            <button type="submit" className="live-btn" disabled={busy || text.trim().length < 3}>
              Ask
            </button>
          </div>
          {sent && (
            <p className="live-said" role="status">
              {sent}
            </p>
          )}
          {error && <p className="live-error">{error}</p>}
        </form>
      )}
      {questions.length > 0 ? (
        <ul className="live-questions">
          {questions.map((q) => (
            <li key={q.id} className={`live-question${q.status === "answered" ? " is-answered" : ""}${q.pinned ? " is-pinned" : ""}`}>
              <button type="button" className={`live-vote${q.voted ? " is-on" : ""}`} aria-pressed={q.voted} aria-label={`${q.votes} votes${q.voted ? ", yours among them" : ""}`} onClick={() => vote(q)} disabled={q.status === "answered"}>
                <span aria-hidden="true">▲</span>
                <span className="live-vote-n">{q.votes}</span>
              </button>
              <div className="live-question-body">
                <p>{q.text}</p>
                <small>
                  {q.author_name || "Anonymous"}
                  {q.mine ? " · you" : ""}
                  {q.status === "answered" && <span className="live-pill">Answered</span>}
                  {q.pinned && <span className="live-pill is-on">On screen</span>}
                </small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="live-empty">No questions yet. Ask the first one.</p>
      )}
    </section>
  );
};

/** Nothing is up: the room says so rather than looking broken. */
const Waiting = () => (
  <section className="live-card live-waiting" role="status">
    <span className="live-waiting-mark" aria-hidden="true" />
    <h2>Nothing on the screen yet</h2>
    <p className="live-sub">Polls, the quiz and the questions show up here as the host runs them. Keep this page open.</p>
  </section>
);

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
  /** The theme this tab last saw for the room: the first paint's, until the feed brings its own. */
  const [kept, setKept] = useState(null);
  useEffect(() => setKept(rememberedTheme(eventId)), [eventId]);
  // The room's theme (an API from before themes sends none: today's look), kept for the quiz page.
  const wrapper = feed ? feed.theme : kept;
  const theme = guestTheme(wrapper);
  const version = feed && feed.theme ? `${feed.theme.custom}:${feed.theme.version}` : null;
  useEffect(() => {
    if (version) rememberTheme(eventId, feed.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, version]);

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
    <header className="live-top">
      <Link className="live-back" href={eventPage}>
        ← Event
      </Link>
      <ThemeLogo theme={theme} />
      {name ? <h1>{name}</h1> : null}
      <span className="live-dot is-red">Live</span>
    </header>
  );

  if (error && !feed) {
    return (
      <LiveFrame theme={theme}>
        {top}
        <section className="live-card live-offline" role="alert">
          <h2>The room didn’t load</h2>
          <p className="live-sub">Check your connection — the hall’s Wi-Fi may be busy — and try again.</p>
          <button type="button" className="live-btn live-btn--block" onClick={load}>
            RETRY
          </button>
        </section>
      </LiveFrame>
    );
  }
  if (!feed) {
    return (
      <LiveFrame theme={theme}>
        {top}
        <section className="live-card" aria-hidden="true">
          <span className="live-skel is-short" />
          <span className="live-skel" />
          <span className="live-skel is-block" />
        </section>
        <p className="live-sub" role="status">
          Opening the room…
        </p>
      </LiveFrame>
    );
  }

  const nothingOn = !feed.banner && !feed.poll && !feed.quiz?.live && (feed.questions || []).length === 0 && !feed.qa?.open;

  return (
    <LiveFrame theme={theme}>
      {top}
      {error && (
        <p className="live-reconnecting" role="status">
          Lost the room for a moment — trying again…
        </p>
      )}
      <Happening feed={feed} />
      {feed.banner && (
        <div className="live-banner" role="status">
          <span className="live-kind">{KIND[feed.banner.kind] || "Update"}</span>
          {feed.banner.text}
        </div>
      )}
      {feed.quiz?.live && <JoinQuiz eventId={eventId} quiz={feed.quiz} />}
      {feed.poll && <PollCard key={feed.poll.id} eventId={eventId} poll={feed.poll} theme={theme} onChange={(p) => setFeed((f) => ({ ...f, poll: p }))} />}
      <Questions
        eventId={eventId}
        feed={feed}
        onChange={(v) => {
          if (v && v.id) setFeed((f) => ({ ...f, questions: f.questions.map((q) => (q.id === v.id ? { ...q, votes: v.votes, voted: v.voted } : q)) }));
          else load();
        }}
      />
      {nothingOn && <Waiting />}
      {feed.updates.length > 1 && (
        <section className="live-card">
          <h2>Earlier tonight</h2>
          <ul className="live-updates">
            {feed.updates.slice(1).map((u) => (
              <li key={u.id}>
                <span className="live-kind">{KIND[u.kind] || "Update"}</span>
                <p>{u.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </LiveFrame>
  );
};

export default Live;
