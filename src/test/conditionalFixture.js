/**
 * The shared test form of feature-register/conditional-questions-contract.md §12,
 * exactly as every repo tests it, in the wire format the API sends (§5): a
 * question with `show_if` comes as `required: false` with the organiser's
 * setting in `required_when_shown`; one without it as it always did.
 *
 *   1 status       radio   [Student, Working]   required
 *   2 college      text                         required  show_if status ∈ [Student]
 *   3 year         select  [1, 2, 3, 4]         required  show_if status ∈ [Student]
 *   4 degree_type  radio   [UG, PG]             required  show_if status ∈ [Student]
 *   5 pg_spec      text                         required  show_if degree_type ∈ [PG]  ← nested
 *   6 company      text                         required  show_if status ∈ [Working]
 *   7 experience   select  [0-2, 3-5, 5+]       required  show_if status ∈ [Working]
 *   8 tshirt       select  [S, M, L, XL]        required
 */
const when = (key, anyOf) => ({ required: false, required_when_shown: true, show_if: { key, any_of: anyOf } });

export const CONDITIONAL_FORM = [
  { key: "status", label: "Are you working or a student?", field_type: "radio", required: true, options: ["Student", "Working"] },
  { key: "college", label: "College name", field_type: "text", options: null, ...when("status", ["Student"]) },
  { key: "year", label: "Year of study", field_type: "select", options: ["1", "2", "3", "4"], ...when("status", ["Student"]) },
  { key: "degree_type", label: "Degree type", field_type: "radio", options: ["UG", "PG"], ...when("status", ["Student"]) },
  { key: "pg_spec", label: "PG specialisation", field_type: "text", options: null, ...when("degree_type", ["PG"]) },
  { key: "company", label: "Company", field_type: "text", options: null, ...when("status", ["Working"]) },
  { key: "experience", label: "Years of experience", field_type: "select", options: ["0-2", "3-5", "5+"], ...when("status", ["Working"]) },
  { key: "tshirt", label: "T-shirt size", field_type: "select", required: true, options: ["S", "M", "L", "XL"] },
];

/** The same form with every condition taken off: the form's old shape. */
export const FLAT_FORM = CONDITIONAL_FORM.map((q) => {
  const { show_if, required_when_shown, ...rest } = q; // eslint-disable-line no-unused-vars
  return { ...rest, required: true };
});

export const STUDENT_KEYS = ["college", "year", "degree_type"];
export const WORKING_KEYS = ["company", "experience"];
