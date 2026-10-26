import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * /requests/{token}: where a request for a place stands, for an event whose
 * club confirms each place (registration approval). The API is mocked (the
 * requests module answers with what it parses): nothing leaves the test.
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
    ticket_id: null,
    pay: null,
    ...over,
  });

const show = () =>
  render(
    <MemoryRouter initialEntries={[`/requests/${TOKEN}`]}>
      <AuthProvider>
        <RequestStatus token={TOKEN} />
      </AuthProvider>
    </MemoryRouter>,
  );
const heading = (name) => screen.findByRole("heading", { level: 1, name });
const link = (name) => screen.getByRole("link", { name });

beforeEach(() => {
  vi.clearAllMocks();
  resetAuth();
  window.scrollTo = vi.fn();
  get.mockImplementation(async (url) => (url === "/api/v1/user/profile/me" ? { data: PROFILE } : { data: {} }));
});
afterAll(() => {
  resetAuth();
});

describe("a request waiting for the club", () => {
  it("first paints a loading card, then says it's waiting for the club, with what was sent", async () => {
    let answer;
    requestsApi.byToken.mockReturnValue(new Promise((r) => (answer = r)));
    show();
    expect(screen.getByRole("status", { name: "Loading your request" })).toBeInTheDocument();
    await act(async () => answer(request()));
    expect(await heading("Waiting for Circuit Society to confirm")).toBeInTheDocument();
    expect(requestsApi.byToken).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText(/your request for a place at/)).toHaveTextContent(
      "Asha, your request for a place at Hack Night 04 is in. Circuit Society confirms each place, and your ticket will come by email as soon as they confirm yours.",
    );
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.getByText("Mon, 26 Oct · 10:15 AM IST")).toBeInTheDocument();
    expect(link("Back to the event")).toHaveAttribute("href", "/events/hack-night-04");
    // The event beside it.
    expect(screen.getByRole("complementary", { name: "Your registration" })).toHaveTextContent("by Circuit Society");
  });

  it("is withdrawn only after asking, then says so", async () => {
    requestsApi.byToken.mockResolvedValue(request());
    requestsApi.withdraw.mockResolvedValue(request({ status: "withdrawn" }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw my request" }));
    expect(requestsApi.withdraw).not.toHaveBeenCalled();
    const ask = screen.getByRole("group", { name: "Withdraw your request" });
    expect(ask).toHaveTextContent("Withdraw your request? Circuit Society won't see it any more.");
    // Keeping it puts things back as they were.
    fireEvent.click(within(ask).getByRole("button", { name: "Keep my request" }));
    expect(screen.queryByRole("group", { name: "Withdraw your request" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw my request" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, withdraw it" }));
    expect(await heading("You withdrew your request")).toBeInTheDocument();
    expect(requestsApi.withdraw).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText("Your request was withdrawn.")).toBeInTheDocument();
    expect(link("Request a place again")).toHaveAttribute("href", "/events/hack-night-04/register");
  });

  it("a request decided meanwhile isn't withdrawn: it's read again and shown as it stands", async () => {
    requestsApi.byToken.mockResolvedValueOnce(request()).mockResolvedValueOnce(request({ status: "approved", ticket_id: "MOA7Q4K2X" }));
    requestsApi.withdraw.mockRejectedValue(apiFailure({ response: { status: 409, data: { error_code: "REQUEST_NOT_PENDING" } } }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw my request" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, withdraw it" }));
    expect(await heading("You're in")).toBeInTheDocument();
    expect(screen.getByText("Your request changed meanwhile, so it wasn't withdrawn. Here's where it stands now.")).toBeInTheDocument();
    expect(requestsApi.byToken).toHaveBeenCalledTimes(2);
  });

  it("REQUEST_NOT_WITHDRAWABLE's own copy of the request is shown as it is, without reading it again", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw my request" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, withdraw it" }));
    expect(await heading("No place this time")).toBeInTheDocument();
    expect(screen.getByText("Your request changed meanwhile, so it wasn't withdrawn. Here's where it stands now.")).toBeInTheDocument();
    expect(requestsApi.byToken).toHaveBeenCalledTimes(1);
  });

  it("a withdrawal that can't reach the server says so in place", async () => {
    requestsApi.byToken.mockResolvedValue(request());
    requestsApi.withdraw.mockRejectedValue(apiFailure(new Error("Network Error")));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw my request" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, withdraw it" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't withdraw your request");
    expect(alert).toHaveTextContent("Check your connection and try again.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Waiting for Circuit Society to confirm");
  });

  it("names the club as the club when the API doesn't name it", async () => {
    requestsApi.byToken.mockResolvedValue(request({ event: { id: 9, slug: "x", name: "Night", club: null } }));
    show();
    expect(await heading("Waiting for the club to confirm")).toBeInTheDocument();
  });
});

describe("a request the club confirmed", () => {
  it("free (registered already): you're in, and the ticket", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved", ticket_id: "MOA7Q4K2X" }));
    show();
    expect(await heading("You're in")).toBeInTheDocument();
    expect(screen.getByText(/confirmed your place at/)).toHaveTextContent("Circuit Society confirmed your place at Hack Night 04. Your ticket is in your email too.");
    expect(link("View your ticket")).toHaveAttribute("href", "/tickets/MOA7Q4K2X");
    expect(screen.queryByRole("button", { name: /Withdraw|release/ })).toBeNull();
  });

  it("paid: pay by the time the place is held, on the claim page", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved", pay: { amount: 199, pay_by: "2026-10-27T10:15:00+05:30", claim_token: CLAIM } }));
    show();
    expect(await heading("Circuit Society confirmed your place")).toBeInTheDocument();
    expect(screen.getByText(/to get your ticket for/)).toHaveTextContent(
      "Pay ₹199 by Tue, 27 Oct · 10:15 AM IST to get your ticket for Hack Night 04. Your place is held until then.",
    );
    expect(link("Pay ₹199")).toHaveAttribute("href", `/claim/${CLAIM}`);
  });

  it("paid: the place can be released, after asking", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved", pay: { amount: 199, pay_by: null, claim_token: CLAIM } }));
    requestsApi.withdraw.mockResolvedValue(request({ status: "withdrawn" }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "I can't come: release my place" }));
    expect(screen.getByRole("group", { name: "Withdraw your request" })).toHaveTextContent("Release your place? Circuit Society can offer it to someone else");
    fireEvent.click(screen.getByRole("button", { name: "Yes, withdraw it" }));
    expect(await heading("You withdrew your request")).toBeInTheDocument();
  });

  it("neither a ticket nor a pay link yet: the rest comes by email", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "approved" }));
    show();
    expect(await heading("Circuit Society confirmed your place")).toBeInTheDocument();
    expect(screen.getByText(/Look in your email/)).toBeInTheDocument();
    expect(link("My tickets")).toHaveAttribute("href", "/me/tickets");
  });
});

describe("a request that is over", () => {
  it("declined: gently, with the club's note", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "declined", decline_note: "We could only take final-years this time." }));
    show();
    expect(await heading("No place this time")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t offer you a place/)).toHaveTextContent("Sorry, Circuit Society couldn’t offer you a place at Hack Night 04 this time.");
    expect(screen.getByText(/final-years/)).toHaveTextContent("Circuit Society said: We could only take final-years this time.");
    expect(link("Find other events")).toHaveAttribute("href", "/events");
    expect(screen.queryByRole("button", { name: /Withdraw/ })).toBeNull();
  });

  it("declined without a note says no more", async () => {
    requestsApi.byToken.mockResolvedValue(request({ status: "declined" }));
    show();
    await heading("No place this time");
    expect(screen.queryByText(/said:/)).toBeNull();
  });

  it.each([
    ["withdrawn", "You withdrew your request", /send a new request while registration is open/],
    ["lapsed", "Your place was released", /the payment didn’t arrive in time/],
    ["closed", "This request is closed", /isn’t taking requests any more/],
    ["archived", "Your request", /Check your email for the latest from Circuit Society/],
  ])("%s says what happened, with the way back", async (status, title, text) => {
    requestsApi.byToken.mockResolvedValue(request({ status }));
    show();
    expect(await heading(title)).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(link("Back to the event")).toHaveAttribute("href", "/events/hack-night-04");
    expect(screen.queryByRole("button", { name: /Withdraw/ })).toBeNull();
  });
});

describe("a link that isn't one, and a page that didn't load", () => {
  it("an unknown token says so kindly", async () => {
    requestsApi.byToken.mockRejectedValue(apiFailure({ response: { status: 404, data: { error_code: "REQUEST_NOT_FOUND" } } }));
    show();
    expect(await heading(/This link isn.t valid/)).toBeInTheDocument();
    expect(screen.getByText(/each link shows one request/)).toBeInTheDocument();
    expect(link("Find events")).toHaveAttribute("href", "/events");
  });

  it("a request that didn't load can be asked for again", async () => {
    requestsApi.byToken.mockRejectedValueOnce(apiFailure(new Error("Network Error"))).mockResolvedValueOnce(request());
    show();
    expect(await screen.findByRole("heading", { name: "Your request didn't load" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await heading("Waiting for Circuit Society to confirm")).toBeInTheDocument();
  });

  it("too many tries says to wait", async () => {
    requestsApi.byToken.mockRejectedValue(apiFailure({ response: { status: 429, data: {}, headers: {} } }));
    show();
    expect(await screen.findByText("Too many tries in a row. Wait a minute, then try again.")).toBeInTheDocument();
  });
});

describe("the event beside the request", () => {
  it("says nothing of a venue the request doesn't carry, and names it when it does", async () => {
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
