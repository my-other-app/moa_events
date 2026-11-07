import { describe, expect, it } from "vitest";
import { CONDITIONAL_FORM, FLAT_FORM } from "@/test/conditionalFixture";
import { conditionOf, hasConditions, matches, pruneHidden, visibleKeys, visibleQuestions } from "./conditions";
import { parseQuestions } from "./register";

/*
 * The visibility algorithm of the conditional-questions contract (§3), on its
 * shared test form (§12). Read in both shapes: the API's (`show_if`) and the
 * form's own, after parseQuestions (`showIf`).
 */
const shapes = [
  ["the API's shape", CONDITIONAL_FORM],
  ["the form's own shape", parseQuestions(CONDITIONAL_FORM)],
];

const shown = (form, answers) => [...visibleKeys(form, answers)];

describe.each(shapes)("which questions are shown, in %s", (_, form) => {
  it("shows only the unconditional questions before anything is answered", () => {
    expect(shown(form, {})).toEqual(["status", "tshirt"]);
    expect(visibleQuestions(form, {}).map((q) => q.key)).toEqual(["status", "tshirt"]);
  });

  it("Student: questions 1–4 and 8, in list order", () => {
    expect(shown(form, { status: "Student" })).toEqual(["status", "college", "year", "degree_type", "tshirt"]);
  });

  it("Student + UG: questions 1–4 and 8; 5–7 hidden", () => {
    const keys = shown(form, { status: "Student", degree_type: "UG" });
    expect(keys).toEqual(["status", "college", "year", "degree_type", "tshirt"]);
    for (const k of ["pg_spec", "company", "experience"]) expect(keys).not.toContain(k);
  });

  it("Student + PG: question 5 appears (nested)", () => {
    expect(shown(form, { status: "Student", degree_type: "PG" })).toEqual(["status", "college", "year", "degree_type", "pg_spec", "tshirt"]);
  });

  it("Working: questions 1 and 6–8; 2–5 hidden", () => {
    expect(shown(form, { status: "Working" })).toEqual(["status", "company", "experience", "tshirt"]);
  });

  it("a child of a hidden parent stays hidden, whatever the parent's old answer: nesting is an AND", () => {
    // degree_type still says PG, but it is hidden for someone working, so pg_spec is too.
    expect(shown(form, { status: "Working", degree_type: "PG" })).toEqual(["status", "company", "experience", "tshirt"]);
  });

  it("a blank or unknown parent answer reveals nothing", () => {
    expect(shown(form, { status: "" })).toEqual(["status", "tshirt"]);
    expect(shown(form, { status: "  " })).toEqual(["status", "tshirt"]);
    expect(shown(form, { status: null })).toEqual(["status", "tshirt"]);
    expect(shown(form, { status: "student" })).toEqual(["status", "tshirt"]);
    expect(shown(form, { status: "Retired" })).toEqual(["status", "tshirt"]);
  });
});

describe("matches", () => {
  it("select and radio: the answer is one of any_of", () => {
    expect(matches("Student", ["Student"])).toBe(true);
    expect(matches("Working", ["Student"])).toBe(false);
    expect(matches("PG", ["UG", "PG"])).toBe(true);
  });

  it("checkbox: at least one ticked value is one of any_of", () => {
    expect(matches(["Design", "Code"], ["Code"])).toBe(true);
    expect(matches(["Design"], ["Code", "Ops"])).toBe(false);
    expect(matches([], ["Code"])).toBe(false);
    expect(matches(["", null], ["Code"])).toBe(false);
  });

  it("blank never matches, and neither does an empty any_of", () => {
    expect(matches("", [""])).toBe(false);
    expect(matches(undefined, ["Student"])).toBe(false);
    expect(matches("Student", [])).toBe(false);
    expect(matches("Student", null)).toBe(false);
  });

  it("compares exactly, case and spaces included", () => {
    expect(matches("student", ["Student"])).toBe(false);
    expect(matches("Student ", ["Student"])).toBe(false);
  });

  it("reads a number answer as its text", () => {
    expect(matches(2, ["2"])).toBe(true);
  });
});

describe("conditionOf", () => {
  it("reads both shapes", () => {
    expect(conditionOf({ show_if: { key: "status", any_of: ["Student"] } })).toEqual({ key: "status", anyOf: ["Student"] });
    expect(conditionOf({ showIf: { key: "status", anyOf: ["Working"] } })).toEqual({ key: "status", anyOf: ["Working"] });
  });

  it("takes an absent, null or unusable condition as none: the question is always shown", () => {
    expect(conditionOf({})).toBeNull();
    expect(conditionOf({ show_if: null })).toBeNull();
    expect(conditionOf({ show_if: "status" })).toBeNull();
    expect(conditionOf({ show_if: { key: "", any_of: ["x"] } })).toBeNull();
    expect(conditionOf({ show_if: { key: "status" } })).toBeNull();
    expect(conditionOf({ show_if: { key: "status", any_of: [] } })).toBeNull();
    expect(conditionOf({ show_if: { key: "status", any_of: [1, null] } })).toBeNull();
    expect(conditionOf(null)).toBeNull();
  });
});

describe("definitions the server refuses, read safely all the same", () => {
  it("a child whose parent isn't in the form stays hidden", () => {
    const form = [{ key: "a", show_if: { key: "missing", any_of: ["x"] } }, { key: "b" }];
    expect(shown(form, { missing: "x" })).toEqual(["b"]);
  });

  it("a child before its parent stays hidden (one pass in list order)", () => {
    const form = [
      { key: "child", show_if: { key: "parent", any_of: ["Yes"] } },
      { key: "parent", field_type: "radio", options: ["Yes", "No"] },
    ];
    expect(shown(form, { parent: "Yes" })).toEqual(["parent"]);
  });

  it("a cycle shows neither question, and never loops", () => {
    const form = [
      { key: "a", show_if: { key: "b", any_of: ["x"] } },
      { key: "b", show_if: { key: "a", any_of: ["x"] } },
    ];
    expect(shown(form, { a: "x", b: "x" })).toEqual([]);
  });

  it("five levels deep still evaluates in one pass", () => {
    const form = [{ key: "l0", field_type: "radio", options: ["y", "n"] }];
    for (let i = 1; i <= 5; i += 1) form.push({ key: `l${i}`, field_type: "radio", options: ["y", "n"], show_if: { key: `l${i - 1}`, any_of: ["y"] } });
    const all = Object.fromEntries(form.map((q) => [q.key, "y"]));
    expect(shown(form, all)).toEqual(["l0", "l1", "l2", "l3", "l4", "l5"]);
    expect(shown(form, { ...all, l2: "n" })).toEqual(["l0", "l1", "l2"]);
  });

  it("is not thrown by junk", () => {
    expect([...visibleKeys(null, {})]).toEqual([]);
    expect([...visibleKeys([null, { label: "no key" }, { key: "k" }], null)]).toEqual(["k"]);
    expect(visibleQuestions(undefined)).toEqual([]);
  });
});

describe("pruneHidden: what the form keeps and sends", () => {
  const student = { status: "Student", college: "COEP", year: "2", degree_type: "PG", pg_spec: "VLSI", tshirt: "M" };

  it("Switching Student → Working drops the answers to 2–5", () => {
    const next = pruneHidden(CONDITIONAL_FORM, { ...student, status: "Working" });
    expect(next).toEqual({ status: "Working", tshirt: "M" });
  });

  it("Switching PG → UG drops only the answer to 5", () => {
    const next = pruneHidden(CONDITIONAL_FORM, { ...student, degree_type: "UG" });
    expect(next).toEqual({ status: "Student", college: "COEP", year: "2", degree_type: "UG", tshirt: "M" });
  });

  it("an old client's every-question-answered set keeps only what is shown", () => {
    const all = { ...student, company: "Acme", experience: "3-5" };
    expect(pruneHidden(CONDITIONAL_FORM, all)).toEqual(student);
    expect(pruneHidden(CONDITIONAL_FORM, { ...all, status: "Working" })).toEqual({ status: "Working", company: "Acme", experience: "3-5", tshirt: "M" });
  });

  it("clearing the parent drops every answer under it", () => {
    expect(pruneHidden(CONDITIONAL_FORM, { ...student, status: "" })).toEqual({ status: "", tshirt: "M" });
  });

  it("hands back the same object when nothing was dropped, and leaves keys the form doesn't ask alone", () => {
    const fine = { status: "Working", company: "Acme", extra: "kept" };
    expect(pruneHidden(CONDITIONAL_FORM, fine)).toBe(fine);
  });

  it("changes nothing for a form without conditions", () => {
    const all = { status: "Student", college: "COEP", company: "Acme", tshirt: "M" };
    expect(pruneHidden(FLAT_FORM, all)).toBe(all);
    expect(shown(FLAT_FORM, {})).toEqual(FLAT_FORM.map((q) => q.key));
    expect(pruneHidden([], all)).toBe(all);
  });
});

describe("hasConditions", () => {
  it("is true only when some question depends on another", () => {
    expect(hasConditions(CONDITIONAL_FORM)).toBe(true);
    expect(hasConditions(parseQuestions(CONDITIONAL_FORM))).toBe(true);
    expect(hasConditions(FLAT_FORM)).toBe(false);
    expect(hasConditions(parseQuestions(FLAT_FORM))).toBe(false);
    expect(hasConditions(null)).toBe(false);
  });
});
