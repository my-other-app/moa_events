import { describe, expect, it } from "vitest";
import { CONDITIONAL_FORM } from "@/test/conditionalFixture";
import {
  addThem,
  answersErrors,
  answersPayload,
  asText,
  byWhen,
  changeAnswer,
  describeAnswersError,
  detailsNeeded,
  editableKeys,
  parseAnswersNeeded,
  parseAnswersPage,
  shownQuestions,
  startAnswers,
  untouched,
} from "./answers";
import { parseQuestions, validateAnswers } from "./register";

/*
 * Missing answers (feature-register/missing-answers-contract.md): the page's
 * shape as the API sends it (§2.3), which of the form's questions it shows
 * and sends (the conditional rules of conditional-questions-contract.md,
 * tested on its shared form §12), and the `answers_needed` flag (§2.4).
 */

const LINK = "https://myotherapp.in/answers/68/0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f?k=3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7";
const PATH = "/answers/68/0b6e1f9a-4c1d-4d7e-9a51-1f2b3c4d5e6f?k=3f2a9c0d4e5b6a7f8091a2b3c4d5e6f7";

/** GET /events/{id}/answers/{ref}, as the API sends it. */
const RAW = (over = {}) => ({
  status: "open",
  event: { id: 68, name: "DevFest Kochi", starts_at: "2026-11-21T09:30:00+05:30", org_name: "GDG Kochi", poster: null, slug: "devfest-kochi" },
  person: { first_name: "Haritha", kind: "registration" },
  deadline: "2026-11-14T18:00:00+05:30",
  message: "We need 2 more details for your DevFest ticket.",
  questions: CONDITIONAL_FORM,
  asked: ["tshirt", "pg_spec"],
  answers: { status: "Student", college: "COEP", year: "2", degree_type: "PG" },
  ticket_url: "https://myotherapp.in/tickets/MOA-7K3QF-X9PWM",
  ...over,
});

const formOf = (over = {}) => startAnswers(parseAnswersPage(RAW(over)));
const keys = (qs) => qs.map((q) => q.key);

describe("answers_needed: the note's flag", () => {
  it("reads the count, the link (as the site's own path) and the deadline", () => {
    expect(parseAnswersNeeded({ count: 2, url: LINK, deadline: "2026-11-14T18:00:00+05:30" })).toEqual({ count: 2, href: PATH, deadline: "2026-11-14T18:00:00+05:30" });
    expect(parseAnswersNeeded({ count: "1", url: LINK, deadline: null })).toEqual({ count: 1, href: PATH, deadline: null });
  });

  it("is nothing from an older API, for nothing to ask, or with nowhere to add them", () => {
    for (const v of [undefined, null, "yes", [], {}, { count: 2 }, { count: 2, url: "" }, { count: 2, url: "javascript:alert(1)" }, { count: 0, url: LINK }, { count: -1, url: LINK }]) {
      expect(parseAnswersNeeded(v)).toBeNull();
    }
  });

  it("keeps a link off the site as it is, and drops a deadline it can't read", () => {
    expect(parseAnswersNeeded({ count: 3, url: "https://example.org/x", deadline: "soon" })).toEqual({ count: 3, href: "https://example.org/x", deadline: null });
  });

  it("still notes it without a count worth saying", () => {
    expect(parseAnswersNeeded({ url: LINK }).count).toBeNull();
    expect(parseAnswersNeeded({ count: 1.5, url: LINK }).count).toBeNull();
  });

  it("says it in words", () => {
    expect(detailsNeeded(2)).toBe("2 details needed");
    expect(detailsNeeded(1)).toBe("1 detail needed");
    expect(detailsNeeded(null)).toBe("Details needed");
    expect(addThem(2)).toBe("Add them");
    expect(addThem(1)).toBe("Add it");
    expect(addThem(null)).toBe("Add them");
    // India time, whatever the visitor's clock.
    expect(byWhen("2026-11-14T12:30:00Z")).toBe("Sat, 14 Nov · 6:00 PM IST");
    expect(byWhen(null)).toBeNull();
  });
});

describe("the answers page's shape", () => {
  it("reads every field", () => {
    const page = parseAnswersPage(RAW());
    expect(page).toMatchObject({
      status: "open",
      event: { id: 68, slug: "devfest-kochi", name: "DevFest Kochi", startsAt: "2026-11-21T09:30:00+05:30", orgName: "GDG Kochi", poster: null },
      person: { firstName: "Haritha", kind: "registration" },
      deadline: "2026-11-14T18:00:00+05:30",
      message: "We need 2 more details for your DevFest ticket.",
      // In the form's order, whatever order the API listed them in.
      asked: ["pg_spec", "tshirt"],
      answers: { status: "Student", college: "COEP", year: "2", degree_type: "PG" },
      ticketHref: "/tickets/MOA-7K3QF-X9PWM",
      requestHref: null,
    });
    // The whole form, read as the register form reads it: a conditional question's "required when shown".
    expect(page.questions).toEqual(parseQuestions(CONDITIONAL_FORM));
    expect(page.questions.find((q) => q.key === "pg_spec")).toMatchObject({ required: true, showIf: { key: "degree_type", anyOf: ["PG"] } });
  });

  it("asks only for questions the form has", () => {
    expect(parseAnswersPage(RAW({ asked: ["tshirt", "gone_question", 7, null] })).asked).toEqual(["tshirt"]);
  });

  it("reads a request, and its page when the API sends one", () => {
    const page = parseAnswersPage(RAW({ person: { first_name: "Haritha", kind: "request" }, ticket_url: null, request_url: "https://myotherapp.in/requests/Rq7abcdefghijklmnopqrstuvwxyz012" }));
    expect(page.person.kind).toBe("request");
    expect(page.ticketHref).toBeNull();
    expect(page.requestHref).toBe("/requests/Rq7abcdefghijklmnopqrstuvwxyz012");
  });

  it.each([
    ["done", { status: "done", asked: [] }, "done"],
    ["closed", { status: "closed" }, "closed"],
    ["nothing", { status: "nothing", questions: [], answers: {}, asked: [] }, "nothing"],
    ["open with nothing asked", { status: "open", asked: [] }, "done"],
    ["a status it doesn't know, with something asked", { status: "paused" }, "open"],
    ["a status it doesn't know, with nothing asked", { status: "paused", asked: [] }, "done"],
  ])("%s", (_, over, status) => {
    expect(parseAnswersPage(RAW(over)).status).toBe(status);
  });

  it("gets by with little", () => {
    const page = parseAnswersPage({ status: "open", asked: ["x"], questions: [{ key: "x", label: "X", field_type: "text" }] });
    expect(page).toMatchObject({ status: "open", event: { name: "this event", orgName: null }, person: { firstName: null, kind: "registration" }, deadline: null, message: null, answers: {}, ticketHref: null });
    expect(parseAnswersPage(null)).toBeNull();
    expect(parseAnswersPage("nope")).toBeNull();
  });
});

describe("which questions the page asks (the shared conditional form)", () => {
  const questions = parseQuestions(CONDITIONAL_FORM);

  it("asks the asked questions and every question that hangs off one, nested too", () => {
    expect([...editableKeys(questions, ["tshirt"])]).toEqual(["tshirt"]);
    expect([...editableKeys(questions, ["degree_type"])].sort()).toEqual(["degree_type", "pg_spec"]);
    expect([...editableKeys(questions, ["status"])].sort()).toEqual(["college", "company", "degree_type", "experience", "pg_spec", "status", "year"]);
  });

  it("shows only those that apply, as the answers given at sign-up decide", () => {
    // Student + PG at sign-up: the nested PG question applies.
    expect(keys(shownQuestions(formOf()))).toEqual(["pg_spec", "tshirt"]);
    // Student + UG: it doesn't, whatever was asked.
    expect(keys(shownQuestions(formOf({ answers: { status: "Student", degree_type: "UG" } })))).toEqual(["tshirt"]);
  });

  it("brings in a child as its parent is answered, and takes it away again, clearing it", () => {
    const form = formOf({ asked: ["status", "tshirt"], answers: {} });
    expect(keys(shownQuestions(form))).toEqual(["status", "tshirt"]);

    let step = changeAnswer(form, form.values, "status", "Student");
    expect(keys(step.added)).toEqual(["college", "year", "degree_type"]);
    expect(keys(shownQuestions(form, step.values))).toEqual(["status", "college", "year", "degree_type", "tshirt"]);

    step = changeAnswer(form, { ...step.values, college: "COEP" }, "degree_type", "PG");
    expect(keys(step.added)).toEqual(["pg_spec"]);
    step = changeAnswer(form, { ...step.values, pg_spec: "AI" }, "degree_type", "UG");
    // PG → UG drops the nested answer and keeps the rest.
    expect(keys(step.removed)).toEqual(["pg_spec"]);
    expect(step.values).toMatchObject({ pg_spec: "", college: "COEP", degree_type: "UG" });

    // Student → Working drops every student answer.
    step = changeAnswer(form, step.values, "status", "Working");
    expect(keys(step.removed)).toEqual(["college", "year", "degree_type"]);
    expect(keys(step.added)).toEqual(["company", "experience"]);
    expect(step.values).toMatchObject({ college: "", year: "", degree_type: "", status: "Working" });
    expect(keys(shownQuestions(form, step.values))).toEqual(["status", "company", "experience", "tshirt"]);
  });

  it("prefills what the person has, as text", () => {
    const form = formOf({ asked: ["degree_type", "tshirt"], answers: { status: "Student", degree_type: "PG", pg_spec: "AI", tshirt: ["M"] } });
    expect(form.values).toEqual({ degree_type: "PG", pg_spec: "AI", tshirt: "M" });
    // What isn't asked decides, untouched.
    expect(form.base).toEqual({ status: "Student" });
    expect(asText(42)).toBe("42");
    expect(asText(["A", "B"])).toBe("A");
    expect(asText([])).toBe("");
    expect(asText(null)).toBe("");
    expect(asText({ x: 1 })).toBe("");
  });
});

describe("checking and sending", () => {
  it("needs the asked ones that are required, and only those shown", () => {
    const form = formOf({ asked: ["status", "tshirt"], answers: {} });
    expect(answersErrors(form)).toEqual({ status: "Choose one of the options.", tshirt: "Choose one of the options." });
    const { values } = changeAnswer(form, form.values, "status", "Working");
    // Working brings its own questions in; the student ones aren't required.
    expect(Object.keys(answersErrors(form, values)).sort()).toEqual(["company", "experience", "tshirt"]);
  });

  it("says an answer brought from sign-up no longer passes (a choice that is gone)", () => {
    const form = formOf({ asked: ["tshirt"], answers: { tshirt: "XXL" } });
    expect(form.values.tshirt).toBe("XXL");
    expect(answersErrors(form)).toEqual({ tshirt: "Choose one of the options." });
  });

  it("sends the asked answers and the children they brought in, never a hidden one", () => {
    const form = formOf({ asked: ["status", "tshirt"], answers: {} });
    let { values } = changeAnswer(form, form.values, "status", "Student");
    values = { ...values, college: "COEP", year: "2", tshirt: "L" };
    ({ values } = changeAnswer(form, values, "degree_type", "PG"));
    values = { ...values, pg_spec: "AI" };
    ({ values } = changeAnswer(form, values, "status", "Working"));
    values = { ...values, company: "Acme", experience: "3-5" };
    expect(answersErrors(form, values)).toEqual({});
    expect(answersPayload(form, values)).toEqual({ status: "Working", company: "Acme", experience: "3-5", tshirt: "L" });
  });

  it("leaves out a blank optional answer, as the register form does", () => {
    const page = { ...parseAnswersPage(RAW({ asked: ["note", "tshirt"], questions: [...CONDITIONAL_FORM, { key: "note", label: "Anything else?", field_type: "text", required: false }] })) };
    const form = startAnswers(page);
    expect(answersErrors(form, { ...form.values, tshirt: "S" })).toEqual({});
    expect(answersPayload(form, { ...form.values, tshirt: "S", note: "   " })).toEqual({ tshirt: "S" });
  });

  it("neither checks nor sends a child the person answered before and left alone", () => {
    // Asked: the degree (its answer at sign-up, "Masters", is no option now). Its child was answered (as the app sends ticks).
    const form = formOf({ asked: ["degree_type"], answers: { status: "Student", degree_type: "Masters", pg_spec: ["AI", "ML"] } });
    expect(keys(shownQuestions(form))).toEqual(["degree_type"]);
    expect(answersErrors(form)).toEqual({ degree_type: "Choose one of the options." });
    const { values } = changeAnswer(form, form.values, "degree_type", "PG");
    expect(keys(shownQuestions(form, values))).toEqual(["degree_type", "pg_spec"]);
    expect(values.pg_spec).toBe("AI");
    expect(untouched(form, "pg_spec", values)).toBe(true);
    expect(untouched(form, "degree_type", values)).toBe(false);
    expect(answersErrors(form, values)).toEqual({});
    expect(answersPayload(form, values)).toEqual({ degree_type: "PG" });
    // Changed, it is the person's new answer.
    expect(answersPayload(form, { ...values, pg_spec: "Robotics" })).toEqual({ degree_type: "PG", pg_spec: "Robotics" });
  });

  it("validateAnswers checks only the questions it is given, when given some", () => {
    const questions = parseQuestions(CONDITIONAL_FORM);
    const answers = { status: "Student" };
    expect(Object.keys(validateAnswers(questions, answers)).sort()).toEqual(["college", "degree_type", "tshirt", "year"]);
    expect(validateAnswers(questions, answers, { keys: ["college", "company"] })).toEqual({ college: "This question needs an answer." });
  });
});

describe("what a refusal means", () => {
  const failed = (status, data = null, headers = {}) => ({ response: { status, data, headers } });

  it("a link that isn't one, or isn't this browser's", () => {
    for (const s of [404, 401, 403]) expect(describeAnswersError(failed(s)).kind).toBe("invalid");
  });

  it("the form has closed", () => {
    expect(describeAnswersError(failed(409, { error_code: "CLOSED", message: "This form has closed." }))).toEqual({ kind: "closed" });
  });

  it("the answers to fix, by question, however the API names them", () => {
    const k = ["tshirt", "college"];
    expect(describeAnswersError(failed(422, { error_code: "INVALID_ANSWERS", message: "Check your answers.", errors: { tshirt: "Choose one of the options." } }), k)).toEqual({
      kind: "fields",
      fields: { tshirt: "Choose one of the options." },
      message: null,
    });
    expect(describeAnswersError(failed(400, { error_code: "INVALID_ANSWERS", message: "One answer needs a look.", errors: { college: "This field is required" } }), k)).toEqual({
      kind: "fields",
      fields: { college: "This field is required" },
      message: "One answer needs a look.",
    });
    expect(describeAnswersError(failed(422, { errors: { answers: { college: "Too long." } } }), k).fields).toEqual({ college: "Too long." });
    expect(describeAnswersError(failed(422, { detail: [{ loc: ["body", "answers", "tshirt"], msg: "Not an option" }] }), k).fields).toEqual({ tshirt: "Not an option" });
    // A key the page doesn't show is no field of its own: the API's words instead.
    expect(describeAnswersError(failed(422, { message: "Something is off.", errors: { other: "x" } }), k)).toEqual({ kind: "message", message: "Something is off." });
  });

  it("too many tries, no connection, the server's own trouble", () => {
    expect(describeAnswersError(failed(429)).kind).toBe("limit");
    expect(describeAnswersError(new Error("Network Error"))).toMatchObject({ kind: "network" });
    expect(describeAnswersError(failed(502))).toMatchObject({ kind: "server" });
    expect(describeAnswersError(failed(400))).toMatchObject({ kind: "message", message: "That didn't save. Try again in a moment." });
  });
});
