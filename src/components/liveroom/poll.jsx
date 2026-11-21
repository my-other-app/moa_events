"use client";

import { useEffect, useState } from "react";

import { errorLine, liveApi } from "@/api/live";
import { mediaUrl } from "@/utils/liveTheme";
import Chart, { Bars, Cloud, amount } from "./charts";
import OrderList from "./order";

/**
 * The poll that is up, on a phone (CONTRACT 7). A poll with no settings
 * (and every poll from an API before the poll kinds) is exactly today's:
 * a choice's bars behind its buttons, a word cloud, five stars. What the
 * organiser can set changes only what they set:
 *
 *   kinds      choice (one, or up to N), words, rating (1–5 or 1–10, stars
 *              or numbers), ranking, open text (held for the host first)
 *   results    live, or only once closed; hidden from guests altogether
 *   show       percentages, counts or both;  chart: bars, columns, donut,
 *              word cloud (anything else: bars)
 *   voting     change the vote until it closes, or one answer only; a timer
 *   options    a picture on each option
 */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const and = (list) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

/** Seconds until `at` (an ISO time), ticking once a second; null without one. */
function useCountdown(at) {
  const end = at ? Date.parse(at) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(end)) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [end]);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Why the results are not on this phone (null when they are). */
function hiddenLine(poll, st) {
  if (!poll.results_hidden) return null;
  if (st.hide_results) return "The results show on the screen at the front.";
  return "The results show when the poll closes.";
}

/** The picture on option i, when the poll has them. */
const optionImage = (poll, i) => mediaUrl((poll.option_images || [])[i]);

export default function PollCard({ eventId, poll, onChange, theme = null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [word, setWord] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [sentText, setSentText] = useState(false);
  const st = poll.settings || {};
  const r = poll.results || {};
  const answered = poll.my_response != null && poll.my_response !== "";
  const left = useCountdown(poll.status === "live" ? poll.closes_at : null);
  const open = poll.status !== "closed" && left !== 0;
  const locked = !open || (answered && st.change_vote === false);
  const shown = !poll.results_hidden;
  const show = st.show || "both";
  const chart = st.chart || (poll.kind === "words" ? "cloud" : "bar");
  const multiple = poll.kind === "choice" && Number(st.max_choices || 1) > 1;
  const myValues = Array.isArray(poll.my_values) ? poll.my_values : answered ? [poll.my_response] : [];

  const send = async (answer) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await liveApi.respond(eventId, poll.id, answer));
      setWord("");
      return true;
    } catch (e) {
      setError(errorLine(e, "That did not go through. Try again."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const choices = r.choices || (poll.options || []).map((label) => ({ label, count: 0, pct: 0 }));
  // Today's look: the share behind each button. Other charts draw under plain buttons.
  const fills = shown && chart !== "column" && chart !== "donut";

  return (
    <section className={`live-card is-live${poll.status === "closed" ? " is-closed" : ""}`} id="live-poll" aria-labelledby="poll-heading">
      <p className="live-eyebrow">
        <span className="live-dot">{poll.status === "closed" ? "Poll closed" : "Poll"}</span>
      </p>
      <h2 id="poll-heading">{poll.prompt}</h2>
      <p className="live-sub" role="status">
        {plural(r.responses || 0, "answer", "answers")} so far{answered ? " · you answered" : ""}
        {left != null && left > 0 && <span className="lt-closes"> · closes in {clock(left)}</span>}
        {left === 0 && poll.status !== "closed" && <span className="lt-closes"> · time is up</span>}
      </p>
      {hiddenLine(poll, st) && <p className="lt-hidden-note">{hiddenLine(poll, st)}</p>}

      {poll.kind === "choice" && !multiple && (
        <>
          <div className="live-options">
            {choices.map((c, i) => {
              const mine = poll.my_response === c.label;
              const pct = Math.min(100, Math.max(0, c.pct || 0));
              const image = optionImage(poll, i);
              return (
                <button key={c.label} type="button" className={`live-option${mine ? " is-mine" : ""}${image ? " has-image" : ""}`} disabled={busy || locked} aria-pressed={mine} onClick={() => send(c.label)}>
                  {fills && <span className="live-fill" style={{ transform: `scaleX(${pct / 100})` }} aria-hidden="true" />}
                  <span className="live-option-text">
                    {mine && (
                      <span className="live-tick" aria-hidden="true">
                        ✓
                      </span>
                    )}
                    {image && <img className="lt-option-img" src={image} alt="" loading="lazy" decoding="async" />}
                    {c.label}
                  </span>
                  {fills && (
                    <span className="live-option-num">
                      {show !== "count" && <span className="live-pct">{c.pct}%</span>}
                      {show !== "percent" && <span className="live-count">{plural(c.count || 0, "vote", "votes")}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {shown && !fills && <Chart chart={chart} rows={choices} show={show} theme={theme} />}
          {answered && (
            <p className="live-said" role="status">
              You voted for <strong>{poll.my_response}</strong>.{locked ? "" : " Tap another to change it."}
            </p>
          )}
        </>
      )}

      {poll.kind === "choice" && multiple && (
        <MultipleChoice poll={poll} st={st} choices={choices} fills={fills} shown={shown} show={show} chart={chart} theme={theme} busy={busy} locked={locked} picked={picked} setPicked={setPicked} myValues={myValues} answered={answered} send={send} />
      )}

      {poll.kind === "words" && (
        <>
          {shown && (r.words || []).length > 0 && (chart === "cloud" ? <Cloud words={r.words} /> : <Chart chart={chart} rows={r.words.map((w) => ({ label: w.word, count: w.count, pct: r.responses ? (100 * w.count) / r.responses : 0 }))} show={show} theme={theme} unit={["time", "times"]} />)}
          {!locked && (
            <form
              className="live-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (word.trim().length >= 2) send(word.trim());
              }}
            >
              <input value={word} onChange={(e) => setWord(e.target.value)} maxLength={40} placeholder={answered ? `You said “${poll.my_response}” — change it?` : "A word or two"} aria-label="Your word" />
              <button type="submit" className="live-btn" disabled={busy || word.trim().length < 2}>
                Send
              </button>
            </form>
          )}
          {locked && answered && (
            <p className="live-said" role="status">
              You said <strong>{poll.my_response}</strong>.
            </p>
          )}
        </>
      )}

      {poll.kind === "rating" && <Rating poll={poll} st={st} r={r} shown={shown} busy={busy} locked={locked} send={send} />}

      {poll.kind === "ranking" && (
        <Ranking poll={poll} r={r} shown={shown} busy={busy} locked={locked} ranking={ranking} setRanking={setRanking} myValues={myValues} answered={answered} send={send} />
      )}

      {poll.kind === "text" && (
        <OpenText poll={poll} st={st} r={r} shown={shown} busy={busy} locked={locked} answered={answered} word={word} setWord={setWord} name={name} setName={setName} sent={sentText} send={async (a) => setSentText(await send(a))} />
      )}

      {!["choice", "words", "rating", "ranking", "text"].includes(poll.kind) && (
        <div className="lt-update" role="status">
          <p>This kind of poll needs a newer version of this page.</p>
          <button type="button" className="live-btn live-btn--block" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      )}

      {error && <p className="live-error">{error}</p>}
    </section>
  );
}

/** Multiple choice, at most N: toggle the options, then send them together. */
function MultipleChoice({ poll, st, choices, fills, shown, show, chart, theme, busy, locked, picked, setPicked, myValues, answered, send }) {
  const max = Number(st.max_choices || 1);
  const chosen = picked.length > 0 || !answered ? picked : myValues;
  const toggle = (label) =>
    setPicked((p) => {
      const base = p.length > 0 || !answered ? p : myValues;
      if (base.includes(label)) return base.filter((l) => l !== label);
      return base.length >= max ? base : [...base, label];
    });
  const changed = picked.length > 0 && (picked.length !== myValues.length || picked.some((l) => !myValues.includes(l)));
  return (
    <>
      {!locked && <p className="play-hint">Pick up to {max}.</p>}
      <div className="live-options" role="group" aria-label={`Pick up to ${max}`}>
        {choices.map((c, i) => {
          const on = chosen.includes(c.label);
          const pct = Math.min(100, Math.max(0, c.pct || 0));
          const image = optionImage(poll, i);
          const full = !on && chosen.length >= max;
          return (
            <button key={c.label} type="button" className={`live-option${on ? " is-mine" : ""}${image ? " has-image" : ""}`} disabled={busy || locked || full} aria-pressed={on} onClick={() => toggle(c.label)}>
              {fills && <span className="live-fill" style={{ transform: `scaleX(${pct / 100})` }} aria-hidden="true" />}
              <span className="live-option-text">
                {on && (
                  <span className="live-tick" aria-hidden="true">
                    ✓
                  </span>
                )}
                {image && <img className="lt-option-img" src={image} alt="" loading="lazy" decoding="async" />}
                {c.label}
              </span>
              {fills && (
                <span className="live-option-num">
                  {show !== "count" && <span className="live-pct">{c.pct}%</span>}
                  {show !== "percent" && <span className="live-count">{plural(c.count || 0, "vote", "votes")}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {shown && !fills && <Chart chart={chart} rows={choices} show={show} theme={theme} />}
      {!locked && (!answered || changed) && (
        <button type="button" className="live-btn live-btn--block play-send" disabled={busy || picked.length === 0} onClick={() => send({ values: picked }).then((ok) => ok && setPicked([]))}>
          {answered ? "Send my new picks" : picked.length === 0 ? "Pick your answers" : `Send ${plural(picked.length, "pick", "picks")}`}
        </button>
      )}
      {answered && (
        <p className="live-said" role="status">
          You picked <strong>{and(myValues)}</strong>.{locked ? "" : " Change them and send again."}
        </p>
      )}
    </>
  );
}

/** Stars (1–5) or numbers (1–5 or 1–10): one tap. */
function Rating({ poll, st, r, shown, busy, locked, send }) {
  const scale = Number(st.scale || r.scale || 5) === 10 ? 10 : 5;
  const numbers = (st.style || (scale === 10 ? "numbers" : "stars")) === "numbers";
  const mine = Number(poll.my_response);
  const values = Array.from({ length: scale }, (_, i) => i + 1);
  return (
    <>
      <div className={numbers ? `lt-scale is-${scale}` : "live-stars"} role="group" aria-label={`Rate from 1 to ${scale}`}>
        {values.map((n) => (
          <button
            key={n}
            type="button"
            className={numbers ? (mine === n ? "is-on" : "") : mine >= n ? "is-on" : ""}
            aria-label={`${n} of ${scale}`}
            aria-pressed={numbers ? mine === n : undefined}
            disabled={busy || locked}
            onClick={() => send(String(n))}
          >
            <span aria-hidden="true">{numbers ? n : "★"}</span>
          </button>
        ))}
      </div>
      {shown && r.rating?.average != null && (
        <p className="live-note" role="status">
          Room average {r.rating.average} of {scale}
        </p>
      )}
    </>
  );
}

/** Ranking: put the options in order, best first, and send it; the room's order once shown. */
function Ranking({ poll, r, shown, busy, locked, ranking, setRanking, myValues, answered, send }) {
  const options = poll.options || [];
  const start = answered && myValues.length === options.length ? myValues : options;
  const order = ranking || start;
  const items = order.map((label) => ({ key: label, label, image: optionImage(poll, options.indexOf(label)) }));
  const room = shown && Array.isArray(r.ranking) && (r.responses || 0) > 0 ? r.ranking : null;
  return (
    <>
      {!locked && <p className="play-hint">Put them in your order, best first.</p>}
      <OrderList items={items} onChange={setRanking} disabled={busy || locked} label={answered && !ranking ? "Your ranking" : "Your order, best first"} />
      {!locked && (!answered || ranking) && (
        <button type="button" className="live-btn live-btn--block play-send" disabled={busy} onClick={() => send({ order }).then((ok) => ok && setRanking(null))}>
          {answered ? "Send my new order" : "Send my order"}
        </button>
      )}
      {answered && !ranking && (
        <p className="live-said" role="status">
          Your order is in.{locked ? "" : " Move them and send again to change it."}
        </p>
      )}
      {room && (
        <div className="lt-room-rank">
          <h3>The room’s order</h3>
          <ol>
            {room.map((row) => (
              <li key={row.label}>
                <span className="lt-rank-label">{row.label}</span>
                {row.average != null && <span className="lt-rank-avg">average place {row.average}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

/** Open text: a line (and a name, where the poll shows names), held for the host before anyone sees it when moderated. */
function OpenText({ poll, st, r, shown, busy, locked, answered, word, setWord, name, setName, sent, send }) {
  const named = st.anonymous === false;
  const held = st.moderate !== false;
  const texts = shown && Array.isArray(r.texts) ? r.texts : [];
  return (
    <>
      {!locked && (
        <form
          className="live-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (word.trim()) send(named && name.trim() ? { value: word.trim(), name: name.trim() } : word.trim());
          }}
        >
          <textarea value={word} onChange={(e) => setWord(e.target.value)} maxLength={120} placeholder={answered ? "Change your answer?" : "Your answer"} aria-label="Your answer" />
          <div className="live-row">
            {named && <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Your name (optional)" aria-label="Your name" />}
            <button type="submit" className="live-btn" disabled={busy || !word.trim()}>
              Send
            </button>
          </div>
        </form>
      )}
      {(answered || sent) && (
        <p className="live-said" role="status">
          {held ? "Sent — it shows once the host lets it through." : "Sent."}
          {answered && poll.my_response ? (
            <>
              {" "}
              You said <strong>{poll.my_response}</strong>.
            </>
          ) : null}
        </p>
      )}
      {texts.length > 0 && (
        <ul className="lt-texts" aria-label="What the room said">
          {texts.map((t) => (
            <li key={t.id || t.text}>
              <p>{t.text}</p>
              {t.name && <small>{t.name}</small>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export { Bars, amount };
