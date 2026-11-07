/**
 * Conditional registration questions (feature-register/conditional-questions-contract.md §3):
 * which of an event's questions this person is shown, given what they have
 * answered so far. One algorithm, the same in every repo:
 *
 *   visible(q) = q.show_if is null
 *                OR (visible(parent(q)) AND matches(answer(parent(q)), q.show_if.any_of))
 *
 *   matches(answer, any_of) = select / radio: answer ∈ any_of
 *                             checkbox:       at least one ticked value ∈ any_of
 *                             blank answer:   false
 *
 * A parent always comes before its children in the list (rule R1), so one
 * pass in list order settles every question. A parent that isn't in the form,
 * or comes after its child (a definition the server refuses), is never
 * visible by the time the child is reached, so the child stays hidden.
 *
 * Questions are read in either shape: the form's own (`showIf: {key, anyOf}`,
 * from parseQuestions) or the API's (`show_if: {key, any_of}`).
 */

/** `{key, anyOf}` when the question has a usable condition, else null (always shown). */
export function conditionOf(q) {
  const raw = q?.showIf ?? q?.show_if ?? null;
  if (!raw || typeof raw !== "object") return null;
  const key = typeof raw.key === "string" ? raw.key : raw.key !== null && raw.key !== undefined ? String(raw.key) : "";
  const list = Array.isArray(raw.anyOf) ? raw.anyOf : Array.isArray(raw.any_of) ? raw.any_of : null;
  if (!key || !list) return null;
  const anyOf = list.filter((v) => typeof v === "string");
  if (!anyOf.length) return null;
  return { key, anyOf };
}

const blank = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim());

/**
 * Whether a parent's answer reveals a child. A single answer (select, radio,
 * the site's pick-one checkbox) must be one of `anyOf`; a list of ticks needs
 * one of them to be. Blank never matches.
 */
export function matches(answer, anyOf) {
  if (!Array.isArray(anyOf) || !anyOf.length) return false;
  const picked = Array.isArray(answer) ? answer : [answer];
  return picked.some((v) => !blank(v) && anyOf.includes(typeof v === "string" ? v : String(v)));
}

/** The keys of the questions this person is shown, in one pass in list order. */
export function visibleKeys(questions, answers = {}) {
  const shown = new Set();
  if (!Array.isArray(questions)) return shown;
  const given = answers && typeof answers === "object" ? answers : {};
  for (const q of questions) {
    if (!q || q.key === undefined || q.key === null) continue;
    const key = String(q.key);
    const cond = conditionOf(q);
    if (!cond || (shown.has(cond.key) && matches(given[cond.key], cond.anyOf))) shown.add(key);
  }
  return shown;
}

/** The questions this person is shown, in the form's order. */
export function visibleQuestions(questions, answers = {}) {
  if (!Array.isArray(questions)) return [];
  const shown = visibleKeys(questions, answers);
  return questions.filter((q) => q && shown.has(String(q.key)));
}

/**
 * The answers without those to questions that are hidden now: what the form
 * keeps and sends (contract §4, §8). The same object back when nothing was
 * dropped. Keys that aren't questions of this form are left alone.
 */
export function pruneHidden(questions, answers) {
  const given = answers && typeof answers === "object" ? answers : {};
  if (!Array.isArray(questions) || !questions.length) return given;
  const shown = visibleKeys(questions, given);
  const asked = new Set(questions.filter(Boolean).map((q) => String(q.key)));
  let out = given;
  for (const k of Object.keys(given)) {
    if (asked.has(k) && !shown.has(k)) {
      if (out === given) out = { ...given };
      delete out[k];
    }
  }
  return out;
}

/** Whether any question in the form depends on another: false is the form's old shape. */
export const hasConditions = (questions) => Array.isArray(questions) && questions.some((q) => conditionOf(q) !== null);
