const agendaTime = (iso, tz) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const agendaDay = (iso, tz) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const dayOf = (iso, tz) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * The run of show as a timeline, grouped by day when it spans more than
 * one; parallel tracks are marked. Times are in the event's own zone.
 */
export function Agenda({ agenda, id = "agenda", title = "Agenda" }) {
  const tz = agenda.timezone || "Asia/Kolkata";
  const days = [...new Set(agenda.items.map((i) => dayOf(i.starts_at, tz)))];
  const headingId = `${id}-title`;
  return (
    <section id={id} className="ep-section ep-agenda" aria-labelledby={headingId}>
      <h2 className="ep-h2" id={headingId}>
        {title}
      </h2>
      {days.map((day) => {
        const items = agenda.items.filter((i) => dayOf(i.starts_at, tz) === day);
        return (
          <div key={day} className="ep-agenda-day">
            {days.length > 1 && <h3 className="ep-agenda-dayhead">{agendaDay(items[0].starts_at, tz)}</h3>}
            <ol className="ep-agenda-list">
              {items.map((i) => (
                <li key={i.id} className="ep-agenda-item">
                  <div className="ep-agenda-time">
                    <time dateTime={i.starts_at}>{agendaTime(i.starts_at, tz)}</time>
                    {i.ends_at && <span className="ep-agenda-end">– {agendaTime(i.ends_at, tz)}</span>}
                  </div>
                  <div className="ep-agenda-body">
                    <p className="ep-agenda-title">
                      {i.title}
                      {i.parallel && <span className="ep-agenda-parallel">Parallel</span>}
                    </p>
                    {(i.speaker || i.location) && <p className="ep-agenda-meta">{[i.speaker, i.location].filter(Boolean).join(" · ")}</p>}
                    {i.description && <p className="ep-agenda-desc">{i.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

export default Agenda;
