import { beforeEach, describe, expect, it } from "vitest";
import { buildPayload, describeRegisterError, loadDraft, orderLines, saveDraft, stepsFor } from "./register";

/*
 * The registration form's own rules for ticket types, discount codes, the
 * waiting list and cancelled events (the API's docs/TICKETING.md §3, §6).
 */
const envelope = (message, error_code, errors = undefined) => ({ message, error_code, ...(errors ? { errors } : {}) });
const VALUES = { name: "Asha Rao", email: "asha@example.org", phone: "98765 43210" };

describe("the steps", () => {
  it("start with the ticket only when there is a choice of them", () => {
    expect(stepsFor({ chooseTicket: true }).map((s) => s.id)).toEqual(["ticket", "details", "review"]);
    expect(stepsFor({ chooseTicket: true, questions: [{}], items: [{}] }).map((s) => s.id)).toEqual(["ticket", "details", "questions", "addons", "review"]);
    expect(stepsFor({}).map((s) => s.id)).toEqual(["details", "review"]);
  });
});

describe("the payload", () => {
  const base = { values: VALUES, questions: [], answers: {}, ref: null };

  it("names the ticket and the code only when there are some", () => {
    expect(buildPayload({ ...base, ticketTypeId: 12, discountCode: " early20 " })).toEqual({
      full_name: "Asha Rao",
      email: "asha@example.org",
      phone: "98765 43210",
      additional_details: {},
      accepts_approval: true,
      ticket_type_id: 12,
      discount_code: "early20",
    });
  });

  it("is what it always was for one ticket and no code, saying it understands requests", () => {
    const old = buildPayload(base);
    expect(old).toEqual({ full_name: "Asha Rao", email: "asha@example.org", phone: "98765 43210", additional_details: {}, accepts_approval: true });
    expect(buildPayload({ ...base, ticketTypeId: null, discountCode: "  " })).toEqual(old);
  });
});

describe("the order", () => {
  it("names the ticket and takes the code off as its own line", () => {
    expect(orderLines({ fee: 199, ticket: "Early bird", discount: { code: "EARLY20", amount: 39.8 } })).toEqual([
      { id: "ticket", label: "Ticket", sub: "Early bird", amount: 199 },
      { id: "discount", label: "Discount", sub: "EARLY20", amount: -39.8 },
    ]);
    expect(orderLines({ fee: 199, discount: { code: "NONE", amount: 0 } })).toEqual([{ id: "ticket", label: "Ticket", amount: 199 }]);
  });
});

describe("the draft", () => {
  beforeEach(() => sessionStorage.clear());

  it("keeps the ticket chosen, and nothing that isn't one", () => {
    saveDraft("9", { values: VALUES, answers: {}, picks: {}, ticketType: 13 });
    expect(loadDraft("9").ticketType).toBe(13);
    saveDraft("9", { values: VALUES, answers: {}, picks: {}, ticketType: "13; drop" });
    expect(loadDraft("9")).not.toHaveProperty("ticketType");
  });
});

describe("what the server's refusals mean", () => {
  const err = (status, data) => describeRegisterError({ status, data });

  it("a ticket refused goes beside the picker, and the types are read again", () => {
    expect(err(422, envelope("Choose a ticket type", "TICKET_TYPE_REQUIRED", { ticket_types: [12, 13] }))).toEqual({
      kind: "fields",
      fields: { ticket_type: "Choose a ticket." },
      message: null,
      ticketTypes: true,
      waitlist: false,
      code: "TICKET_TYPE_REQUIRED",
    });
    const sold = err(409, envelope("Sold out", "TICKET_TYPE_SOLD_OUT", { ticket_type_id: 12, waitlist: true }));
    expect(sold).toMatchObject({ kind: "fields", ticketTypes: true, waitlist: true });
    expect(sold.fields.ticket_type).toMatch(/waiting list/);
    expect(err(409, envelope("Not yet", "TICKET_TYPE_NOT_ON_SALE", { closed_reason: "not_started", opens_at: "2026-11-01T10:00:00+05:30" })).fields.ticket_type).toBe(
      "This ticket goes on sale Sun, 1 Nov · 10:00 AM IST.",
    );
    expect(err(409, envelope("Limit", "TICKET_TYPE_LIMIT")).fields.ticket_type).toMatch(/as many/);
  });

  it("a code refused goes beside the code", () => {
    expect(err(409, envelope("Used up", "DISCOUNT_CODE_USED_UP"))).toEqual({
      kind: "fields",
      fields: { discount_code: "That code has been used up." },
      message: null,
      code: "DISCOUNT_CODE_USED_UP",
    });
    expect(err(422, envelope("Invalid", "DISCOUNT_CODE_INVALID")).fields.discount_code).toMatch(/isn't valid/);
  });

  it("a full event offers its waiting list when it has one", () => {
    const full = err(400, envelope("Event is full", "EVENT_FULL", { max_participants: 60, waitlist: true }));
    expect(full).toEqual({
      kind: "full",
      title: "This event is full",
      message: "All 60 seats are taken. Join the waiting list and we'll email you if a place opens up.",
      waitlist: true,
    });
    expect(err(400, envelope("Event is full", "EVENT_FULL", { waitlist: false }))).not.toHaveProperty("waitlist");
  });

  it("a cancelled event says so", () => {
    expect(err(400, envelope("This event was cancelled", "REGISTRATIONS_CLOSED", { closed_reason: "cancelled" }))).toEqual({
      kind: "closed",
      reason: "cancelled",
      title: "This event was cancelled",
      message: "The organisers called it off, so it isn't taking registrations. Nothing was charged.",
    });
  });
});

describe("a request (the club confirms each place)", () => {
  const err = (status, data) => describeRegisterError({ response: { status, data } }, [], { approval: true });

  it("is never offered a waiting list, whatever the refusal says", () => {
    const full = err(400, envelope("Event is full", "EVENT_FULL", { max_participants: 60, waitlist: true }));
    expect(full).toEqual({ kind: "full", title: "This event is full", message: "All 60 seats are taken. Keep an eye on the event page in case one opens up." });
    const sold = err(409, envelope("Sold out", "TICKET_TYPE_SOLD_OUT", { waitlist: true }));
    expect(sold.waitlist).toBe(false);
    expect(sold.fields.ticket_type).toBe("This ticket just sold out. Choose another.");
  });

  it("a registration still is, as before", () => {
    const full = describeRegisterError({ response: { status: 400, data: envelope("Event is full", "EVENT_FULL", { waitlist: true }) } });
    expect(full.waitlist).toBe(true);
  });
});
