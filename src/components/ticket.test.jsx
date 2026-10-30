import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/*
 * The ticket page (/tickets/{id}), once the ticket has come: what it says,
 * the QR the door scans, the way to the event's guidelines and, when the
 * event runs a competition, to the team's page. The API is mocked; the QR is
 * the real component, watched for what it encodes.
 */
vi.mock("@/api/events", () => ({ eventsApi: { fetchTicketDetails: vi.fn(), fetchTicketImage: vi.fn() } }));
vi.mock("@/api/competition", () => ({ competitionApi: { leaderboard: vi.fn() } }));
// The event's public page, which says whether it was cancelled: not found unless a test says otherwise.
vi.mock("@/api/discover", () => ({ discoverApi: { event: vi.fn(() => Promise.reject(Object.assign(new Error("No such event"), { notFound: true }))) } }));
vi.mock("qrcode.react", async (importOriginal) => {
  const real = await importOriginal();
  const { createElement } = await import("react");
  return { ...real, QRCodeCanvas: vi.fn((props) => createElement(real.QRCodeCanvas, props)) };
});

const { eventsApi } = await import("@/api/events");
const { competitionApi } = await import("@/api/competition");
const { QRCodeCanvas } = await import("qrcode.react");
const { default: Ticket, SHOW_AT_VENUE, ticketKind } = await import("./ticket.jsx");

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

/*
 * jsdom has no object URLs. The page shows the club's rendered design from
 * one, so the tests that expect it stand these in; the rest leave them
 * alone, which is itself a case worth covering -- a browser that can't make
 * one falls back to the ticket the page draws.
 */
const madeUrls = [];
const withObjectUrls = () => {
  URL.createObjectURL = vi.fn((blob) => {
    const url = `blob:ticket-${madeUrls.length}`;
    madeUrls.push({ url, blob });
    return url;
  });
  URL.revokeObjectURL = vi.fn((url) => madeUrls.push({ url, revoked: true }));
};

beforeEach(() => {
  vi.clearAllMocks();
  madeUrls.length = 0;
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
  // jsdom draws no canvases; the QR's drawing is skipped, its element stays.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  competitionApi.leaderboard.mockResolvedValue({ event_id: 68, enabled: false, public: false, rows: [] });
  /*
   * No rendered design unless a test gives one: every test below that reads
   * the drawn ticket is reading the fallback, which is what a browser gets
   * from an older server, a failed render, or a ticket it may not read.
   */
  eventsApi.fetchTicketImage.mockResolvedValue(null);
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

const { discoverApi } = await import("@/api/discover");

describe("ticket types and a cancelled event", () => {
  const CANCELLED = { event: { id: 68, slug: "hack-night-04", status: "cancelled", cancellation: { reason: "The venue flooded.", cancelled_at: "2026-10-12T10:00:00+05:30" } } };

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("names the ticket's type when the ticket says it", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket({ is_paid: true, actual_amount: 499, paid_amount: 499, ticket_label: "VIP" }, { has_fee: true }));
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(field("Ticket Type")).toBe("VIP · Paid · ₹499");
  });

  it("names it from the registration just made when the ticket doesn't (yet) say it", async () => {
    sessionStorage.setItem("moa.register.done.68", JSON.stringify({ eventId: "68", ticket_id: "MOA77", name: "Asha Rao", ticket_type: "Early bird" }));
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(field("Ticket Type")).toBe("Early bird · Free");
  });

  it("asks the event's own page whether it is still on, and says nothing new when it is", async () => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    await waitFor(() => expect(discoverApi.event).toHaveBeenCalledWith("hack-night-04"));
    expect(screen.queryByText("This event was cancelled")).toBeNull();
    expect(QRCodeCanvas).toHaveBeenCalled();
  });

  it("a cancelled event's paid ticket: the reason, the refund, and no QR to scan", async () => {
    discoverApi.event.mockResolvedValueOnce(CANCELLED);
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket({ is_paid: true, actual_amount: 250, paid_amount: 250 }, { has_fee: true }));
    open();
    expect(await screen.findByText("This event was cancelled")).toBeInTheDocument();
    expect(screen.getByText("The venue flooded.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Your payment is being refunded.")).toBeInTheDocument();
    expect(screen.getByText(/Cancelled on 12 Oct 2026. This ticket is no longer valid./)).toBeInTheDocument();
    expect(field("Ticket Type")).toBe("Cancelled");
    expect(screen.queryByLabelText("QR code for ticket MOA77")).toBeNull();
  });

  it("a cancelled event's free ticket says nothing of refunds", async () => {
    discoverApi.event.mockResolvedValueOnce(CANCELLED);
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    open();
    expect(await screen.findByText("This event was cancelled")).toBeInTheDocument();
    expect(screen.queryByText("Your payment is being refunded.")).toBeNull();
  });
});

/*
 * The ticket page shows the ticket the club actually designed: the server's
 * render of the same template, payload and engine as the emailed PDF (GET
 * /events/tickets/{id}/image), as the app has shown for a while. The ticket
 * this page draws from the raw fields is the fallback, so the page never
 * shows nothing.
 */
describe("the club's own design", () => {
  const png = () => new Blob(["not really a png"], { type: "image/png" });

  beforeEach(() => {
    withObjectUrls();
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket({ ticket_label: "VIP" }));
  });

  it("shows it in place of the ticket the page draws", async () => {
    eventsApi.fetchTicketImage.mockResolvedValue(png());
    const { container } = open();
    const img = await screen.findByRole("img", { name: /as the club designed it/i });
    expect(eventsApi.fetchTicketImage).toHaveBeenCalledWith("MOA77");
    expect(img).toHaveAttribute("src", "blob:ticket-0");
    // The page's own ticket, and its QR, are not drawn beside it.
    expect(container.querySelector(".ticket-info-grid")).toBeNull();
    expect(screen.queryByLabelText("QR code for ticket MOA77")).toBeNull();
  });

  it("keeps the ticket's id, its type and the guidelines beside it, which a design needn't print", async () => {
    eventsApi.fetchTicketImage.mockResolvedValue(png());
    open();
    await screen.findByRole("img", { name: /as the club designed it/i });
    expect(screen.getByText("MOA77")).toBeInTheDocument();
    expect(screen.getByText("VIP · Free")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Check Out Guidelines" })).toHaveAttribute("href", "/events/hack-night-04#guidelines");
  });

  it("still offers the download", async () => {
    eventsApi.fetchTicketImage.mockResolvedValue(png());
    open();
    await screen.findByRole("img", { name: /as the club designed it/i });
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("lets the picture go when the page is left", async () => {
    eventsApi.fetchTicketImage.mockResolvedValue(png());
    const { unmount } = open();
    await screen.findByRole("img", { name: /as the club designed it/i });
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:ticket-0");
  });

  it("waits with a ticket-shaped space rather than flashing the fallback", async () => {
    let hand;
    eventsApi.fetchTicketImage.mockReturnValue(new Promise((resolve) => (hand = resolve)));
    const { container } = open();
    expect(await screen.findByLabelText("Loading your ticket")).toBeInTheDocument();
    expect(container.querySelector(".ticket-info-grid")).toBeNull();
    hand(png());
    await screen.findByRole("img", { name: /as the club designed it/i });
  });
});

describe("when the rendered design can't be had", () => {
  beforeEach(() => {
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
  });

  it("falls back to the ticket the page draws, with its QR: an older server, or a render that failed", async () => {
    withObjectUrls();
    eventsApi.fetchTicketImage.mockResolvedValue(null);
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(screen.getByLabelText("QR code for ticket MOA77")).toBeInTheDocument();
    expect(field("Ticket ID")).toBe("MOA77");
    expect(screen.queryByRole("img", { name: /as the club designed it/i })).toBeNull();
  });

  it("falls back when the request itself fails -- refused, or no connection", async () => {
    withObjectUrls();
    eventsApi.fetchTicketImage.mockRejectedValue(Object.assign(new Error("Forbidden"), { response: { status: 403 } }));
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(screen.getByLabelText("QR code for ticket MOA77")).toBeInTheDocument();
  });

  it("falls back where the browser can make no object URL at all", async () => {
    eventsApi.fetchTicketImage.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(screen.getByLabelText("QR code for ticket MOA77")).toBeInTheDocument();
  });

  it("tells the holder to show the ticket at the venue, not to generate it", async () => {
    eventsApi.fetchTicketImage.mockResolvedValue(null);
    open();
    await screen.findByRole("heading", { level: 1, name: "Hack Night 04" });
    expect(screen.getByText(SHOW_AT_VENUE)).toBeInTheDocument();
    expect(screen.queryByText(/Generate this ticket at the venue/)).toBeNull();
  });
});

describe("a called-off event", () => {
  it("drops the rendered design once it knows: no QR of any kind, whichever way it would have come", async () => {
    withObjectUrls();
    discoverApi.event.mockResolvedValueOnce({
      event: { id: 68, slug: "hack-night-04", status: "cancelled", cancellation: { reason: "The venue flooded.", cancelled_at: "2026-10-12T10:00:00+05:30" } },
    });
    eventsApi.fetchTicketDetails.mockResolvedValue(ticket());
    // The server would gladly draw one -- it carries a QR, and a cancelled
    // ticket must show none.
    eventsApi.fetchTicketImage.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    open();
    expect(await screen.findByText("This event was cancelled")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("img", { name: /as the club designed it/i })).toBeNull());
    expect(screen.queryByLabelText("Loading your ticket")).toBeNull();
    expect(screen.queryByLabelText("QR code for ticket MOA77")).toBeNull();
    expect(document.querySelector(".qr-section--void")).toBeInTheDocument();
  });
});
