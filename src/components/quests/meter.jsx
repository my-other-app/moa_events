/**
 * How far along the guest is, as a bar: `value` of `max` (points, or tasks
 * done), with the milestones as marks on it. A real progressbar for screen
 * readers, with the words that say it (`label`, e.g. "12 of 20 points").
 * The fill grows by transform, never by width (styles/motion.css).
 */
export function QuestMeter({ value, max, marks = [], label }) {
  const top = Math.max(1, Number(max) || 0);
  const v = Math.min(top, Math.max(0, Number(value) || 0));
  return (
    <div className="qs-meter" role="progressbar" aria-valuemin={0} aria-valuemax={top} aria-valuenow={v} aria-valuetext={label}>
      <span className="qs-meter-fill" style={{ transform: `scaleX(${v / top})` }} />
      {marks
        .filter((m) => m > 0 && m < top)
        .map((m) => (
          <span key={m} className={`qs-meter-mark${v >= m ? " is-passed" : ""}`} style={{ left: `${(m / top) * 100}%` }} aria-hidden="true" />
        ))}
    </div>
  );
}
