import { describe, expect, it } from "vitest";
import { CONDITIONAL_FORM, FLAT_FORM } from "@/test/conditionalFixture";
import { buildPayload, describeRegisterError, parseQuestions, revealNote, stepsFor, validateAnswers } from "./register";

/*
 * The registration form's own reading of conditional questions
 * (conditional-questions-contract.md §5, §8), on the shared test form (§12).
 */
const form = parseQuestions(CONDITIONAL_FORM);
const byKey = Object.fromEntries(form.map((q) => [q.key, q]));
const values = { name: "Asha Rao", email: "asha@example.org", phone: "98765 43210" };

describe("reading conditional questions", () => {
  it("takes required_when_shown as the question's required, and keeps the condition", () => {
    expect(byKey.college).toEqual({ key: "college", label: "College name", type: "text", required: true, options: [], showIf: { key: "status", anyOf: ["Student"] } });
    expect(byKey.pg_spec.showIf).toEqual({ key: "degree_type", anyOf: ["PG"] });
    expect(byKey.experience.required).toBe(true);
  });

  it("reads a question without show_if exactly as it always did", () => {
    expect(byKey.status).toEqual({ key: "status", label: "Are you working or a student?", type: "radio", required: true, options: ["Student", "Working"] });
    expect(byKey.tshirt).toEqual({ key: "tshirt", label: "T-shirt size", type: "select", required: true, options: ["S", "M", "L", "XL"] });
    // required_when_shown means nothing without a condition: the wire never sends it so, and `required` stays the truth.
    expect(parseQuestions([{ key: "k", field_type: "text", required: false, required_when_shown: true }])[0].required).toBe(false);
  });

  it("an optional conditional question stays optional", () => {
    const [, child] = parseQuestions([
      { key: "p", field_type: "radio", options: ["a", "b"] },
      { key: "c", field_type: "text", required: false, required_when_shown: false, show_if: { key: "p", any_of: ["a"] } },
    ]);
    expect(child.required).toBe(false);
  });

  it("without required_when_shown (a server that only sent show_if), falls back to required", () => {
    const [, a, b] = parseQuestions([
      { key: "p", field_type: "radio", options: ["a"] },
      { key: "c", field_type: "text", required: true, show_if: { key: "p", any_of: ["a"] } },
      { key: "d", field_type: "text", required: false, show_if: { key: "p", any_of: ["a"] } },
    ]);
    expect(a.required).toBe(true);
    expect(b.required).toBe(false);
  });

  it("a malformed condition is no condition: the question reads as the old shape", () => {
    const [q] = parseQuestions([{ key: "k", field_type: "text", required: false, required_when_shown: true, show_if: { key: "p", any_of: [] } }]);
    expect(q).toEqual({ key: "k", label: "k", type: "text", required: false, options: [] });
  });
});

describe("checking the answers", () => {
  const errs = (answers) => Object.keys(validateAnswers(form, answers));

  it("requires only what is shown: nothing hidden is ever required", () => {
    expect(errs({})).toEqual(["status", "tshirt"]);
    expect(errs({ status: "Student", degree_type: "UG", tshirt: "M" })).toEqual(["college", "year"]);
    expect(errs({ status: "Working", tshirt: "M" })).toEqual(["company", "experience"]);
  });

  it("requires the nested question only once PG is picked", () => {
    const ug = { status: "Student", college: "COEP", year: "2", degree_type: "UG", tshirt: "M" };
    expect(errs(ug)).toEqual([]);
    expect(errs({ ...ug, degree_type: "PG" })).toEqual(["pg_spec"]);
    expect(errs({ ...ug, degree_type: "PG", pg_spec: "VLSI" })).toEqual([]);
  });

  it("never checks a hidden answer, even a wrong one", () => {
    expect(errs({ status: "Working", company: "Acme", experience: "3-5", tshirt: "M", year: "nine" })).toEqual([]);
  });

  it("checks an unconditional form exactly as before", () => {
    expect(Object.keys(validateAnswers(parseQuestions(FLAT_FORM), {}))).toEqual(FLAT_FORM.map((q) => q.key));
  });
});

describe("the payload", () => {
  const send = (answers, questions = form) => buildPayload({ values, questions, answers, ref: null }).additional_details;

  it("never carries a hidden answer", () => {
    const everything = { status: "Working", college: "COEP", year: "2", degree_type: "PG", pg_spec: "VLSI", company: "Acme", experience: "3-5", tshirt: "M" };
    expect(send(everything)).toEqual({ status: "Working", company: "Acme", experience: "3-5", tshirt: "M" });
  });

  it("Student + PG sends the nested answer; Student + UG doesn't", () => {
    const pg = { status: "Student", college: "COEP", year: "2", degree_type: "PG", pg_spec: "VLSI", tshirt: "L" };
    expect(send(pg)).toEqual(pg);
    const { pg_spec, ...ug } = pg; // eslint-disable-line no-unused-vars
    expect(send({ ...pg, degree_type: "UG" })).toEqual({ ...ug, degree_type: "UG" });
  });

  it("is unchanged for a form without conditions", () => {
    const flat = parseQuestions(FLAT_FORM);
    const all = { status: "Working", college: "COEP", company: "Acme", tshirt: "M" };
    expect(send(all, flat)).toEqual(all);
    expect(buildPayload({ values, questions: flat, answers: {}, ref: null })).toEqual({
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: undefined,
      accepts_approval: true,
    });
  });
});

describe("the steps", () => {
  it("still has a questions step: the first question can't depend on another", () => {
    expect(stepsFor({ questions: form.filter((q) => !q.showIf) }).map((s) => s.id)).toEqual(["details", "questions", "review"]);
  });
});

describe("a server refusal naming a question", () => {
  const refusal = (errors) => ({ status: 400, data: { message: "Check your answers: PG specialisation.", error_code: "INVALID_ANSWERS", errors } });

  it("goes beside the question when it is shown", () => {
    const p = describeRegisterError(refusal({ pg_spec: "This field is required" }), ["status", "college", "year", "degree_type", "pg_spec", "tshirt"]);
    expect(p).toEqual({ kind: "fields", fields: { "q:pg_spec": "This field is required" }, message: "Check your answers: PG specialisation." });
  });

  it("is said in the server's words when the question it names isn't shown here", () => {
    const p = describeRegisterError(refusal({ pg_spec: "This field is required" }), ["status", "company", "experience", "tshirt"]);
    expect(p).toEqual({ kind: "message", message: "Check your answers: PG specialisation." });
  });
});

describe("what a screen reader hears", () => {
  it("names the questions brought in, and those that no longer apply", () => {
    expect(revealNote([byKey.pg_spec])).toBe("New question: PG specialisation.");
    expect(revealNote([byKey.college, byKey.year, byKey.degree_type])).toBe("3 new questions: College name, Year of study, Degree type.");
    expect(revealNote([byKey.company, byKey.experience], [byKey.college, byKey.year, byKey.degree_type])).toBe(
      "2 new questions: Company, Years of experience. College name, Year of study, Degree type no longer apply.",
    );
    expect(revealNote([], [byKey.pg_spec])).toBe("PG specialisation no longer applies.");
    expect(revealNote()).toBeNull();
  });
});
