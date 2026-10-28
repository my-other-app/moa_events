import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * /requests/{token}: where a registration stands, for an event that reviews
 * registrations (registration approval; the API's "request"). The API is
 * mocked (the requests module answers with what it parses): nothing leaves
 * the test.
 */
vi.mock("@/api/requests", () => ({ requestsApi: { byToken: vi.fn(), withdraw: vi.fn(), mine: vi.fn() } }));
const get = vi.fn();
vi.mock("@/api/client", () => ({ default: { get, post: vi.fn(), delete: vi.fn(() => Promise.resolve({ data: {} })) } }));

const { requestsApi } = await import("@/api/requests");
const { AuthProvider } = await import("@/auth/AuthProvider");
const { apiFailure } = await import("@/utils/ticketing");
const { parseRequest } = await import("@/utils/requests");
const RequestStatus = (await import("./request.jsx")).default;
const { PROFILE, resetAuth } = await import("@/test/auth");

const TOKEN = "Rq7abcdefghijklmnopqrstuvwxyz012";
const CLAIM = "Cl4im-token-abcdefghijklmnop";
const RAW = {
  id: "r1",
  status: "pending",
  event: { id: 123, slug: "hack-night-04", name: "Hack Night 04", event_datetime: "2026-11-08T18:00:00+05:30", poster: null, club: { name: "Circuit Society", slug: "circuit-society" } },
  ticket_type: { id: 3, name: "Student" },
  full_name: "Asha Rao",
  submitted_at: "2026-10-26T10:15:00+05:30",
};
const request = (over = {}) =>
  parseRequest({
    id: "r1",
    status: "pending",
    event: {
      id: 123,
      slug: "hack-night-04",
      name: "Hack Night 04",
      event_datetime: "2026-11-08T18:00:00+05:30",
      poster: null,
      club: { name: "Circuit Society", slug: "circuit-society" },
    },
    ticket_type: { id: 3, name: "Student" },
    full_name: "Asha Rao",
    submitted_at: "2026-10-26T10:15:00+05:30",
    decided_at: null,
    decline_note: null,
    closed_reason: null,
    ticket_id: null,
    pay: null,
    ...over,
  });

const show = ({ askToCancel = false } = {}) =>
  render(
    <MemoryRouter initialEntries={[`/requests/${TOKEN}${askToCancel ? "?withdraw=1" : ""}`]}>
      <AuthProvider>
        <RequestStatus token={TOKEN} askToCancel={askToCancel} />
      </AuthProvider>
    </MemoryRouter>,
  );
const heading = (name) => screen.findByRole("heading", { level: 1, name });
const link = (name) => screen.getByRole("link", { name });
const chip = () => document.querySelector(".rq-chip");
const asking = () => screen.queryByRole("group", { name: "Cancel your registration" });

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterAll(() => {
  resetAuth();
});

describe("a registration under review", () => {
  it("first paints a loading card, then says it's under review, with what was registered", async () => {
    let answer;
    requestsApi.byToken.mockReturnValue(new Promise((r) => (answer = r)));
    show();
    expect(screen.getByRole("status", { name: "Loading your registration" })).toBeInTheDocument();
    await act(async () => answer(request()));
    expect(await heading("Your registration is under review")).toBeInTheDocument();
    expect(chip()).toHaveTextContent("Under review");
    expect(requestsApi.byToken).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText(/registered for/)).toHaveTextContent(
      "Asha, you’re registered for Hack Night 04. Circuit Society reviews every registration. If yours is confirmed, your ticket will come by email. There’s nothing else to do.",
    );
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.getByText("Registered")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).toBeNull();
    expect(screen.getByText("Mon, 26 Oct · 10:15 AM IST")).toBeInTheDocument();
    expect(link("Back to the event")).toHaveAttribute("href", "/events/hack-night-04");
    // The event beside it.
    expect(screen.getByRole("complementary", { name: "Your registration" })).toHaveTextContent("by Circuit Society");
    // Nothing is asked until the person asks.
    expect(asking()).toBeNull();
  });

  it("without a first name: you're registered", async () => {
    requestsApi.byToken.mockResolvedValue(request({ full_name: "" }));
    show();
    await heading("Your registration is under review");
    expect(screen.getByText(/registered for/)).toHaveTextContent(/^You’re registered for Hack Night 04\./);
  });

  it("is cancelled only after asking, then says so", async () => {
    requestsApi.byToken.mockResolvedValue(request());
    requestsApi.withdraw.mockResolvedValue(request({ status: "withdrawn" }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel my registration" }));
    expect(requestsApi.withdraw).not.toHaveBeenCalled();
    const ask = asking();
    expect(ask).toHaveTextContent("Cancel your registration? Circuit Society won't review it any more. You can register again while registration is open.");
    // Keeping it puts things back as they were.
    fireEvent.click(within(ask).getByRole("button", { name: "Keep my registration" }));
    expect(asking()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel my registration" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await heading("You cancelled your registration")).toBeInTheDocument();
    expect(requestsApi.withdraw).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText("Your registration was cancelled.")).toBeInTheDocument();
    expect(chip()).toHaveTextContent("Cancelled");
    expect(link("Register again")).toHaveAttribute("href", "/events/hack-night-04/register");
  });

  it("says it's cancelling while it does", async () => {
    requestsApi.byToken.mockResolvedValue(request());
    requestsApi.withdraw.mockReturnValue(new Promise(() => {}));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel my registration" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await screen.findByRole("button", { name: /Cancelling…/ })).toBeDisabled();
  });

  it("one decided meanwhile isn't cancelled: it's read again and shown as it stands", async () => {
    requestsApi.byToken.mockResolvedValueOnce(request()).mockResolvedValueOnce(request({ status: "approved", ticket_id: "MOA7Q4K2X" }));
    requestsApi.withdraw.mockRejectedValue(apiFailure({ response: { status: 409, data: { error_code: "REQUEST_NOT_PENDING" } } }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel my registration" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await heading("You're in")).toBeInTheDocument();
    expect(screen.getByText("Your registration changed meanwhile, so it wasn't cancelled. Here's where it stands now.")).toBeInTheDocument();
    expect(requestsApi.byToken).toHaveBeenCalledTimes(2);
  });

  it("REQUEST_NOT_WITHDRAWABLE's own copy is shown as it is, without reading it again", async () => {
    requestsApi.byToken.mockResolvedValue(request());
    requestsApi.withdraw.mockRejectedValue(
      apiFailure({
        response: {
          status: 409,
          data: { error_code: "REQUEST_NOT_WITHDRAWABLE", errors: { request: { ...RAW, status: "declined", decline_note: "Full, sorry." } } },
        },
      }),
    );
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel my registration" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await heading("Your registration wasn't confirmed")).toBeInTheDocument();
    expect(screen.getByText("Your registration changed meanwhile, so it wasn't cancelled. Here's where it stands now.")).toBeInTheDocument();
    expect(requestsApi.byToken).toHaveBeenCalledTimes(1);
  });

  it("a cancel that can't reach the server says so in place", async () => {
    requestsApi.byToken.mockResolvedValue(request());
    requestsApi.withdraw.mockRejectedValue(apiFailure(new Error("Network Error")));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel my registration" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't cancel your registration");
    expect(alert).toHaveTextContent("Check your connection and try again.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your registration is under review");
  });

  it("names the club as the club when the API doesn't name it", async () => {
    requestsApi.byToken.mockResolvedValue(request({ event: { id: 9, slug: "x", name: "Night", club: null } }));
    show();
    await heading("Your registration is under review");
    expect(screen.getByText(/registered for/)).toHaveTextContent("The club reviews every registration.");
  });
});

describe("the email's cancel link (?withdraw=1)", () => {
  it("opens the cancel question once the registration has loaded, and still asks before cancelling", async () => {
    let answer;
    requestsApi.byToken.mockReturnValue(new Promise((r) => (answer = r)));
    requestsApi.withdraw.mockResolvedValue(request({ status: "withdrawn" }));
    show({ askToCancel: true });
    // Nothing to ask about while it loads.
    expect(asking()).toBeNull();
    await act(async () => answer(request()));
    await heading("Your registration is under review");
    const ask = asking();
    expect(ask).toHaveTextContent("Cancel your registration? Circuit Society won't review it any more.");
    expect(requestsApi.withdraw).not.toHaveBeenCalled();
    // The question has the focus, not the button that cancels.
    expect(document.activeElement).toBe(within(ask).getByText(/^Cancel your registration\?/));
    fireEvent.click(within(ask).getByRole("button", { name: "Yes, cancel it" }));
    expect(await heading("You cancelled your registration")).toBeInTheDocument();
    expect(requestsApi.withdraw).toHaveBeenCalledWith(TOKEN);
  });

  it("keeping it closes the question, and the registration stays as it was", async () => {
    requestsApi.byToken.mockResolvedValue(request());
    show({ askToCancel: true });
    await heading("Your registration is under review");
    fireEvent.click(within(asking()).getByRole("button", { name: "Keep my registration" }));
    expect(asking()).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel my registration" })).toBeInTheDocument();
    expect(requestsApi.withdraw).not.toHaveBeenCalled();
  });

  it("a confirmed ticket still to pay for asks with its own words", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved", pay: { amount: 199, pay_by: "2026-10-27T10:15:00+05:30", claim_token: CLAIM } }));
    show({ askToCancel: true });
    await heading("Your registration is confirmed");
    expect(asking()).toHaveTextContent("Cancel your registration? Your ticket will go to someone else, and you can't undo this.");
  });

  it.each([
    ["declined", "Your registration wasn't confirmed"],
    ["withdrawn", "You cancelled your registration"],
    ["lapsed", "Your registration has expired"],
    ["closed", "This registration is closed"],
  ])("asks nothing when it can't be cancelled any more (%s)", async (status, title) => {
    requestsApi.byToken.mockResolvedValue(request({ status }));
    show({ askToCancel: true });
    expect(await heading(title)).toBeInTheDocument();
    expect(asking()).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });

  it("asks nothing for a confirmed one that has its ticket", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved", ticket_id: "MOA7Q4K2X" }));
    show({ askToCancel: true });
    await heading("You're in");
    expect(asking()).toBeNull();
  });

  it("asks once the registration loads after a failed first read", async () => {
    requestsApi.byToken.mockRejectedValueOnce(apiFailure(new Error("Network Error"))).mockResolvedValueOnce(request());
    show({ askToCancel: true });
    fireEvent.click(await screen.findByRole("button", { name: /Try again/ }));
    await heading("Your registration is under review");
    expect(asking()).not.toBeNull();
  });
});

describe("a registration the club confirmed", () => {
  it("free (registered already): you're in, and the ticket", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved", ticket_id: "MOA7Q4K2X" }));
    show();
    expect(await heading("You're in")).toBeInTheDocument();
    expect(chip()).toHaveTextContent(/^Confirmed$/);
    expect(screen.getByText(/confirmed your registration for/)).toHaveTextContent("Circuit Society confirmed your registration for Hack Night 04. Your ticket is in your email too.");
    expect(link("View your ticket")).toHaveAttribute("href", "/tickets/MOA7Q4K2X");
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });

  it("paid: pay by the time the ticket is held, on the claim page", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved", pay: { amount: 199, pay_by: "2026-10-27T10:15:00+05:30", claim_token: CLAIM } }));
    show();
    expect(await heading("Your registration is confirmed")).toBeInTheDocument();
    expect(chip()).toHaveTextContent("Confirmed · pay by Tue, 27 Oct · 10:15 AM IST to get your ticket");
    expect(screen.getByText(/to get your ticket for/)).toHaveTextContent(
      "Pay ₹199 by Tue, 27 Oct · 10:15 AM IST to get your ticket for Hack Night 04. Your ticket is held for you until then.",
    );
    expect(link("Pay ₹199")).toHaveAttribute("href", `/claim/${CLAIM}`);
  });

  it("paid: it can be cancelled, after asking", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved", pay: { amount: 199, pay_by: null, claim_token: CLAIM } }));
    requestsApi.withdraw.mockResolvedValue(request({ status: "withdrawn" }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "I can't come: cancel my registration" }));
    expect(asking()).toHaveTextContent("Cancel your registration? Your ticket will go to someone else, and you can't undo this.");
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    expect(await heading("You cancelled your registration")).toBeInTheDocument();
  });

  it("neither a ticket nor a pay link yet: the rest comes by email", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved" }));
    show();
    expect(await heading("Your registration is confirmed")).toBeInTheDocument();
    expect(screen.getByText(/Look in your email/)).toHaveTextContent("Look in your email for your ticket, or for the link to pay for it.");
    expect(link("My tickets")).toHaveAttribute("href", "/me/tickets");
  });
});

describe("a registration that is over", () => {
  it("declined: gently, with the club's note", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "declined", decline_note: "We could only take final-years this time." }));
    show();
    expect(await heading("Your registration wasn't confirmed")).toBeInTheDocument();
    expect(chip()).toHaveTextContent("Not confirmed");
    expect(screen.getByText(/Thank you for your interest/)).toHaveTextContent(
      "Thank you for your interest in Hack Night 04. Circuit Society couldn’t confirm your registration this time.",
    );
    expect(screen.getByText(/final-years/)).toHaveTextContent("Circuit Society said: We could only take final-years this time.");
    expect(link("Find other events")).toHaveAttribute("href", "/events");
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });

  it("declined without a note says no more", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "declined" }));
    show();
    await heading("Your registration wasn't confirmed");
    expect(screen.queryByText(/said:/)).toBeNull();
  });

  it.each([
    ["withdrawn", "You cancelled your registration", "Cancelled", "Circuit Society won’t review it any more. If you change your mind, you can register again while registration is open."],
    ["lapsed", "Your registration has expired", "Expired", "Circuit Society confirmed your registration for Hack Night 04, but it wasn’t paid in time. If registration is still open, you can register again."],
    ["archived", "Your registration", null, "Check your email for the latest from Circuit Society about your registration."],
  ])("%s says what happened, with the way back", async (status, title, word, text) => {
    requestsApi.byToken.mockResolvedValue(request({ status }));
    show();
    expect(await heading(title)).toBeInTheDocument();
    if (word) expect(chip()).toHaveTextContent(word);
    else expect(chip()).toBeNull();
    expect(screen.getByText(text.slice(0, 20), { exact: false })).toHaveTextContent(text);
    expect(link("Back to the event")).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });
});

describe("a closed registration, by its closed_reason", () => {
  it.each([
    ["event_ended", "Hack Night 04 ended before Circuit Society could confirm your registration."],
    [null, "Hack Night 04 ended before Circuit Society could confirm your registration."],
    ["something_new", "Hack Night 04 ended before Circuit Society could confirm your registration."],
  ])("%s: the event ended first", async (reason, text) => {
    requestsApi.byToken.mockResolvedValue(request({ status: "closed", closed_reason: reason }));
    show();
    expect(await heading("This registration is closed")).toBeInTheDocument();
    expect(chip()).toHaveTextContent("Closed");
    expect(screen.getByText(/ended before/)).toHaveTextContent(text);
    expect(link("Back to the event")).toHaveAttribute("href", "/events/hack-night-04");
    expect(link("Find other events")).toHaveAttribute("href", "/events");
  });

  it("event_deleted: the same words, with no way back to a page that's gone", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "closed", closed_reason: "event_deleted" }));
    show();
    expect(await heading("This registration is closed")).toBeInTheDocument();
    expect(screen.getByText(/ended before/)).toHaveTextContent("Hack Night 04 ended before Circuit Society could confirm your registration.");
    expect(screen.queryByRole("link", { name: "Back to the event" })).toBeNull();
    expect(link("Find other events")).toHaveAttribute("href", "/events");
  });

  it("event_cancelled: the event was cancelled, and we emailed", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "closed", closed_reason: "event_cancelled" }));
    show();
    expect(await heading("This registration is closed")).toBeInTheDocument();
    expect(screen.getByText(/was cancelled/)).toHaveTextContent("Hack Night 04 was cancelled. We’ve emailed you about it.");
    expect(link("Back to the event")).toHaveAttribute("href", "/events/hack-night-04");
    expect(link("Find other events")).toHaveAttribute("href", "/events");
  });

  it("registered_directly: you're registered, with a ticket already", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "closed", closed_reason: "registered_directly" }));
    show();
    expect(await heading("You're registered")).toBeInTheDocument();
    expect(chip()).toHaveTextContent("Closed");
    expect(screen.getByText(/already/)).toHaveTextContent("You have a ticket for Hack Night 04 already.");
    expect(link("My tickets")).toHaveAttribute("href", "/me/tickets");
    expect(link("Back to the event")).toHaveAttribute("href", "/events/hack-night-04");
  });

  it("names the club as the club when the API doesn't name it", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "closed", closed_reason: "event_ended", event: { id: 9, slug: "x", name: "Night", club: null } }));
    show();
    await heading("This registration is closed");
    expect(screen.getByText(/ended before/)).toHaveTextContent("Night ended before the club could confirm your registration.");
  });
});

describe("a link that isn't one, and a page that didn't load", () => {
  it("an unknown token says so kindly", async () => {
    requestsApi.byToken.mockRejectedValue(apiFailure({ response: { status: 404, data: { error_code: "REQUEST_NOT_FOUND" } } }));
    show();
    expect(await heading(/This link isn.t valid/)).toBeInTheDocument();
    expect(screen.getByText(/each link shows one registration/)).toHaveTextContent(
      "We couldn’t find a registration at this address. Check that the whole link was copied from your email: each link shows one registration.",
    );
    expect(link("Find events")).toHaveAttribute("href", "/events");
  });

  it("one that didn't load can be asked for again", async () => {
    requestsApi.byToken.mockRejectedValueOnce(apiFailure(new Error("Network Error"))).mockResolvedValueOnce(request());
    show();
    expect(await screen.findByRole("heading", { name: "Your registration didn't load" })).toBeInTheDocument();
    expect(screen.getByText(/read this registration/)).toHaveTextContent("We couldn't reach MyOtherApp to read this registration. Check your connection and try again.");
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await heading("Your registration is under review")).toBeInTheDocument();
  });

  it("too many tries says to wait", async () => {
    requestsApi.byToken.mockRejectedValue(apiFailure({ response: { status: 429, data: {}, headers: {} } }));
    show();
    expect(await screen.findByText("Too many tries in a row. Wait a minute, then try again.")).toBeInTheDocument();
  });
});

describe("the event beside the registration", () => {
  it("says nothing of a venue the registration doesn't carry, and names it when it does", async () => {
    requestsApi.byToken.mockResolvedValue(request());
    const first = show();
    const aside = await screen.findByRole("complementary", { name: "Your registration" });
    expect(aside).not.toHaveTextContent("Venue to be announced");
    first.unmount();
    requestsApi.byToken.mockResolvedValue(request({ event: { id: 123, slug: "hack-night-04", name: "Hack Night 04", event_datetime: "2026-11-08T18:00:00+05:30", location_name: "Lab 3B, COEP" } }));
    show();
    expect(await screen.findByRole("complementary", { name: "Your registration" })).toHaveTextContent("Lab 3B, COEP");
  });
});
