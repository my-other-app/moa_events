import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * /tickets/cancel?t=…: giving a ticket back from the email's link. The calls
 * are mocked (the module answers with what it parses): nothing leaves. Every
 * refusal is said in words; a paid ticket points to the organiser.
 */
vi.mock("@/api/ticketcancel", () => ({ ticketCancelApi: { info: vi.fn(), cancel: vi.fn() } }));
const { ticketCancelApi } = await import("@/api/ticketcancel");
const { apiFailure } = await import("@/utils/ticketing");
const { parseCancelInfo } = await import("@/utils/ticketcancel");
const TicketCancel = (await import("./ticketcancel.jsx")).default;

const TOKEN = "eyJyIjoxMjN9.c2lnbmF0dXJlLXZhbHVl";
const info = (over = {}) =>
  parseCancelInfo({
    event: { id: 68, name: "Hack Night 04", slug: "hack-night-04", starts_at: "2026-12-08T18:00:00+05:30", poster: null },
    attendee_name: "Asha Rao",
    ticket_code_masked: "MOA-••••-XY7QZ",
    cancellable: true,
    organiser_email: "hello@circuit.example.org",
    ...over,
  });
const refused = (status, code) => apiFailure({ response: { status, data: code ? { error_code: code } : {} } });
const show = (token = TOKEN) =>
  render(
    <MemoryRouter initialEntries={[`/tickets/cancel?t=${token}`]}>
      <TicketCancel token={token} />
    </MemoryRouter>,
  );
const heading = (name) => screen.findByRole("heading", { level: 1, name });

beforeEach(() => vi.clearAllMocks());

describe("giving a ticket back", () => {
  it("shows the event and the ticket, asks first, and gives it back with the reason", async () => {
    ticketCancelApi.info.mockResolvedValue(info());
    ticketCancelApi.cancel.mockResolvedValue({ cancelled: true });
    show();
    expect(screen.getByRole("status", { name: "Loading your ticket" })).toBeInTheDocument();
    expect(await heading("Can’t come?")).toBeInTheDocument();
    expect(screen.getByText("MOA-••••-XY7QZ")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Your registration" })).toHaveTextContent("Hack Night 04");
    fireEvent.click(screen.getByRole("button", { name: "Give my ticket back" }));
    expect(ticketCancelApi.cancel).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Why can’t you come\?/), { target: { value: "Exams moved" } });
    // Keeping it puts things back.
    fireEvent.click(screen.getByRole("button", { name: "Keep my ticket" }));
    expect(screen.queryByRole("group", { name: "Give your ticket back" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Give my ticket back" }));
    fireEvent.change(screen.getByLabelText(/Why can’t you come\?/), { target: { value: "Exams moved" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, give it back" }));
    expect(await heading("Your ticket is given back")).toBeInTheDocument();
    expect(ticketCancelApi.cancel).toHaveBeenCalledWith(TOKEN, "Exams moved");
  });

  it("a paid ticket: write to the organiser for a refund, with nothing to press", async () => {
    ticketCancelApi.info.mockResolvedValue(info({ cancellable: false, reason: "paid" }));
    show();
    expect(await heading("This ticket was paid for")).toBeInTheDocument();
    expect(screen.getByText(/Write to hello@circuit.example.org for a refund\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Write to hello@circuit.example.org/ })).toHaveAttribute("href", expect.stringMatching(/^mailto:hello@circuit\.example\.org\?subject=Refund/));
    expect(screen.queryByRole("button", { name: "Give my ticket back" })).toBeNull();
  });

  it.each([
    ["started", "This event has started"],
    ["checked_in", "You've been checked in"],
    ["already_cancelled", "You've given this ticket back"],
    ["not_allowed", "This event doesn't take tickets back here"],
    ["invalid", "This link isn't valid"],
  ])("says %s in words", async (reason, title) => {
    ticketCancelApi.info.mockResolvedValue(info({ cancellable: false, reason }));
    show();
    expect(await heading(title)).toBeInTheDocument();
  });

  it("a refusal on the confirm (409 with its reason) is shown as it stands", async () => {
    ticketCancelApi.info.mockResolvedValue(info());
    ticketCancelApi.cancel.mockRejectedValue(refused(409, "STARTED"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Give my ticket back" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, give it back" }));
    expect(await heading("This event has started")).toBeInTheDocument();
  });

  it("an unknown link, or an API without the route (404), isn't valid; no token isn't even asked about", async () => {
    ticketCancelApi.info.mockRejectedValue(refused(404));
    const { unmount } = show();
    expect(await heading("This link isn't valid")).toBeInTheDocument();
    unmount();
    vi.clearAllMocks();
    render(
      <MemoryRouter>
        <TicketCancel token={null} />
      </MemoryRouter>,
    );
    expect(await heading("This link isn't valid")).toBeInTheDocument();
    expect(ticketCancelApi.info).not.toHaveBeenCalled();
  });

  it("a failure to load can be tried again", async () => {
    ticketCancelApi.info.mockRejectedValueOnce(refused(503)).mockResolvedValueOnce(info());
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(ticketCancelApi.info).toHaveBeenCalledTimes(2));
    expect(await heading("Can’t come?")).toBeInTheDocument();
  });
});
