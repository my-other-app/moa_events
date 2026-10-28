import { describe, expect, it } from "vitest";
import {
  anyPaid,
  apiFailure,
  defaultType,
  describeClaimError,
  describeCodeCheck,
  describeWaitlistError,
  discountRefusal,
  entryLine,
  liveEntries,
  needsPicker,
  onSale,
  parseOffer,
  viewerRequestOf,
  parseTicketing,
  priceRange,
  ticketTypeName,
  ticketTypeRefusal,
  typeNote,
  typePrice,
  waitlistTypes,
  WAITLIST_OFF_ON_APPROVAL,
  withoutWaitlist,
} from "./ticketing";

/* The API's `ticketing` (docs/TICKETING.md §2), as GET /events/{id}/ticket-types answers. */
const type = (over = {}) => ({
  id: 12,
  name: "Early bird",
  description: "Until Friday",
  price: 199,
  currency: "INR",
  is_free: false,
  capacity: 100,
  available: 23,
  status: "on_sale",
  sales_start: null,
  sales_end: null,
  per_person_limit: 1,
  is_hidden: false,
  waitlist: false,
  ...over,
});
const ticketing = (over = {}) => ({
  types: [type(), type({ id: 13, name: "Student", price: 0, is_free: true, available: null })],
  requires_choice: true,
  available: 40,
  sold_out: false,
  waitlist: { enabled: true, offer_hours: 24 },
  viewer_waitlist: [],
  ...over,
});
const failure = (status, data = null, headers = {}) => ({ response: { status, data, headers } });

describe("parseTicketing", () => {
  it("is null from a server without ticket types, or with nothing usable", () => {
    expect(parseTicketing(undefined)).toBeNull();
    expect(parseTicketing(null)).toBeNull();
    expect(parseTicketing({})).toBeNull();
    expect(parseTicketing({ types: [] })).toBeNull();
    expect(parseTicketing({ types: [{ name: "No id" }, { id: 4 }] })).toBeNull();
  });

  it("reads the types, the choice, the event's places and the waiting list", () => {
    const t = parseTicketing(ticketing({ viewer_waitlist: [{ id: "u-1", ticket_type_id: 12, ticket_type_name: "Early bird", status: "waiting", position: 3 }] }));
    expect(t.requiresChoice).toBe(true);
    expect(t.available).toBe(40);
    expect(t.soldOut).toBe(false);
    expect(t.waitlist).toEqual({ enabled: true, offerHours: 24 });
    expect(t.types).toHaveLength(2);
    expect(t.types[0]).toMatchObject({ id: 12, name: "Early bird", price: 199, isFree: false, available: 23, status: "on_sale", perPersonLimit: 1 });
    expect(t.types[1]).toMatchObject({ id: 13, isFree: true, available: null });
    expect(t.viewerWaitlist).toEqual([
      { id: "u-1", ticketTypeId: 12, ticketTypeName: "Early bird", status: "waiting", position: 3, offerExpiresAt: null, joinedAt: null, created: null },
    ]);
  });

  it("takes an unknown status as on sale and a missing offer time as a day", () => {
    const t = parseTicketing({ types: [type({ status: "who-knows" })], waitlist: null });
    expect(t.types[0].status).toBe("on_sale");
    expect(t.waitlist).toEqual({ enabled: false, offerHours: 24 });
    expect(t.requiresChoice).toBe(false);
  });

  it("says whether the club confirms each place, false when the API doesn't say", () => {
    expect(parseTicketing(ticketing({ requires_approval: true })).requiresApproval).toBe(true);
    expect(parseTicketing(ticketing({ requires_approval: "yes" })).requiresApproval).toBe(false);
    expect(parseTicketing(ticketing()).requiresApproval).toBe(false);
  });

  it("reads the signed-in viewer's open request, and only an open one", () => {
    const T = "Rq7abcdefghijklmnopqrstuvwxyz001";
    expect(parseTicketing(ticketing({ viewer_request: { id: "r1", status: "pending", token: T, status_url: `https://myotherapp.in/requests/${T}` } })).viewerRequest).toEqual({
      id: "r1",
      status: "pending",
      submittedAt: null,
      token: T,
      path: `/requests/${T}`,
    });
    expect(parseTicketing(ticketing({ viewer_request: { id: "r1", status: "approved", token: null, status_url: `https://myotherapp.in/requests/${T}` } })).viewerRequest.path).toBe(`/requests/${T}`);
    expect(parseTicketing(ticketing({ viewer_request: { id: "r1", status: "declined", token: T } })).viewerRequest).toBeNull();
    expect(parseTicketing(ticketing({ viewer_request: null })).viewerRequest).toBeNull();
    expect(parseTicketing(ticketing()).viewerRequest).toBeNull();
    // From the raw object, whether it lists types or not.
    expect(viewerRequestOf({ viewer_request: { id: "r1", status: "pending", token: T } }).path).toBe(`/requests/${T}`);
    expect(viewerRequestOf(null)).toBeNull();
  });
});

describe("choosing", () => {
  const t = parseTicketing(ticketing());

  it("shows a picker only with more than one ticket", () => {
    expect(needsPicker(t)).toBe(true);
    expect(needsPicker(parseTicketing(ticketing({ types: [type()] })))).toBe(false);
    expect(needsPicker(null)).toBe(false);
  });

  it("chooses the ticket a link names, or the only one, never one of several by itself", () => {
    expect(defaultType(t, 13)).toBe(13);
    expect(defaultType(t, "13")).toBe(13);
    expect(defaultType(t, 99)).toBeNull();
    expect(defaultType(t, null)).toBeNull();
    expect(defaultType(parseTicketing(ticketing({ types: [type()] })))).toBe(12);
    expect(defaultType(null, 13)).toBeNull();
  });

  it("says prices as the event page and the form do", () => {
    expect(typePrice(t.types[0])).toBe("₹199");
    expect(typePrice(t.types[1])).toBe("Free");
    expect(priceRange(t)).toBe("Free – ₹199");
    expect(priceRange(parseTicketing(ticketing({ types: [type()] })))).toBe("₹199");
    expect(anyPaid(t)).toBe(true);
    expect(anyPaid(parseTicketing(ticketing({ types: [type({ price: 0, is_free: true })] })))).toBe(false);
  });

  it("can choose only a ticket on sale with something left", () => {
    expect(onSale(t.types[0])).toBe(true);
    const [sold, early, ended] = parseTicketing({ types: [type({ status: "sold_out", available: 0 }), type({ id: 2, status: "not_started" }), type({ id: 3, available: 0 })] }).types;
    expect(onSale(sold)).toBe(false);
    expect(onSale(early)).toBe(false);
    expect(onSale(ended)).toBe(false);
  });

  it("says what can be done with each ticket now", () => {
    const parse = (o) => parseTicketing({ types: [type(o)] }).types[0];
    expect(typeNote(parse({ available: 3 }))).toEqual({ text: "Only 3 left", tone: "warn" });
    expect(typeNote(parse({ available: 50 }))).toBeNull();
    expect(typeNote(parse({ available: null, sales_end: "2026-11-01T23:59:00+05:30" }))).toEqual({ text: "Sales end Sun, 1 Nov · 11:59 PM IST", tone: null });
    expect(typeNote(parse({ status: "sold_out", available: 0 })).text).toBe("Sold out");
    expect(typeNote(parse({ status: "sold_out", available: 0, waitlist: true })).text).toBe("Sold out · waiting list open");
    expect(typeNote(parse({ status: "not_started", sales_start: "2026-11-01T10:00:00+05:30" })).text).toBe("On sale from Sun, 1 Nov · 10:00 AM IST");
    expect(typeNote(parse({ status: "not_started" })).text).toBe("Not on sale yet");
    expect(typeNote(parse({ status: "ended" })).text).toBe("Sales ended");
    expect(typeNote(parse({ status: "closed" })).text).toBe("Registration closed");
  });

  it("offers the waiting list only for sold-out types while the list is on", () => {
    const sold = ticketing({ types: [type({ status: "sold_out", available: 0, waitlist: true }), type({ id: 13 })] });
    expect(waitlistTypes(parseTicketing(sold)).map((x) => x.id)).toEqual([12]);
    expect(waitlistTypes(parseTicketing({ ...sold, waitlist: { enabled: false } }))).toEqual([]);
    expect(waitlistTypes(null)).toEqual([]);
  });
});

describe("a place in line, in words", () => {
  it("says the position, or that a place is held with its claim link in the email", () => {
    expect(entryLine({ status: "waiting", position: 1, ticketTypeName: "Early bird" }).title).toBe("You're next in line for Early bird");
    expect(entryLine({ status: "waiting", position: 3, ticketTypeName: null }).title).toBe("You're number 3 in line");
    expect(entryLine({ status: "waiting", position: null }).title).toBe("You're on the waiting list");
    const held = entryLine({ status: "offered", offerExpiresAt: "2026-11-02T18:00:00+05:30", ticketTypeName: "Early bird" });
    expect(held).toMatchObject({ kind: "offered", title: "A place for Early bird is yours to claim" });
    expect(held.text).toBe("It's held for you until Mon, 2 Nov · 6:00 PM IST. The claim link is in your email.");
    expect(entryLine({ status: "claimed" }).kind).toBe("other");
  });

  it("keeps only the places still standing", () => {
    expect(liveEntries([{ status: "waiting" }, { status: "offered" }, { status: "expired" }, { status: "left" }]).map((e) => e.status)).toEqual(["waiting", "offered"]);
    expect(liveEntries(null)).toEqual([]);
  });
});

describe("what a refusal means", () => {
  it("names each ticket refusal for the picker", () => {
    expect(ticketTypeRefusal("TICKET_TYPE_REQUIRED")).toBe("Choose a ticket.");
    expect(ticketTypeRefusal("TICKET_TYPE_NOT_FOUND")).toMatch(/isn't available any more/);
    expect(ticketTypeRefusal("TICKET_TYPE_NOT_ON_SALE", { closed_reason: "not_started", opens_at: "2026-11-01T10:00:00+05:30" })).toBe(
      "This ticket goes on sale Sun, 1 Nov · 10:00 AM IST.",
    );
    expect(ticketTypeRefusal("TICKET_TYPE_NOT_ON_SALE", { closed_reason: "ended" })).toMatch(/ended/);
    expect(ticketTypeRefusal("TICKET_TYPE_SOLD_OUT", { waitlist: true })).toMatch(/join its waiting list/);
    expect(ticketTypeRefusal("TICKET_TYPE_SOLD_OUT", { waitlist: false })).toMatch(/Choose another/);
    expect(ticketTypeRefusal("TICKET_TYPE_LIMIT")).toMatch(/as many of this ticket/);
    expect(ticketTypeRefusal("EVENT_FULL")).toBeNull();
  });

  it("names each code refusal for the code field", () => {
    for (const code of ["INVALID", "NOT_STARTED", "EXPIRED", "NOT_FOR_TYPE", "USED_UP", "LIMIT"]) {
      expect(discountRefusal(`DISCOUNT_CODE_${code}`)).toEqual(expect.any(String));
    }
    expect(discountRefusal("SOMETHING_ELSE")).toBeNull();
  });

  it("normalises the API's errors, with the time to wait after a 429", () => {
    expect(apiFailure(failure(429, { message: "Slow down" }, { "retry-after": "30" }))).toMatchObject({ status: 429, retryAfter: 30, network: false, message: "Slow down" });
    expect(apiFailure(new Error("Network Error"))).toMatchObject({ status: 0, network: true, code: null });
    const once = apiFailure(failure(409, { error_code: "OFFER_CLAIMED", errors: { a: 1 } }));
    expect(apiFailure(once)).toBe(once);
    expect(once).toMatchObject({ code: "OFFER_CLAIMED", errors: { a: 1 } });
  });

  it("says why a code check failed", () => {
    expect(describeCodeCheck(failure(429))).toMatch(/Too many tries/);
    expect(describeCodeCheck(failure(422, { error_code: "DISCOUNT_CODE_INVALID" }))).toMatch(/isn't valid for this event/);
    expect(describeCodeCheck(failure(409, { error_code: "DISCOUNT_CODE_EXPIRED" }))).toBe("That code has expired.");
    expect(describeCodeCheck(failure(422, { error_code: "TICKET_TYPE_REQUIRED" }))).toBe("Choose a ticket first.");
    expect(describeCodeCheck(new Error("offline"))).toMatch(/connection/);
    expect(describeCodeCheck(failure(500, { message: "Internal Server Error" }))).toMatch(/just now/);
  });

  it("says why joining the waiting list failed, by field or as a whole", () => {
    expect(describeWaitlistError(failure(422, { error_code: "WAITLIST_CONTACT_REQUIRED" }))).toMatchObject({ field: "email" });
    expect(describeWaitlistError(failure(422, { error_code: "WHATSAPP_NUMBER" }))).toMatchObject({ field: "phone" });
    expect(describeWaitlistError(failure(409, { error_code: "WAITLIST_NOT_NEEDED", errors: { available: 4 } }))).toMatchObject({ kind: "not_needed" });
    expect(describeWaitlistError(failure(409, { error_code: "WAITLIST_CLOSED" }))).toMatchObject({ kind: "closed" });
    expect(describeWaitlistError(failure(409, { error_code: "ALREADY_REGISTERED" }))).toMatchObject({ kind: "registered" });
    expect(describeWaitlistError(failure(422, { error_code: "TICKET_TYPE_REQUIRED" }))).toEqual({ field: "ticket_type", message: "Choose which ticket to wait for." });
    expect(describeWaitlistError(failure(429))).toMatchObject({ kind: "limit" });
    expect(describeWaitlistError(failure(422, { errors: { email: "value is not a valid email address" } }))).toEqual({ field: "email", message: "value is not a valid email address" });
  });

  it("says why a claim failed: the offer's end, a field, or in words", () => {
    expect(describeClaimError(failure(410, { error_code: "OFFER_EXPIRED" })).kind).toBe("expired");
    expect(describeClaimError(failure(409, { error_code: "OFFER_CLAIMED" })).kind).toBe("claimed");
    expect(describeClaimError(failure(404, { error_code: "OFFER_NOT_FOUND" })).kind).toBe("gone");
    expect(describeClaimError(failure(422, { error_code: "EMAIL_REQUIRED" }))).toMatchObject({ kind: "fields", fields: { email: expect.any(String) } });
    expect(describeClaimError(failure(409, { error_code: "DISCOUNT_CODE_USED_UP" }))).toMatchObject({ kind: "fields", fields: { discount_code: "That code has been used up." } });
    expect(describeClaimError(failure(400, { error_code: "REGISTRATIONS_CLOSED", errors: { closed_reason: "cancelled" } })).kind).toBe("cancelled");
    expect(describeClaimError(failure(409, { error_code: "EVENT_CANCELLED" })).kind).toBe("cancelled");
    expect(describeClaimError(failure(409, { error_code: "ALREADY_REGISTERED" })).kind).toBe("registered");
    expect(describeClaimError(failure(429)).kind).toBe("limit");
    expect(describeClaimError(new Error("offline")).kind).toBe("network");
  });
});

describe("an offer and a ticket's type", () => {
  it("reads the claim page's offer", () => {
    const offer = parseOffer({
      id: "6f1c",
      status: "offered",
      event: { id: 7, slug: "hack-night-04", name: "Hack Night 04", event_datetime: "2026-11-08T18:00:00+05:30", location_name: "Lab 3B", poster: null },
      ticket_type: { id: 12, name: "Early bird", price: 199.0, currency: "INR" },
      full_name: "Asha K",
      email: "as•••@gmail.com",
      phone: "•••••3210",
      expires_at: "2026-11-02T18:00:00+05:30",
      needs_email: false,
      needs_payment: true,
      registration_id: null,
    });
    expect(offer).toMatchObject({
      status: "offered",
      event: { id: 7, slug: "hack-night-04", name: "Hack Night 04", starts_at: "2026-11-08T18:00:00+05:30" },
      ticketType: { id: 12, name: "Early bird", price: 199, isFree: false },
      fullName: "Asha K",
      email: "as•••@gmail.com",
      needsEmail: false,
      needsPayment: true,
      registrationId: null,
    });
    expect(parseOffer({ status: "offered" })).toBeNull();
    expect(parseOffer({ status: "bogus", event: { id: 1, name: "X" } }).status).toBe("removed");
    // A place on the waiting list: no reason, and no club unless the API names one.
    expect(offer.reason).toBeNull();
    expect(offer.event.club).toBeNull();
  });

  it("reads a place the club confirmed (registration approval): the reason, and the club when it is named", () => {
    const base = { id: "6f1c", status: "offered", ticket_type: { id: 12, name: "Early bird", price: 199 }, full_name: "Asha K" };
    const onEvent = parseOffer({ ...base, reason: "approved", event: { id: 7, name: "Hack Night 04", club: { name: "Circuit Society" } } });
    expect(onEvent).toMatchObject({ reason: "approved", event: { club: { name: "Circuit Society" } } });
    expect(parseOffer({ ...base, reason: "approved", event: { id: 7, name: "Hack Night 04" }, club: { name: "DOTSLASH" } }).event.club).toEqual({ name: "DOTSLASH", slug: null });
    expect(parseOffer({ ...base, reason: "waitlist", event: { id: 7, name: "Hack Night 04", club: { name: "C", slug: "c" } } })).toMatchObject({ reason: null, amount: null, event: { club: { name: "C", slug: "c" } } });
    // The confirmed price (its code taken off), only on a confirmed place.
    expect(parseOffer({ ...base, reason: "approved", amount: 159.2, event: { id: 7, name: "Hack Night 04" } }).amount).toBe(159.2);
    expect(parseOffer({ ...base, reason: "approved", amount: null, event: { id: 7, name: "Hack Night 04" } }).amount).toBeNull();
    expect(parseOffer({ ...base, reason: "waitlist", amount: 99, event: { id: 7, name: "Hack Night 04" } }).amount).toBeNull();
  });

  it("finds the type's name in whichever field carries it", () => {
    expect(ticketTypeName({ ticket_type: { id: 12, name: "Early bird" } })).toBe("Early bird");
    expect(ticketTypeName({ ticket_type_name: "Student" })).toBe("Student");
    expect(ticketTypeName({ ticket_label: "VIP" })).toBe("VIP");
    expect(ticketTypeName({ ticket_type: null })).toBeNull();
    expect(ticketTypeName(null)).toBeNull();
  });
});

describe("an event whose club confirms each place: no waiting list", () => {
  const sold = ticketing({
    sold_out: true,
    types: [type({ status: "sold_out", available: 0, waitlist: true }), type({ id: 13, status: "sold_out", available: 0, waitlist: true })],
    waitlist: { enabled: true, offer_hours: 24 },
  });

  it("reads the list as off and no type as offering one, even when an older server still says it is on", () => {
    const t = parseTicketing({ ...sold, requires_approval: true });
    expect(t.requiresApproval).toBe(true);
    expect(t.waitlist.enabled).toBe(false);
    expect(t.types.every((x) => x.waitlist === false)).toBe(true);
    expect(waitlistTypes(t)).toEqual([]);
    expect(typeNote(t.types[0]).text).toBe("Sold out");
  });

  it("as the server sends it now: the list off, and still none", () => {
    const t = parseTicketing({ ...sold, requires_approval: true, waitlist: { enabled: false }, types: [type({ status: "sold_out", available: 0, waitlist: false })] });
    expect(waitlistTypes(t)).toEqual([]);
  });

  it("leaves other events' lists as they were", () => {
    expect(waitlistTypes(parseTicketing(sold)).map((x) => x.id)).toEqual([12, 13]);
    // Built by hand (not parsed), the rule still holds.
    expect(waitlistTypes({ ...parseTicketing(sold), requiresApproval: true })).toEqual([]);
  });

  it("withoutWaitlist turns the list off for a form that knows the event confirms each place", () => {
    const t = withoutWaitlist(parseTicketing(sold));
    expect(t.waitlist).toEqual({ enabled: false, offerHours: 24 });
    expect(t.types.map((x) => x.waitlist)).toEqual([false, false]);
    expect(t.requiresApproval).toBe(true);
    expect(waitlistTypes(t)).toEqual([]);
    expect(withoutWaitlist(null)).toBeNull();
  });

  it("says plainly why joining was refused (409 WAITLIST_OFF_ON_APPROVAL_EVENTS)", () => {
    const p = describeWaitlistError(failure(409, { message: "Waitlist is off on approval events", error_code: "WAITLIST_OFF_ON_APPROVAL_EVENTS" }));
    expect(p).toEqual({ kind: "approval", message: WAITLIST_OFF_ON_APPROVAL });
    expect(p.message).toBe("This event has no waiting list: the club reviews every registration. Register instead, and they'll get back to you.");
  });
});
