import { afterEach, describe, expect, it } from "vitest";
import {
  applyStockRefusal,
  buildPayload,
  describeRegisterError,
  forgetDone,
  keepDone,
  loadDone,
  myRegistration,
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

  it("sends `store: []` when the event has a shelf and nothing is picked, so taking every pick off clears the order", () => {
    // The server re-places the order only when `store` is present: without it,
    // coming back to pay after removing every pick kept charging for them.
    const sock = { id: "sock", name: "Socks", price: 120, left: 4, variants: [] };
    expect(buildPayload({ values, questions: [], answers: {}, ref: null, items: [tee, sock], picks: {} }).store).toEqual([]);
    // Picks taken back down to nothing, and a size chosen with no quantity, are nothing too.
    expect(buildPayload({ values, questions: [], answers: {}, ref: null, items: [tee, sock], picks: { tee: { qty: 0, variant_id: "m" }, sock: { qty: 0, variant_id: null } } }).store).toEqual([]);
    // And it survives the trip to the server as an empty list, not a missing key.
    expect(JSON.parse(JSON.stringify(buildPayload({ values, questions: [], answers: {}, ref: null, items: [sock], picks: {} })))).toHaveProperty("store", []);
    // An event with no shelf still sends no store at all, nor does a caller that passes no shelf.
    expect(buildPayload({ values, questions: [], answers: {}, ref: null, items: [], picks: { tee: { qty: 1, variant_id: "m" } } })).not.toHaveProperty("store");
    expect(buildPayload({ values, questions: [], answers: {}, ref: null })).not.toHaveProperty("store");
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

describe("the refusals the server names by code (backend#68), and the shapes before it", () => {
  const keys = ["college", "track"];
  const envelope = (message, error_code, errors = null) => ({ message, errors, error_code, track_id: null });

  it("ALREADY_REGISTERED: 409 from the public form in its own words; 400 signed in, with where the ticket is", () => {
    const said = "This email is already registered for this event. Your ticket was sent to it; sign in to the MyOtherApp app with this email to see it.";
    expect(describeRegisterError({ status: 409, data: envelope(said, "ALREADY_REGISTERED") })).toEqual({ kind: "duplicate", message: said });
    expect(describeRegisterError({ status: 400, data: envelope("Already registered for this event", "ALREADY_REGISTERED") })).toEqual({
      kind: "duplicate",
      message: "Your ticket is in My tickets, and in your email.",
    });
  });

  it("REGISTRATION_AWAITING_PAYMENT (409) is not a duplicate: it offers Finish payment", () => {
    expect(describeRegisterError({ status: 409, data: envelope("Waiting for payment.", "REGISTRATION_AWAITING_PAYMENT") }).kind).toBe("awaiting");
  });

  it("REGISTRATIONS_CLOSED: the deadline and the start say when; the 409 says nothing about why (never a plan)", () => {
    const deadline = describeRegisterError({
      status: 400,
      data: envelope("Registration deadline has passed", "REGISTRATIONS_CLOSED", { closed_reason: "deadline_passed", closed_at: "2026-10-12T18:29:00+00:00" }),
    });
    expect(deadline).toEqual({
      kind: "closed",
      reason: "deadline_passed",
      title: "Registration has closed",
      message: "Registration closed on Mon, 12 Oct · 11:59 PM IST. The organisers aren't taking new registrations.",
    });
    const early = describeRegisterError({
      status: 400,
      data: envelope("Registration has not started yet", "REGISTRATIONS_CLOSED", { closed_reason: "not_started", opens_at: "2026-10-20T04:30:00+00:00" }),
    });
    expect(early).toEqual({ kind: "closed", reason: "not_started", title: "Registration hasn't opened yet", message: "It opens Tue, 20 Oct · 10:00 AM IST. Come back then." });
    const capped = describeRegisterError({ status: 409, data: envelope("This event isn't taking more registrations right now.", "REGISTRATIONS_CLOSED") });
    expect(capped).toMatchObject({ kind: "closed", reason: "paused", title: "Registration is closed for now" });
    expect(`${capped.title} ${capped.message}`).not.toMatch(/plan|upgrade|limit|subscription/i);
    // A 409 with a code is never taken for "already registered".
    expect(capped.kind).not.toBe("duplicate");
    // Without the times, still words.
    expect(describeRegisterError({ status: 400, data: envelope("x", "REGISTRATIONS_CLOSED", { closed_reason: "deadline_passed" }) }).message).toBe(
      "The organisers aren't taking new registrations.",
    );
  });

  it("EVENT_FULL says how many seats there were", () => {
    expect(describeRegisterError({ status: 400, data: envelope("Event is full", "EVENT_FULL", { max_participants: 60 }) })).toEqual({
      kind: "full",
      title: "This event is full",
      message: "All 60 seats are taken. Keep an eye on the event page in case one opens up.",
    });
    expect(describeRegisterError({ status: 400, data: envelope("Event is full", "EVENT_FULL") }).message).toMatch(/^Every seat is taken\./);
  });

  it("SOLD_OUT names the add-on, its size and what is left; ITEM_UNAVAILABLE is none left", () => {
    expect(
      describeRegisterError({ status: 422, data: envelope("Hack Night tee M: only 2 left", "SOLD_OUT", { item_id: "tee", variant_id: "m", available: 2 }) }),
    ).toEqual({ kind: "soldout", itemId: "tee", variantId: "m", available: 2, message: "Hack Night tee M: only 2 left." });
    expect(describeRegisterError({ status: 422, data: envelope("Sticker sheet is sold out", "SOLD_OUT", { item_id: 7, variant_id: null, available: 0 }) })).toMatchObject({
      kind: "soldout",
      itemId: "7",
      variantId: null,
      available: 0,
    });
    expect(describeRegisterError({ status: 422, data: envelope("One of the items is no longer on sale", "ITEM_UNAVAILABLE", { item_id: "tee" }) })).toMatchObject({
      kind: "soldout",
      itemId: "tee",
      available: 0,
    });
  });

  it("INVALID_ANSWERS puts each answer's problem beside its question, with the server's line", () => {
    expect(
      describeRegisterError(
        { status: 400, data: envelope("Check your answers: College, Pick a track.", "INVALID_ANSWERS", { college: "This field is required", track: "Invalid option selected" }) },
        keys,
      ),
    ).toEqual({
      kind: "fields",
      fields: { "q:college": "This field is required", "q:track": "Invalid option selected" },
      message: "Check your answers: College, Pick a track.",
    });
  });

  it("CLUB_EMAIL and EMAIL_MISMATCH are about the email", () => {
    expect(describeRegisterError({ status: 400, data: envelope("This email belongs to a club's account. Register with your own email.", "CLUB_EMAIL") }).fields).toEqual({
      email: "This email belongs to a club's account. Register with your own email.",
    });
    expect(describeRegisterError({ status: 400, data: envelope("Email does not match with the logged in user email", "EMAIL_MISMATCH") }).fields.email).toMatch(
      /isn't the email you're signed in with/,
    );
  });

  it("an older server's 409 without a code is still the duplicate", () => {
    expect(describeRegisterError({ status: 409, data: { message: "Already here." } }).kind).toBe("duplicate");
  });
});

describe("the signed-in person's own registration (GET /events/info/{id})", () => {
  it("reads is_paid and registration_id; an older server that says neither is unknown", () => {
    expect(myRegistration(null)).toBeNull();
    expect(myRegistration({ is_registered: false, is_paid: null, registration_id: null })).toEqual({ state: "none", registrationId: null, ticketId: null });
    expect(myRegistration({ is_registered: true, is_paid: false, registration_id: "reg-9", ticket_id: "MOA-1" })).toEqual({ state: "unpaid", registrationId: "reg-9", ticketId: "MOA-1" });
    expect(myRegistration({ is_registered: true, is_paid: true, registration_id: 12, ticket_id: "MOA-1" })).toEqual({ state: "registered", registrationId: "12", ticketId: "MOA-1" });
    expect(myRegistration({ is_registered: true, ticket_id: "MOA-1" })).toEqual({ state: "unknown", registrationId: null, ticketId: "MOA-1" });
    // Unpaid with no id to pay is the old way too.
    expect(myRegistration({ is_registered: true, is_paid: false, registration_id: null }).state).toBe("unknown");
  });
});

describe("an add-on that sold out meanwhile", () => {
  const TEE = { id: "tee", name: "Tee", price: 450, left: null, variants: [{ id: "m", label: "M", left: 30 }, { id: "l", label: "L", left: 5 }] };
  const STICKERS = { id: 7, name: "Stickers", price: 50, left: 20, variants: [] };

  it("shows what is left of the size and cuts the pick to it, or drops it", () => {
    const picks = { tee: { qty: 3, variant_id: "m" }, 7: { qty: 2, variant_id: null } };
    const fewer = applyStockRefusal([TEE, STICKERS], picks, { itemId: "tee", variantId: "m", available: 2 });
    expect(fewer.items[0].variants).toEqual([{ id: "m", label: "M", left: 2 }, { id: "l", label: "L", left: 5 }]);
    expect(fewer.picks).toEqual({ tee: { qty: 2, variant_id: "m" }, 7: { qty: 2, variant_id: null } });
    const none = applyStockRefusal([TEE, STICKERS], picks, { itemId: "tee", variantId: "m", available: 0 });
    expect(none.picks.tee).toEqual({ qty: 0, variant_id: null });
  });

  it("marks an item without sizes, and an item no longer on sale at all", () => {
    const picks = { tee: { qty: 1, variant_id: "l" }, 7: { qty: 4, variant_id: null } };
    const out = applyStockRefusal([TEE, STICKERS], picks, { itemId: "7", variantId: null, available: 0 });
    expect(out.items[1].left).toBe(0);
    expect(out.picks[7]).toEqual({ qty: 0, variant_id: null });
    const gone = applyStockRefusal([TEE, STICKERS], picks, { itemId: "tee", variantId: null, available: 0 });
    expect(gone.items[0].variants.every((v) => v.left === 0)).toBe(true);
    expect(gone.picks.tee).toEqual({ qty: 0, variant_id: null });
    // Something the shelf doesn't have changes nothing.
    expect(applyStockRefusal([TEE], picks, { itemId: "nope", available: 0 }).picks).toBe(picks);
  });
});

describe("the ticket just made, kept for a reload", () => {
  afterEach(() => sessionStorage.clear());
  it("is kept per event for the tab, and forgotten", () => {
    const ticket = { eventId: "124", ticket_id: "MOA77", name: "Asha", email: "a@example.org", paid: false, amount: 0, account: null };
    keepDone("124", ticket);
    expect(loadDone("124")).toEqual(ticket);
    expect(loadDone("125")).toBeNull();
    forgetDone("124");
    expect(loadDone("124")).toBeNull();
    sessionStorage.setItem("moa.register.done.124", "{not json");
    expect(loadDone("124")).toBeNull();
  });
});
