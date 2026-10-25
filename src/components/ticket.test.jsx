import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The ticket page (/tickets/{id}), once the ticket has come: what it says,
 * the QR the door scans, the way to the event's guidelines and, when the
 * event runs a competition, to the team's page. The API is mocked; the QR is
 * the real component, watched for what it encodes.
 */
vi.mock("@/api/events", () => ({ eventsApi: { fetchTicketDetails: vi.fn() } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn() } }));
vi.mock("qrcode.react", async (importOriginal) => {
  const real = await importOriginal();
  const { createElement } = await import("react");
  return { ...real, QRCodeCanvas: vi.fn((props) => createElement(real.QRCodeCanvas, props)) };
});

const { eventsApi } = await import("@/api/events");
const { competitionApi } = await import("@/api/competition");
const { QRCodeCanvas } = await import("qrcode.react");
const { default: Ticket, ticketKind } = await import("./ticket.jsx");

/** GET /events/tickets/{id} (TicketDetailsResponse): the time as the API writes it, in UTC. */
const ticket = (over = {}, event = {}) => ({
  ticket_id: "MOA77",
  event: {
    id: 68,
    name: "Hack Night 04",
    slug: "hack-night-04",
    poster: { original: "https://cdn.example/p.jpg" },
    event_datetime: "2026-10-18T12:30:00+00:00",
    duration: 3,
    location_name: "Lab 3B, COEP",
    has_fee: false,
    is_online: false,
    ...event,
  },
  is_paid: true,
  actual_amount: null,
  paid_amount: null,
  payment_receipt: null,
  is_attended: false,
  attended_on: null,
  user: { id: 7, full_name: "Asha Rao" },
  created_at: "2026-10-10T10:00:00+00:00",
  ...over,
});

const open = (id = "MOA77") =>
  render(
    <MemoryRouter initialEntries={[`/tickets/${id}`]}>
      <Ticket ticketid={id} />
    </MemoryRouter>
  );

/** The value under a label on the ticket. */
const field = (label) => screen.getByText(label).closest(".ticket-info").querySelector(".ticket-info-value").textContent;

// The visitor's clock is far from India's: what the ticket says must not follow it.
const TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = TZ;
});

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom draws no canvases; the QR's drawing is skipped, its element stays.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  competitionApi.leaderboard.mockResolvedValue({ event_id: 68, enabled: false, public: false, rows: [] });
});

describe("the ticket page", () => {
  it("shows the event, its date and time in India time, the venue, the holder and the ticket id", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    open();
    expect(await screen.findByRole("heading", { level: 1, name: "Hack Night 04" })).toBeInTheDocument();
    expect(eventsApi.fetchTicketDetails).toHaveBeenCalledWith("MOA77");
    expect(field("Date")).toBe("18 Oct 2026");
    // 12:30 UTC is 6 PM in India (and 8:30 AM on the visitor's clock): never the "12:30" cut from the text.
    expect(field("Time")).toBe("6:00 PM IST");
    expect(field("Location")).toBe("Lab 3B, COEP");
    expect(field("Ticket ID")).toBe("MOA77");
    expect(field("Ticket Holder Name")).toBe("Asha Rao");
  });

  it("reads a time already in India's offset as it is", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket({}, { event_datetime: "2026-10-18T18:00:00+05:30" }));
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(field("Date")).toBe("18 Oct 2026");
    expect(field("Time")).toBe("6:00 PM IST");
  });

  it("puts a late-night start on India's date, not UTC's", async () => {
    // 19:00 UTC on the 18th is half past midnight on the 19th in India.
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket({}, { event_datetime: "2026-10-18T19:00:00Z" }));
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(field("Date")).toBe("19 Oct 2026");
    expect(field("Time")).toBe("12:30 AM IST");
  });

  it("says N/A for a time it doesn't have, and Online for an online event", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket({ user: { id: 7, full_name: "" } }, { event_datetime: null, is_online: true, location_name: null }));
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(field("Date")).toBe("N/A");
    expect(field("Time")).toBe("N/A");
    expect(field("Location")).toBe("Online");
    expect(field("Ticket Holder Name")).toBe("N/A");
  });

  it.each([
    ["a free event's", ticket(), "Free"],
    ["a paid one's", ticket({ is_paid: true, actual_amount: 250, paid_amount: 250 }, { has_fee: true }), "Paid · ₹250"],
    ["one still waiting for its payment", ticket({ is_paid: false, actual_amount: 250, paid_amount: null }, { has_fee: true }), "Payment pending"],
  ])("says what kind of ticket it is: %s", async (_, data, kind) => {
    eventsApi.fetchTicketDetails.mockResolvedValue(data);
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(field("Ticket Type")).toBe(kind);
    expect(screen.queryByText("BASIC")).toBeNull();
  });

  it("links the guidelines to the event's own page, never to #", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    open();
    const link = await screen.findByRole("link", { name: "Check Out Guidelines" });
    expect(link).toHaveAttribute("href", "/events/hack-night-04#guidelines");
  });

  it("links the guidelines by the event's id when the ticket has no slug", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket({}, { slug: null }));
    open();
    expect(await screen.findByRole("link", { name: "Check Out Guidelines" })).toHaveAttribute("href", "/68#guidelines");
  });

  it("draws the QR the door scans: the ticket's id", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    open();
    expect(await screen.findByRole("img", { name: "QR code for ticket MOA77" })).toBeInTheDocument();
    expect(QRCodeCanvas.mock.lastCall[0]).toMatchObject({ value: "MOA77", level: "H" });
  });

  it("asks again when the ticket didn't load, and shows it once it does", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValueOnce(null).mockResolvedValueOnce(ticket());
    open();
    expect(await screen.findByText(/Failed to load ticket details/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "RETRY" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Hack Night 04" })).toBeInTheDocument();
    expect(eventsApi.fetchTicketDetails).toHaveBeenCalledTimes(2);
  });
});

describe("the way to the competition from the ticket", () => {
  it("is there when the event runs one", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    competitionApi.leaderboard.mockResolvedValue({ event_id: 68, enabled: true, public: false, rows: [] });
    open();
    expect(await screen.findByRole("link", { name: "Your team and submission" })).toHaveAttribute("href", "/68/compete");
    expect(competitionApi.leaderboard).toHaveBeenCalledWith(68);
  });

  it("isn't there when the event runs none, or the API can't say", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    await waitFor(() => expect(competitionApi.leaderboard).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Your team and submission" })).toBeNull();

    competitionApi.leaderboard.mockRejectedValue(new Error("offline"));
    open("MOA78");
    await waitFor(() => expect(competitionApi.leaderboard).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("link", { name: "Your team and submission" })).toBeNull();
  });
});

describe("what kind of ticket", () => {
  it("is free, paid for what was paid, or waiting for its payment", () => {
    expect(ticketKind(ticket())).toBe("Free");
    // A fee on the registration makes it a paid ticket even when the event's flag says nothing.
    expect(ticketKind(ticket({ actual_amount: 99, paid_amount: 99 }))).toBe("Paid · ₹99");
    expect(ticketKind(ticket({ paid_amount: 1499.5 }, { has_fee: true }))).toBe("Paid · ₹1,499.5");
    expect(ticketKind(ticket({ paid_amount: null }, { has_fee: true }))).toBe("Paid");
    expect(ticketKind(ticket({ is_paid: false, actual_amount: 250 }, { has_fee: true }))).toBe("Payment pending");
    expect(ticketKind(null)).toBe("Free");
  });
});
