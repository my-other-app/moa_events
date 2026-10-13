import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import "@/styles/live.css";

import { errorLine, liveApi } from "@/api/live";

/** The feedback survey a guest's email links to: a few taps, one send. */
const Feedback = () => {
  const { eventId, registrationId } = useParams();
  const [params] = useSearchParams();
  const k = params.get("k") || "";
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    liveApi
      .fetchSurvey(eventId, registrationId, k)
      .then((s) => alive && (setSurvey(s), setDone(s.submitted)))
      .catch((e) => alive && setError(errorLine(e, "This link does not work. Open the one from your email.")));
    return () => {
      alive = false;
    };
  }, [eventId, registrationId, k]);

  const set = (key, value) => setAnswers((a) => ({ ...a, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    if (Object.keys(answers).length === 0) return setError("Answer at least one question.");
    setBusy(true);
    setError(null);
    try {
      await liveApi.submitSurvey(eventId, registrationId, k, answers);
      setDone(true);
    } catch (err) {
      setError(errorLine(err, "That did not send. Try again."));
    } finally {
      setBusy(false);
    }
  };

  if (error && !survey) {
    return (
      <div className="live-page">
        <section className="live-card">
          <h2>Hmm</h2>
          <p className="live-sub">{error}</p>
        </section>
      </div>
    );
  }
  if (!survey) return <p></p>;

  if (done) {
    return (
      <div className="live-page">
        <div className="survey-done">
          <h2>Thank you{survey.first_name ? `, ${survey.first_name}` : ""}.</h2>
          <p className="live-sub">{survey.club_name || "The organisers"} read every reply.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="live-page">
      <div className="live-top">
        <h1>How was {survey.event_name}?</h1>
      </div>
      <p className="live-sub">Two minutes, {survey.first_name || "friend"}. It shapes the next one.</p>
      <form className="live-card" onSubmit={submit} noValidate>
        {survey.questions.map((q) => (
          <div key={q.key} className="survey-q">
            <label htmlFor={`sq-${q.key}`}>{q.label}</label>
            {q.kind === "rating" && (
              <div className="live-stars" role="group" aria-label={q.label}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={Number(answers[q.key]) >= n ? "is-on" : ""} aria-label={`${n} of 5`} aria-pressed={Number(answers[q.key]) === n} onClick={() => set(q.key, n)}>
                    ★
                  </button>
                ))}
              </div>
            )}
            {q.kind === "nps" && (
              <>
                <div className="survey-scale" role="group" aria-label={q.label}>
                  {Array.from({ length: 11 }, (_, n) => (
                    <button key={n} type="button" className={answers[q.key] === n ? "is-on" : ""} aria-pressed={answers[q.key] === n} onClick={() => set(q.key, n)}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="survey-scale-legend">
                  <span>Not likely</span>
                  <span>Very likely</span>
                </div>
              </>
            )}
            {q.kind === "text" && <textarea id={`sq-${q.key}`} className="live-form" style={{ width: "100%" }} maxLength={1000} value={answers[q.key] || ""} onChange={(e) => set(q.key, e.target.value)} />}
          </div>
        ))}
        {error && <p className="live-error">{error}</p>}
        <button type="submit" className="live-btn" disabled={busy}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
};

export default Feedback;
