import { describe, expect, it } from "vitest";
import {
  buildPayload,
  describeRegisterError,
  orderLines,
  parseQuestions,
  questionControl,
  stepsFor,
  suggestEmail,
  validateAnswer,
  validateDetails,
} from "./register";

const q = (field_type, over = {}) => parseQuestions([{ key: "k", label: "Label", field_type, ...over }])[0];

describe("the event's own questions", () => {
  it("cleans them up: required unless it says otherwise, options kept, duplicates and junk dropped", () => {
    const list = parseQuestions([
      { key: "college", label: "College", field_type: "text" },
      { key: "year", label: "Year", field_type: "SELECT", required: false, options: ["1", "", 2, "3"] },
      { key: "college", label: "Again", field_type: "text" },
      null,
      { label: "No key", field_type: "text" },
    ]);
    expect(list).toEqual([
      { key: "college", label: "College", type: "text", required: true, options: [] },
      { key: "year", label: "Year", type: "select", required: false, options: ["1", "3"] },
    ]);
    expect(parseQuestions(null)).toEqual([]);
  });

  it("gives every server field type a control, and anything unknown a text box", () => {
    expect(questionControl(q("select", { options: ["a"] })).kind).toBe("select");
    expect(questionControl(q("radio", { options: ["a", "b"] })).kind).toBe("choice");
    expect(questionControl(q("checkbox", { options: ["I agree"] }))).toEqual({ kind: "check", value: "I agree" });
    expect(questionControl(q("checkbox", { options: ["a", "b"] })).kind).toBe("choice");
    expect(questionControl(q("textarea")).kind).toBe("textarea");
    expect(questionControl(q("email"))).toMatchObject({ kind: "text", type: "email", inputMode: "email" });
    expect(questionControl(q("url"))).toMatchObject({ kind: "text", type: "url" });
    expect(questionControl(q("tel"))).toMatchObject({ kind: "text", type: "tel", inputMode: "tel" });
    expect(questionControl(q("number"))).toMatchObject({ kind: "text", type: "text", inputMode: "decimal" });
    expect(questionControl(q("date"))).toMatchObject({ kind: "text", type: "date" });
    expect(questionControl(q("time"))).toMatchObject({ kind: "text", type: "time" });
    expect(questionControl(q("datetime"))).toMatchObject({ kind: "text", type: "datetime-local" });
    expect(questionControl(q("colour"))).toMatchObject({ kind: "text", type: "text" });
  });

  it("checks an answer by its type", () => {
    expect(validateAnswer(q("text"), "")).toBe("This question needs an answer.");
    expect(validateAnswer(q("text", { required: false }), "")).toBeNull();
    expect(validateAnswer(q("select", { options: ["a"] }), "")).toBe("Choose one of the options.");
    expect(validateAnswer(q("select", { options: ["a"] }), "z")).toBe("Choose one of the options.");
    expect(validateAnswer(q("checkbox", { options: ["I agree"] }), "")).toBe("Tick this box to continue.");
    expect(validateAnswer(q("checkbox", { options: ["I agree"] }), "I agree")).toBeNull();
    expect(validateAnswer(q("email"), "asha@")).toMatch(/email address/);
    expect(validateAnswer(q("email"), "asha@example.org")).toBeNull();
    expect(validateAnswer(q("url"), "not a link")).toMatch(/web address/);
    expect(validateAnswer(q("url"), "github.com/asha")).toBeNull();
    expect(validateAnswer(q("tel"), "12")).toBe("Enter a phone number.");
    expect(validateAnswer(q("tel"), "+91 98765 43210")).toBeNull();
    expect(validateAnswer(q("number"), "four")).toBe("Enter a number.");
    expect(validateAnswer(q("number"), "4.5")).toBeNull();
  });
});

describe("your details", () => {
  it("needs a name the server accepts, a real-looking email and a phone number", () => {
    expect(validateDetails({ name: "", email: "", phone: "" })).toEqual({
      name: "Enter your full name.",
      email: "Enter your email address.",
      phone: "Enter your phone number.",
    });
    expect(validateDetails({ name: "Al", email: "a@b", phone: "123" })).toEqual({
      name: expect.stringMatching(/at least 3/),
      email: expect.stringMatching(/doesn't look like an email/),
      phone: expect.stringMatching(/10-digit/),
    });
    expect(validateDetails({ name: "Asha Rao", email: "asha@example.org", phone: "+91 98765-43210" })).toEqual({});
  });

  it("offers the likely address for a common typo, and nothing for a fine one", () => {
    expect(suggestEmail("asha@gmial.com")).toBe("asha@gmail.com");
    expect(suggestEmail("Asha.Rao@Hotmial.com")).toBe("Asha.Rao@hotmail.com");
    expect(suggestEmail("asha@gmail.com")).toBeNull();
    expect(suggestEmail("not an email")).toBeNull();
  });
});

describe("the steps", () => {
  it("are only the ones the event has", () => {
    expect(stepsFor({}).map((s) => s.id)).toEqual(["details", "review"]);
    expect(stepsFor({ questions: [{}] }).map((s) => s.id)).toEqual(["details", "questions", "review"]);
    expect(stepsFor({ questions: [{}], items: [{}] }).map((s) => s.id)).toEqual(["details", "questions", "addons", "review"]);
  });
});

describe("the payload", () => {
  const values = { name: "Asha Rao", email: "asha@example.org", phone: "98765 43210" };
  const tee = { id: "tee", name: "Tee", price: 450, left: null, variants: [{ id: "m", label: "M", left: 3 }] };

  it("is the form's old shape: `{}` for an event that asks nothing, no ref or store unless there is one", () => {
    expect(buildPayload({ values, questions: [], answers: {}, ref: null, items: [], picks: {} })).toEqual({
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: {},
    });
  });

  it("carries the answers given (blank optional ones left out), the tracking code and the picks", () => {
    const questions = parseQuestions([
      { key: "college", label: "College", field_type: "text" },
      { key: "github", label: "GitHub", field_type: "url", required: false },
    ]);
    const p = buildPayload({ values, questions, answers: { college: "COEP", github: "", stale: "x" }, ref: "x7k2m9pq", items: [tee], picks: { tee: { qty: 2, variant_id: "m" } } });
    expect(p).toEqual({
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: { college: "COEP" },
      ref: "x7k2m9pq",
      store: [{ item_id: "tee", variant_id: "m", qty: 2 }],
    });
    // Nothing answered: the key is left out, as an untouched form always sent it.
    expect(JSON.parse(JSON.stringify(buildPayload({ values, questions, answers: {}, ref: null, items: [], picks: {} })))).not.toHaveProperty("additional_details");
  });

  it("lists the order line by line", () => {
    expect(orderLines({ fee: 250, items: [tee], picks: { tee: { qty: 2, variant_id: "m" } } })).toEqual([
      { id: "ticket", label: "Ticket", amount: 250 },
      { id: "tee", label: "Tee", sub: "Size M × 2", amount: 900 },
    ]);
  });
});

describe("what an error from the register call means", () => {
  const keys = ["college", "track"];
  it("409 is the duplicate, in the server's own words", () => {
    const message = "This email is already registered for this event. Your ticket was sent to it; sign in to the MyOtherApp app with this email to see it.";
    expect(describeRegisterError({ status: 409, data: { message } }, keys)).toEqual({ kind: "duplicate", message });
    // The old 400 says the same thing.
    expect(describeRegisterError({ status: 400, data: { message: "Already registered for this event" } }, keys).kind).toBe("duplicate");
  });

  it("reads the backend's error codes", () => {
    expect(describeRegisterError({ status: 409, data: { message: "Already on the list.", error_code: "ALREADY_REGISTERED" } })).toEqual({ kind: "duplicate", message: "Already on the list." });
    const awaiting = "This email already has a registration for this event that is waiting for payment. If you left the payment unfinished, you can start again here in about 30 minutes, or sign in to the MyOtherApp app with this email to finish paying.";
    expect(describeRegisterError({ status: 409, data: { message: awaiting, error_code: "REGISTRATION_AWAITING_PAYMENT" } })).toEqual({ kind: "awaiting", message: awaiting });
    const club = "This email belongs to a club's account. Register with your own email.";
    expect(describeRegisterError({ status: 400, data: { message: club, error_code: "CLUB_EMAIL" } })).toEqual({ kind: "fields", fields: { email: club }, message: null });
  });

  it("field errors go beside their fields: the 400 dict, the 422 errors and FastAPI's detail list", () => {
    expect(describeRegisterError({ status: 400, data: { message: { college: "This field is required", nope: "x" } } }, keys)).toEqual({
      kind: "fields",
      fields: { "q:college": "This field is required" },
      message: null,
    });
    expect(describeRegisterError({ status: 422, data: { message: "Invalid request", errors: { full_name: "too short", additional_details: { track: "Invalid option selected" } } } }, keys).fields).toEqual({
      name: "too short",
      "q:track": "Invalid option selected",
    });
    expect(describeRegisterError({ status: 422, data: { detail: [{ loc: ["body", "email"], msg: "value is not a valid email address" }] } }, keys).fields).toEqual({
      email: "value is not a valid email address",
    });
  });

  it("anything else the server explained is shown as it said it; a bare 5xx and no answer at all get their own words", () => {
    expect(describeRegisterError({ status: 400, data: { message: "Registration deadline has passed" } })).toEqual({ kind: "message", message: "Registration deadline has passed" });
    expect(describeRegisterError({ status: 400, data: { detail: "Event is full" } })).toEqual({ kind: "message", message: "Event is full" });
    expect(describeRegisterError({ status: 500, data: { message: "Internal Server Error" } }).kind).toBe("server");
    expect(describeRegisterError({ status: 0, data: null, network: true }).kind).toBe("network");
  });
});
