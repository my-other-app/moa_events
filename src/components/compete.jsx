import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { competitionApi, errorLine } from "@/api/competition";
import "@/styles/compete.css";

/**
 * A team's side of the competition, from their ticket: pick a track and
 * make a team or join an open one, say you are looking for teammates,
 * hand in the links before the close, book a mentor's slot, and see the
 * board once the organisers make it public.
 */
const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const fmtWhen = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Section({ title, sub, children }) {
  return (
    <section className="cp-card">
      <h2>{title}</h2>
      {sub ? <p className="cp-sub">{sub}</p> : null}
      {children}
    </section>
  );
}

function TeamUp({ eventId, me, onChange, say }) {
  const [name, setName] = useState("");
  const [track, setTrack] = useState("");
  const [skills, setSkills] = useState(me.seeking?.skills.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try {
      onChange(await fn());
    } catch (e) {
      say(errorLine(e, "That did not go through"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Find your team" sub={`Teams are ${me.team_min === me.team_max ? `${me.team_max}` : `${me.team_min} to ${me.team_max}`} people. Make one, or join one with a spot.`}>
      {me.teams_locked ? <p className="cp-note">Teams are locked. Ask the organisers to move you.</p> : null}
      <form
        className="cp-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) run(() => competitionApi.makeTeam(eventId, name.trim(), track ? Number(track) : null));
        }}
      >
        <input className="cp-input" placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={busy || me.teams_locked} aria-label="Team name" />
        {me.tracks.length ? (
          <select className="cp-input" value={track} onChange={(e) => setTrack(e.target.value)} disabled={busy || me.teams_locked} aria-label="Track">
            <option value="">Pick a track</option>
            {me.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
        <button type="submit" className="live-btn" disabled={busy || me.teams_locked || !name.trim()}>
          Make a team
        </button>
      </form>
      {me.open_teams.length ? (
        <ul className="cp-list">
          {me.open_teams.map((t) => (
            <li key={t.id} className="cp-team">
              <span>
                <strong>{t.name}</strong>
                <small>
                  {t.track ?? "No track"} · {t.members} of {me.team_max}
                </small>
              </span>
              <button type="button" className="live-btn is-ghost" disabled={busy || me.teams_locked} onClick={() => run(() => competitionApi.joinTeam(eventId, t.id))}>
                Join
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="cp-note">No open teams yet.</p>
      )}
      <div className="cp-seek">
        <label className="cp-check">
          <input type="checkbox" checked={!!me.seeking} disabled={busy || me.teams_locked} onChange={(e) => run(() => competitionApi.seeking(eventId, e.target.checked, skills.split(",").map((s) => s.trim()).filter(Boolean)))} />
          Find me teammates — list me as looking for a team
        </label>
        {me.seeking ? (
          <div className="cp-row">
            <input className="cp-input" placeholder="What you bring, comma-separated: ML, PCB, pitching" value={skills} onChange={(e) => setSkills(e.target.value)} onBlur={() => run(() => competitionApi.seeking(eventId, true, skills.split(",").map((s) => s.trim()).filter(Boolean)))} aria-label="Skills" maxLength={120} />
          </div>
        ) : null}
      </div>
      {me.seekers.length ? (
        <>
          <h3 className="cp-h3">Also looking</h3>
          <ul className="cp-list">
            {me.seekers.map((s) => (
              <li key={s.registration_id} className="cp-team">
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.skills.join(" · ") || "—"}</small>
                </span>
              </li>
            ))}
          </ul>
          <p className="cp-note">Make a team and they can join it from here.</p>
        </>
      ) : null}
    </Section>
  );
}

function MyTeam({ eventId, me, onChange, say }) {
  const t = me.team;
  const [fields, setFields] = useState(t.submission.fields);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFields(t.submission.fields), [t.submission.fields]);
  const run = async (fn) => {
    setBusy(true);
    try {
      onChange(await fn());
    } catch (e) {
      say(errorLine(e, "That did not go through"));
    } finally {
      setBusy(false);
    }
  };
  const status = t.submission.status;
  return (
    <>
      <Section title={t.name} sub={`${t.track ?? "No track yet"} · ${t.members.length} of ${me.team_max}${t.stage !== "entered" ? ` · ${t.stage === "finalist" ? "Finalist" : "Shortlisted"}` : ""}`}>
        <ul className="cp-members">
          {t.members.map((m) => (
            <li key={m.registration_id}>{m.name}</li>
          ))}
        </ul>
        {me.tracks.length ? (
          <div className="cp-row">
            <select className="cp-input" value={t.track_id ?? ""} disabled={busy || me.teams_locked} aria-label="Track" onChange={(e) => run(() => competitionApi.renameTeam(eventId, { track_id: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">No track</option>
              {me.tracks.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {t.open_spots > 0 ? <p className="cp-note">{t.open_spots} more can join — tell them to open their ticket and pick your team.</p> : null}
        {!me.teams_locked ? (
          <button type="button" className="live-btn is-ghost" disabled={busy} onClick={() => run(() => competitionApi.leaveTeam(eventId))}>
            Leave the team
          </button>
        ) : null}
      </Section>
      <Section title="Your submission" sub={me.submissions_open ? (me.submissions_close_at ? `Closes ${fmtWhen(me.submissions_close_at)}.` : "Open until the organisers close it.") : "Submissions are closed."}>
        <p className={`cp-status is-${status}`}>{status === "complete" ? "Everything required is in." : status === "in_progress" ? `Still missing: ${t.submission.missing.map((k) => me.requirements.find((r) => r.key === k)?.label ?? k).join(", ")}` : "Nothing handed in yet."}</p>
        <form
          className="cp-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => competitionApi.submit(eventId, fields));
          }}
        >
          {me.requirements.map((r) => (
            <label key={r.key} className="cp-field">
              <span>
                {r.label} {r.required ? <em>required</em> : <em>optional</em>}
              </span>
              <input className="cp-input" type="url" placeholder="https://…" value={fields[r.key] ?? ""} onChange={(e) => setFields({ ...fields, [r.key]: e.target.value })} disabled={busy || !me.submissions_open} />
            </label>
          ))}
          <button type="submit" className="live-btn" disabled={busy || !me.submissions_open}>
            Save submission
          </button>
        </form>
      </Section>
      {me.mentors.length ? (
        <Section title="Mentor office hours" sub="Tap a free slot to book it for your team; tap yours to free it. One slot per mentor.">
          {me.mentors.map((m) => (
            <div key={m.id} className="cp-mentor">
              <strong>{m.name}</strong>
              <small>{m.topic ?? ""}</small>
              <div className="cp-slots">
                {m.slots.map((s) => {
                  const mine = s.team_id === t.id;
                  const taken = s.team_id !== null && !mine;
                  return (
                    <button key={s.id} type="button" className={`cp-slot${mine ? " is-mine" : taken ? " is-taken" : ""}`} disabled={busy || taken} onClick={() => run(() => (mine ? competitionApi.free(eventId, s.id) : competitionApi.book(eventId, s.id)))}>
                      {fmtTime(s.starts_at)}
                      <small>{mine ? "Yours" : taken ? "Taken" : "Free"}</small>
                    </button>
                  );
                })}
                {m.slots.length === 0 ? <p className="cp-note">No slots opened yet.</p> : null}
              </div>
            </div>
          ))}
        </Section>
      ) : null}
    </>
  );
}

/** Under /events/{slug}/compete it is handed the event's id and slug; the id from the address is the fallback. */
const Compete = ({ eventId: eventIdProp, eventSlug } = {}) => {
  const params = useParams();
  const eventId = eventIdProp ?? params.eventId;
  const eventPage = eventSlug ? `/events/${encodeURIComponent(eventSlug)}` : `/${eventId}`;
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const say = (line) => {
    setToast(line);
    setTimeout(() => setToast(null), 3500);
  };
  const load = useCallback(async () => {
    try {
      setMe(await competitionApi.me(eventId));
      setError(null);
    } catch (e) {
      setError(e?.response?.status === 403 ? "Register for the event first, then come back here from your ticket." : e?.response?.status === 404 ? "This event has no competition." : e?.response?.status === 401 ? "Sign in from your ticket to see your team." : "Could not load. Check your connection and try again.");
    }
  }, [eventId]);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  if (error && !me) {
    return (
      <div className="live-page">
        <div className="live-top">
          <Link to={eventPage}>← Event</Link>
          <h1>Competition</h1>
        </div>
        <p className="cp-note">{error}</p>
        <button className="live-btn is-ghost" onClick={load}>
          Try again
        </button>
      </div>
    );
  }
  if (!me) return <p></p>;

  return (
    <div className="live-page">
      <div className="live-top">
        <Link to={eventPage}>← Event</Link>
        <h1>Competition</h1>
      </div>
      {toast ? (
        <div className="live-banner" role="status">
          {toast}
        </div>
      ) : null}
      {me.tracks.length ? (
        <Section title="Tracks" sub="Pick one when you register your project.">
          <ul className="cp-list">
            {me.tracks.map((t) => (
              <li key={t.id} className="cp-track">
                <strong>{t.name}</strong>
                {t.description ? <p>{t.description}</p> : null}
                <small>
                  {[t.sponsor ? `Sponsored by ${t.sponsor}` : null, t.prize, `${t.teams} ${t.teams === 1 ? "team" : "teams"}`].filter(Boolean).join(" · ")}
                </small>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {me.team ? <MyTeam eventId={eventId} me={me} onChange={setMe} say={say} /> : <TeamUp eventId={eventId} me={me} onChange={setMe} say={say} />}
      {me.board ? (
        <Section title="Leaderboard">
          <ol className="cp-board">
            {me.board.map((r) => (
              <li key={r.team_id} className={me.team && r.team_id === me.team.id ? "is-mine" : ""}>
                <span className="cp-rank">{r.rank ?? "–"}</span>
                <span className="cp-name">
                  {r.name}
                  <small>{r.track ?? ""}</small>
                </span>
                <span className="cp-score">{r.score === null ? "—" : r.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </div>
  );
};

export default Compete;
